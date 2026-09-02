/**
 * Seed script — demo LOGIN ACCOUNTS ONLY.
 *
 * Per the data policy this creates no business data: no applications, no loans,
 * no payments. Every list and dashboard stays empty until someone acts in the
 * app. Accounts are flagged `isDemo` so the UI can label them as test data.
 *
 * Usage:  npm run seed              (idempotent — safe to re-run)
 *         npm run seed -- --force   (also resets the demo passwords)
 *
 * Note: with no MONGO_URI the API runs an in-process database, so this script
 * would seed its own throwaway copy. In that mode the server seeds itself on
 * boot and running this is unnecessary — it will warn if you do.
 */
import mongoose from 'mongoose';
import env from '../src/config/env.js';
import logger from '../src/utils/logger.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { ensureDemoAccounts } from '../src/config/bootstrap.js';
import User from '../src/models/User.js';

const force = process.argv.includes('--force');

async function seed() {
  await connectDatabase();

  if (env.useMemoryDb) {
    logger.warn(
      'No MONGO_URI set — this seeds a temporary in-memory database that disappears ' +
        'when this script exits. The API seeds the same accounts on boot, so this run ' +
        'is a no-op. Point MONGO_URI at a MongoDB Atlas cluster to seed persistently.'
    );
  }

  const summary = await ensureDemoAccounts({ force });

  const counts = {
    users: await User.countDocuments({}),
    applications: await mongoose.connection.db.collection('loanapplications').countDocuments(),
    loans: await mongoose.connection.db.collection('loanaccounts').countDocuments(),
  };

  logger.info('--- SedBank demo accounts ---');
  summary.forEach((row) =>
    logger.info(`  ${row.action.padEnd(15)} ${row.role.padEnd(22)} ${row.email}`)
  );
  logger.info('-----------------------------');
  logger.info(`Admin password:    ${env.seed.adminPassword}`);
  logger.info(`Customer password: ${env.seed.customerPassword}`);
  logger.info(`Staff password:    ${env.seed.staffPassword}`);
  logger.info(
    `Business data intentionally empty: ${counts.applications} applications, ${counts.loans} loans, ${counts.users} users.`
  );

  await disconnectDatabase();
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('Seeding failed:', error);
    process.exit(1);
  });
