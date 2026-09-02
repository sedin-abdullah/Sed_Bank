/**
 * Jest with native ESM. The `npm test` script sets
 * NODE_OPTIONS=--experimental-vm-modules so `import` works without Babel.
 */
export default {
  testEnvironment: 'node',
  // Let Jest resolve the .js extensions used in ESM import specifiers.
  transform: {},
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['src/utils/**/*.js', 'src/services/**/*.js', 'src/mocks/**/*.js'],
  coverageReporters: ['text-summary', 'lcov'],
  testTimeout: 20000,
  verbose: false,
};
