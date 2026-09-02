/**
 * Demo account provisioning, shared by the `npm run seed` CLI and by server
 * boot.
 *
 * Business data is never created here — only login accounts. Every list,
 * table and dashboard starts empty, exactly as the data policy requires.
 *
 * Boot-time seeding matters because the zero-setup mode runs an in-process
 * MongoDB: a separate `npm run seed` process would seed its own throwaway
 * database, so the API seeds itself instead. Against a real MONGO_URI the two
 * paths share a cluster and boot seeding is skipped unless asked for.
 */
import User from '../models/User.js';
import Config from '../models/Config.js';
import env from './env.js';
import logger from '../utils/logger.js';
import { ROLES, USER_STATUS } from '../constants/index.js';

/** The five demo logins, one per role. Clearly marked as test data. */
export const DEMO_ACCOUNTS = [
  {
    name: 'Demo Admin',
    email: env.seed.adminEmail,
    mobile: '9000000001',
    role: ROLES.ADMIN,
    password: env.seed.adminPassword,
  },
  {
    name: 'Demo Credit Officer',
    email: 'credit@sedbank.test',
    mobile: '9000000002',
    role: ROLES.CREDIT_OFFICER,
    password: env.seed.staffPassword,
  },
  {
    name: 'Demo Ops Officer',
    email: 'ops@sedbank.test',
    mobile: '9000000003',
    role: ROLES.OPS_OFFICER,
    password: env.seed.staffPassword,
  },
  {
    name: 'Demo Collections Officer',
    email: 'collections@sedbank.test',
    mobile: '9000000004',
    role: ROLES.COLLECTIONS_OFFICER,
    password: env.seed.staffPassword,
  },
  {
    name: 'Demo Customer',
    email: env.seed.customerEmail,
    mobile: '9000000005',
    role: ROLES.CUSTOMER,
    password: env.seed.customerPassword,
  },
];

/**
 * Creates any missing demo account. Idempotent.
 * @param {boolean} [force] also reset passwords on accounts that already exist
 * @returns {Promise<Array<{email:string, role:string, action:string}>>}
 */
export async function ensureDemoAccounts({ force = false } = {}) {
  await Config.getSingleton();

  const summary = [];

  for (const account of DEMO_ACCOUNTS) {
    // eslint-disable-next-line no-await-in-loop -- five sequential writes, once
    const existing = await User.findOne({ email: account.email });

    if (existing && !force) {
      summary.push({ email: account.email, role: account.role, action: 'kept' });
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const passwordHash = await User.hashPassword(account.password);

    if (existing) {
      existing.passwordHash = passwordHash;
      existing.status = USER_STATUS.ACTIVE;
      existing.isDemo = true;
      // eslint-disable-next-line no-await-in-loop
      await existing.save();
      summary.push({ email: account.email, role: account.role, action: 'password reset' });
    } else {
      // eslint-disable-next-line no-await-in-loop
      await User.create({
        name: account.name,
        email: account.email,
        mobile: account.mobile,
        role: account.role,
        passwordHash,
        status: USER_STATUS.ACTIVE,
        mobileVerified: true,
        isDemo: true,
      });
      summary.push({ email: account.email, role: account.role, action: 'created' });
    }
  }

  return summary;
}

/**
 * Boot hook: seeds automatically when the database is the ephemeral in-memory
 * one (nothing would exist otherwise), or when SEED_ON_BOOT is set explicitly.
 */
export async function bootstrapDemoData() {
  const shouldSeed = env.useMemoryDb || process.env.SEED_ON_BOOT === 'true';
  if (!shouldSeed) return null;

  const summary = await ensureDemoAccounts();
  const created = summary.filter((row) => row.action === 'created').length;

  if (created) {
    logger.info(`Seeded ${created} demo login account(s). Business data left empty by design.`);
    summary
      .filter((row) => row.action === 'created')
      .forEach((row) => logger.info(`  ${row.role.padEnd(22)} ${row.email}`));
  }

  return summary;
}

export default { DEMO_ACCOUNTS, ensureDemoAccounts, bootstrapDemoData };
