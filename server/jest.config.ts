import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    '**/*.ts',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/*.test.ts',
    '!**/db/migrate.ts',
    '!**/db/seed.ts',
  ],
  coverageThreshold: {
    global: { lines: 60 },
  },
};

export default config;
