/** Tiny level-aware logger — keeps output quiet during Jest runs. */
const silent = process.env.NODE_ENV === 'test' && process.env.LOG_LEVEL !== 'debug';

const stamp = () => new Date().toISOString();

const logger = {
  info: (...args) => !silent && console.log(`[${stamp()}] INFO `, ...args),
  warn: (...args) => !silent && console.warn(`[${stamp()}] WARN `, ...args),
  error: (...args) => console.error(`[${stamp()}] ERROR`, ...args),
  debug: (...args) => process.env.LOG_LEVEL === 'debug' && console.log(`[${stamp()}] DEBUG`, ...args),
};

export default logger;
