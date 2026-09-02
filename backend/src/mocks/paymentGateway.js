/**
 * Mock payment gateway, shaped like Razorpay's order → checkout → verify flow
 * so swapping in real test-mode keys later is a drop-in change.
 *
 * Orders are stateless: the order id carries a signed payload, so the server can
 * verify the amount at capture time without a database round-trip and without
 * trusting anything the browser sends back.
 */
import crypto from 'node:crypto';
import env from '../config/env.js';

const secret = () => `${env.jwt.secret}:payments`;

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const sign = (value) => crypto.createHmac('sha256', secret()).update(value).digest('hex');

/**
 * Creates a mock order.
 * @returns {{orderId:string, amount:number, currency:string, keyId:string, createdAt:string}}
 */
export function createOrder({ amount, loanAccountId, purpose = 'emi' }) {
  const value = Number(amount);
  if (!(value > 0)) throw new Error('Order amount must be greater than zero.');

  const payload = b64url(
    JSON.stringify({
      amt: Math.round(value * 100), // paise, like a real gateway
      loan: String(loanAccountId),
      purpose,
      ts: Date.now(),
      nonce: crypto.randomBytes(6).toString('hex'),
    })
  );

  const orderId = `order_mock_${payload}.${sign(payload).slice(0, 32)}`;

  return {
    orderId,
    amount: Math.round(value * 100),
    amountInRupees: value,
    currency: 'INR',
    keyId: 'rzp_test_mock_sedbank',
    purpose,
    createdAt: new Date().toISOString(),
    provider: 'mock-gateway',
  };
}

/** Parses and authenticates an order id, returning its payload. */
export function decodeOrder(orderId) {
  const raw = String(orderId || '');
  if (!raw.startsWith('order_mock_')) return null;

  const [payload, signature] = raw.slice('order_mock_'.length).split('.');
  if (!payload || !signature) return null;
  if (sign(payload).slice(0, 32) !== signature) return null;

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Simulates the customer completing checkout. In a real integration the gateway
 * SDK produces these values in the browser; here the sandbox mints them.
 */
export function simulateCheckout(orderId, { fail = false } = {}) {
  const paymentId = `pay_mock_${crypto.randomBytes(8).toString('hex')}`;
  return {
    orderId,
    paymentId,
    signature: sign(`${orderId}|${paymentId}`),
    status: fail ? 'failed' : 'captured',
  };
}

/** Server-side capture verification — the HMAC check a real integration performs. */
export function verifyPayment({ orderId, paymentId, signature }) {
  const order = decodeOrder(orderId);
  if (!order) return { verified: false, reason: 'Unknown or tampered order reference.' };

  const expected = sign(`${orderId}|${paymentId}`);
  const provided = String(signature || '');

  // Constant-time compare to avoid leaking the signature through timing.
  const ok =
    expected.length === provided.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));

  if (!ok) return { verified: false, reason: 'Payment signature verification failed.' };

  return {
    verified: true,
    amount: order.amt / 100,
    loanAccountId: order.loan,
    purpose: order.purpose,
    paymentId,
    capturedAt: new Date().toISOString(),
    provider: 'mock-gateway',
  };
}

export default { createOrder, decodeOrder, simulateCheckout, verifyPayment };
