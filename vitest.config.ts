import { defineConfig } from "vitest/config";

/**
 * One project per workspace package.
 *
 * `development` resolves a workspace package to its `src`, so a test run does not
 * depend on a prior build. The condition is declared in each package's `exports`,
 * which is also what lets a consumer pin a dist build.
 */
export default defineConfig({
  resolve: {
    conditions: ["development", "import", "default"],
  },
  test: {
    testTimeout: 15_000,
    projects: [
      {
        test: {
          name: "contract",
          environment: "node",
          include: ["packages/go/src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "app",
          environment: "node",
          include: ["apps/go/src/**/*.test.ts", "apps/go/src/**/*.test.tsx"],
        },
      },
    ],
  },
});
