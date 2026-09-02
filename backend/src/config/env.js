/**
 * Centralised, environment-driven configuration.
 * Nothing in the codebase should read `process.env` directly — import from here
 * so defaults, coercion and validation live in exactly one place.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..', '..');

dotenv.config({ path: path.join(backendRoot, '.env') });

const bool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',

  port: num(process.env.PORT, 5000),
  backendRoot,

  /**
   * Mongo connection string. When absent (or USE_MEMORY_DB=true) the app boots an
   * in-process mongodb-memory-server instance so the project runs with zero setup.
   * Production/staging should always point at a MongoDB Atlas free cluster.
   */
  mongoUri: process.env.MONGO_URI || '',
  useMemoryDb: bool(process.env.USE_MEMORY_DB, !process.env.MONGO_URI),

  jwt: {
    secret: process.env.JWT_SECRET || 'sedbank-dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  },

  // Comma separated list of allowed browser origins.
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  uploadDir: process.env.UPLOAD_DIR || path.join(backendRoot, 'uploads'),
  maxUploadMb: num(process.env.MAX_UPLOAD_MB, 5),

  /** Mocked OTP is returned in API responses in non-production so QA can automate it. */
  exposeOtp: bool(process.env.EXPOSE_OTP, process.env.NODE_ENV !== 'production'),
  otpTtlMinutes: num(process.env.OTP_TTL_MINUTES, 10),

  /** Test-only hooks (date back-dating, data reset). Never enable in production. */
  enableTestHooks: bool(process.env.ENABLE_TEST_HOOKS, process.env.NODE_ENV !== 'production'),

  /** Background delinquency sweep interval. 0 disables the timer. */
  delinquencySweepMinutes: num(process.env.DELINQUENCY_SWEEP_MINUTES, 15),

  smtp: {
    enabled: bool(process.env.SMTP_ENABLED, false),
    host: process.env.SMTP_HOST || '',
    port: num(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'SedBank (Demo) <no-reply@sedbank.test>',
  },

  seed: {
    adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@sedbank.test',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@12345',
    customerEmail: process.env.SEED_CUSTOMER_EMAIL || 'customer@sedbank.test',
    customerPassword: process.env.SEED_CUSTOMER_PASSWORD || 'Customer@12345',
    staffPassword: process.env.SEED_STAFF_PASSWORD || 'Staff@12345',
  },
};

if (env.isProd && env.jwt.secret === 'sedbank-dev-secret-change-me') {
  // Fail fast rather than shipping a well-known signing key.
  throw new Error('JWT_SECRET must be set to a strong unique value in production.');
}

export default env;
