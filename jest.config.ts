import type { Config } from "jest";

// Two-pass test runner. Most tests run in jest's default CJS mode (the suite
// relies on `__dirname`). A few depend on ESM-only packages (unpdf → pdf.js,
// which uses `import.meta` and cannot be transpiled to CJS); those live under
// tests/pdf/ and run in a SECOND pass with `--experimental-vm-modules`, gated by
// ESM_TESTS. `npm test` runs both passes; see package.json.
const esmOnly = !!process.env.ESM_TESTS;

const config: Config = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  testMatch: esmOnly
    ? ["**/tests/pdf/**/*.test.ts"]
    : ["**/tests/**/*.test.ts"],
  testPathIgnorePatterns: esmOnly
    ? []
    : [
        "<rootDir>/tests/pdf/", // ESM-only deps — run in the ESM_TESTS pass
        ...(process.env.TEST_ALL ? [] : ["<rootDir>/tests/scripts.test.ts"]),
      ],
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.[tj]s$": ["ts-jest", { tsconfig: "tsconfig.test.json", useESM: true }],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};

export default config;
