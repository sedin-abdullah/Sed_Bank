/**
 * Collections: ageing overview, delinquent account worklist, follow-up notes
 * and bulk (mocked) reminder dispatch.
 *
 * Every read refreshes delinquency first, so ageing is never stale even if the
 * background sweep has not run since the last due date passed.
 */
import LoanAccount from '../models/LoanAccount.js';
import CollectionNote from '../models/CollectionNote.js';
import EMISchedule from '../models/EMISchedule.js';
import ApiError from '../utils/ApiError.js';
import { LIVE_LOAN_STATUSES, EMI_STATUS } from '../constants/index.js';
import { DELINQUENCY_BUCKETS, round2 } from '../utils/emi.js';
import { refreshAllDelinquency } from './loanService.js';
import { recordAudit } from './auditService.js';
import { notifyUser } from './notificationService.js';
import { broadcastDataChange } from '../realtime/socket.js';

/** Portfolio ageing summary — one row per bucket, plus portfolio totals. */
export async function getOverview() {
  await refreshAllDelinquency();

  const grouped = await LoanAccount.aggregate([
    { $match: { status: { $in: LIVE_LOAN_STATUSES } } },
    {
      $group: {
        _id: '$bucket',
        accounts: { $sum: 1 },
        overdueAmount: { $sum: '$overdueAmount' },
        principalOutstanding: { $sum: '$principalOutstanding' },
      },
    },
  ]);

  const byBucket = Object.fromEntries(grouped.map((row) => [row._id, row]));

  const buckets = DELINQUENCY_BUCKETS.map((bucket) => ({
    bucket,
    label:
      bucket === 'current'
        ? 'Current'
        : bucket === '90+'
          ? '90+ days'
          : `${bucket} days`,
    accounts: byBucket[bucket]?.accounts ?? 0,
    overdueAmount: round2(byBucket[bucket]?.overdueAmount ?? 0),
    principalOutstanding: round2(byBucket[bucket]?.principalOutstanding ?? 0),
  }));

  const delinquent = buckets.filter((b) => b.bucket !== 'current');

  return {
    buckets,
    totals: {
      delinquentAccounts: delinquent.reduce((sum, b) => sum + b.accounts, 0),
      totalOverdue: round2(delinquent.reduce((sum, b) => sum + b.overdueAmount, 0)),
      portfolioOutstanding: round2(
        buckets.reduce((sum, b) => sum + b.principalOutstanding, 0)
      ),
      currentAccounts: buckets.find((b) => b.bucket === 'current')?.accounts ?? 0,
    },
  };
}

/** Delinquent account worklist, optionally narrowed to one ageing bucket. */
export async function listDelinquentAccounts({ bucket = 'all', search = '', page = 1, limit = 20 }) {
  await refreshAllDelinquency();

  const query = { status: { $in: LIVE_LOAN_STATUSES } };

  if (bucket && bucket !== 'all') query.bucket = bucket;
  else query.bucket = { $ne: 'current' };

  if (search) query.loanNo = { $regex: search, $options: 'i' };

  const [items, total] = await Promise.all([
    LoanAccount.find(query)
      .populate('borrower', 'name email mobile')
      .sort({ dpd: -1, overdueAmount: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    LoanAccount.countDocuments(query),
  ]);

  // Attach the oldest unpaid installment so officers see what to chase.
  const withDetail = await Promise.all(
    items.map(async (loan) => {
      const oldest = await EMISchedule.findOne({
        loanAccount: loan._id,
        status: { $in: [EMI_STATUS.OVERDUE, EMI_STATUS.PARTIALLY_PAID] },
      })
        .sort({ installmentNo: 1 })
        .lean();

      const lastNote = await CollectionNote.findOne({ loanAccount: loan._id })
        .sort({ createdAt: -1 })
        .lean();

      return {
        ...loan,
        oldestOverdue: oldest
          ? { installmentNo: oldest.installmentNo, dueDate: oldest.dueDate, dpd: oldest.dpd }
          : null,
        lastContactedAt: lastNote?.createdAt ?? null,
        lastOutcome: lastNote?.outcome ?? null,
      };
    })
  );

  return { items: withDetail, total };
}

export async function addNote({ loanId, payload, actor, ip = '' }) {
  const loan = await LoanAccount.findById(loanId);
  if (!loan) throw ApiError.notFound('Loan account not found.');

  const note = await CollectionNote.create({
    loanAccount: loan._id,
    borrower: loan.borrower,
    activityType: payload.activityType,
    outcome: payload.outcome,
    notes: payload.notes,
    promiseToPayDate: payload.promiseToPayDate || null,
    followUpDate: payload.followUpDate || null,
    bucketAtEntry: loan.bucket,
    dpdAtEntry: loan.dpd,
    createdBy: actor._id,
    createdByName: actor.name,
  });

  await recordAudit({
    entity: 'LoanAccount',
    entityId: loan._id,
    action: 'collections.noteAdded',
    description: `${payload.activityType} logged on ${loan.loanNo} — outcome: ${payload.outcome}`,
    actor,
    meta: { noteId: String(note._id) },
    ip,
  });

  broadcastDataChange(['collections']);
  return note;
}

export const listNotes = (loanId) =>
  CollectionNote.find({ loanAccount: loanId }).sort({ createdAt: -1 }).lean();

/**
 * Bulk reminder dispatch over the mocked email/SMS channel.
 * Returns a per-loan result so the UI can report partial success honestly.
 */
export async function sendReminders({ loanIds, message = '', actor, ip = '' }) {
  const loans = await LoanAccount.find({ _id: { $in: loanIds } }).populate(
    'borrower',
    'name email mobile'
  );

  if (!loans.length) throw ApiError.badRequest('No matching loan accounts were found.');

  const results = [];

  for (const loan of loans) {
    const body =
      message ||
      `Dear ${loan.borrower?.name || 'customer'}, an amount of ₹${loan.overdueAmount.toLocaleString('en-IN')} is overdue on loan ${loan.loanNo} (${loan.dpd} days past due). Please pay at your earliest convenience to avoid further charges.`;

    // eslint-disable-next-line no-await-in-loop -- keeps the free-tier mailer sequential
    await notifyUser({
      userId: loan.borrower?._id ?? loan.borrower,
      title: 'Payment reminder',
      message: body,
      type: 'warning',
      category: 'collections',
      link: `/app/loans/${loan._id}`,
      alsoEmail: true,
    });

    // eslint-disable-next-line no-await-in-loop
    await recordAudit({
      entity: 'LoanAccount',
      entityId: loan._id,
      action: 'collections.reminderSent',
      description: `Payment reminder sent for ${loan.loanNo}`,
      actor,
      ip,
    });

    results.push({ loanId: String(loan._id), loanNo: loan.loanNo, sent: true });
  }

  broadcastDataChange(['collections']);
  return { sent: results.length, results };
}

export default { getOverview, listDelinquentAccounts, addNote, listNotes, sendReminders };
