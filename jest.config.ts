import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'jest-environment-jsdom',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', tsx: true },
          transform: { react: { runtime: 'automatic' } },
        },
      },
    ],
  },
  // cel-js and its parser, chevrotain, ship as ES modules only.
  transformIgnorePatterns: ['/node_modules/(?!(@patternfly|cel-js|chevrotain|@chevrotain|lodash-es)/)'],
  moduleNameMapper: {
    '^.+\\.(css|sass|scss)$': '<rootDir>/__mocks__/styleMock.ts',
    '@openshift-console/(.*)': '<rootDir>/__mocks__/dynamic-plugin-sdk.ts',
    'react-i18next': '<rootDir>/__mocks__/react-i18next.ts',
    // chevrotain only declares an "import" export, which Jest's require resolution ignores.
    '^chevrotain$': '<rootDir>/node_modules/chevrotain/lib/src/api.js',
    '^@chevrotain/(.*)$': '<rootDir>/node_modules/@chevrotain/$1/lib/src/api.js',
  },
  modulePaths: ['<rootDir>'],
  roots: ['<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/setupTests.ts'],
  testTimeout: 30000,
};

export default config;
