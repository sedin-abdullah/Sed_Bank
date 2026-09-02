/** Collections: ageing overview, delinquent worklist, notes and reminders. */
import asyncHandler from '../utils/asyncHandler.js';
import { ok, created, paginated, getQuery } from '../utils/http.js';
import collectionsService from '../services/collectionsService.js';

export const overview = asyncHandler(async (req, res) =>
  ok(res, await collectionsService.getOverview())
);

export const accounts = asyncHandler(async (req, res) => {
  const { page, limit, bucket, search } = getQuery(req);
  const { items, total } = await collectionsService.listDelinquentAccounts({
    bucket,
    search,
    page,
    limit,
  });
  return paginated(res, items, { page, limit, total });
});

export const addNote = asyncHandler(async (req, res) =>
  created(res, {
    note: await collectionsService.addNote({
      loanId: req.params.loanId,
      payload: req.body,
      actor: req.user,
      ip: req.ip,
    }),
  })
);

export const listNotes = asyncHandler(async (req, res) =>
  ok(res, { notes: await collectionsService.listNotes(req.params.loanId) })
);

export const sendReminders = asyncHandler(async (req, res) =>
  ok(
    res,
    await collectionsService.sendReminders({
      loanIds: req.body.loanIds,
      message: req.body.message,
      actor: req.user,
      ip: req.ip,
    })
  )
);

export default { overview, accounts, addNote, listNotes, sendReminders };
