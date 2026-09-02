/**
 * Mock SMS + email channel.
 *
 * Email goes through Nodemailer when SMTP_ENABLED=true (a free Mailtrap sandbox
 * or Gmail app password works); otherwise every message is console-logged and
 * kept in a small in-memory outbox that the test hooks can assert against.
 * SMS is always simulated — no paid vendor is used anywhere.
 */
import nodemailer from 'nodemailer';
import env from '../config/env.js';
import logger from '../utils/logger.js';

/** Ring buffer of recently "sent" messages, useful for QA and the demo UI. */
const OUTBOX_LIMIT = 200;
const outbox = [];

const remember = (entry) => {
  outbox.unshift({ ...entry, at: new Date().toISOString() });
  if (outbox.length > OUTBOX_LIMIT) outbox.pop();
  return entry;
};

let transporter = null;
function getTransporter() {
  if (!env.smtp.enabled) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return transporter;
}

export async function sendEmail({ to, subject, text, html }) {
  const entry = { channel: 'email', to, subject, body: text || html || '' };

  const tx = getTransporter();
  if (!tx) {
    logger.info(`[MOCK EMAIL] to=${to} subject="${subject}"`);
    return remember({ ...entry, delivered: false, simulated: true });
  }

  try {
    await tx.sendMail({ from: env.smtp.from, to, subject, text, html });
    return remember({ ...entry, delivered: true, simulated: false });
  } catch (error) {
    // Never let a mail failure break a business transaction.
    logger.error(`Email delivery failed for ${to}: ${error.message}`);
    return remember({ ...entry, delivered: false, simulated: false, error: error.message });
  }
}

export async function sendSms({ to, message }) {
  logger.info(`[MOCK SMS] to=${to} message="${message}"`);
  return remember({ channel: 'sms', to, body: message, delivered: false, simulated: true });
}

/** Fire-and-forget on both channels; used for status-change confirmations. */
export async function notify({ email, mobile, subject, message }) {
  const jobs = [];
  if (email) jobs.push(sendEmail({ to: email, subject, text: message }));
  if (mobile) jobs.push(sendSms({ to: mobile, message: `${subject}. ${message}` }));
  return Promise.all(jobs);
}

export const getOutbox = (limit = 50) => outbox.slice(0, limit);
export const clearOutbox = () => outbox.splice(0, outbox.length);

export default { sendEmail, sendSms, notify, getOutbox, clearOutbox };
