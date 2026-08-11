import { execFileSync } from "node:child_process";

const databaseName = process.env.TEST_DATABASE_NAME || "rocket_workspace_test";
if (!/^[a-z][a-z0-9_]{0,62}$/.test(databaseName))
  throw new Error("TEST_DATABASE_NAME must be a safe PostgreSQL identifier");

execFileSync(
  "docker",
  [
    "compose",
    "run",
    "--rm",
    "--build",
    "--no-deps",
    "-e",
    `TEST_DATABASE_NAME=${databaseName}`,
    "app",
    "sh",
    "-ec",
    "test_url=$(node -e 'const url = new URL(process.env.DATABASE_URL); url.pathname = `/${process.env.TEST_DATABASE_NAME}`; process.stdout.write(url.toString())'); DATABASE_URL=\"$test_url\" RUN_DATABASE_INTEGRATION=1 pnpm vitest run --config vitest.integration.config.mts",
  ],
  { stdio: "inherit" },
);
