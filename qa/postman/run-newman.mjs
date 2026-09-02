/**
 * Headless API regression run (Newman — free, open-source Postman CLI).
 *
 * By default this boots a throwaway API on its own port with an in-memory
 * database, runs the collection against it, and shuts it down again — so
 * `npm run test:api` works on a clean checkout with no services running.
 *
 * Usage:
 *   npm run test:api                                  # self-hosted, ephemeral API
 *   npm run test:api -- --base-url http://localhost:5000   # an API you already run
 *   npm run test:api -- --env qa/postman/SedBank.render.postman_environment.json
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import newman from 'newman';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const COLLECTION = path.join(__dirname, 'SedBank.postman_collection.json');
const REPORT_DIR = path.join(repoRoot, 'qa', 'reports');

/** Minimal argv parsing — no dependency needed for three flags. */
const argv = process.argv.slice(2);
const flag = (name) => {
  const index = argv.indexOf(`--${name}`);
  return index !== -1 ? argv[index + 1] : undefined;
};

const PORT = flag('port') || process.env.NEWMAN_API_PORT || '5200';
const externalBaseUrl = flag('base-url') || process.env.NEWMAN_BASE_URL;
const baseUrl = externalBaseUrl || `http://127.0.0.1:${PORT}`;
const envFile = flag('env');

const log = (message) => console.log(`[newman] ${message}`);

/** Boots the API with test hooks on, and resolves once /api/health answers. */
async function startApi() {
  log(`Starting a temporary API on port ${PORT} (in-memory database)…`);

  const child = spawn('node', ['src/server.js'], {
    cwd: path.join(repoRoot, 'backend'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT,
      // Ephemeral database: the run starts from a clean slate every time.
      USE_MEMORY_DB: 'true',
      MONGO_URI: '',
      JWT_SECRET: 'newman-api-regression-secret',
      // The collection drives the bureau simulation and the back-dating hook.
      ENABLE_TEST_HOOKS: 'true',
      EXPOSE_OTP: 'true',
      DELINQUENCY_SWEEP_MINUTES: '0',
      LOG_LEVEL: 'warn',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    const line = String(chunk).trim();
    if (line) console.log(`  api | ${line}`);
  });
  child.stderr.on('data', (chunk) => {
    const line = String(chunk).trim();
    if (line) console.error(`  api | ${line}`);
  });

  // mongodb-memory-server may need to download a binary on a cold machine.
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`The API exited early with code ${child.exitCode}.`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        log('API is ready.');
        return child;
      }
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  child.kill('SIGTERM');
  throw new Error('Timed out waiting for the API to become healthy.');
}

function runCollection() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  return new Promise((resolve, reject) => {
    newman.run(
      {
        collection: COLLECTION,
        ...(envFile ? { environment: path.resolve(repoRoot, envFile) } : {}),
        // The collection's baseUrl is overridden so one file serves every target.
        envVar: [{ key: 'baseUrl', value: baseUrl }],
        // Resolves the relative fixture path in the document-upload request.
        workingDir: __dirname,
        insecureFileRead: false,
        reporters: ['cli', 'json'],
        reporter: {
          cli: { noBanner: true },
          json: { export: path.join(REPORT_DIR, 'newman-report.json') },
        },
        // The collection is an ordered regression run; one failure invalidates
        // everything downstream, so stop rather than cascade misleading errors.
        bail: false,
        timeoutRequest: 30_000,
      },
      (error, summary) => {
        if (error) return reject(error);
        return resolve(summary);
      }
    );
  });
}

(async () => {
  let api = null;

  try {
    if (externalBaseUrl) {
      log(`Running against the existing API at ${baseUrl}.`);
    } else {
      api = await startApi();
    }

    log(`Running ${path.basename(COLLECTION)}…`);
    const summary = await runCollection();

    const { requests, assertions } = summary.run.stats;
    const failures = summary.run.failures ?? [];

    console.log('');
    log(`Requests:   ${requests.total} executed, ${requests.failed} failed`);
    log(`Assertions: ${assertions.total} executed, ${assertions.failed} failed`);
    log(`Report:     qa/reports/newman-report.json`);

    if (failures.length) {
      console.log('');
      log('Failures:');
      failures.forEach((failure, index) => {
        const source = failure.source?.name ?? 'unknown request';
        console.log(`  ${index + 1}. ${source} — ${failure.error?.message ?? 'assertion failed'}`);
      });
      process.exitCode = 1;
    } else {
      console.log('');
      log('All API assertions passed.');
    }
  } catch (error) {
    console.error(`[newman] Run failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (api) {
      log('Stopping the temporary API…');
      api.kill('SIGTERM');
      // Give the in-memory MongoDB a moment to shut down cleanly.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (api.exitCode === null) api.kill('SIGKILL');
    }
  }
})();
