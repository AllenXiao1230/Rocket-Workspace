import { execFileSync } from "node:child_process";

const databaseName = process.env.TEST_DATABASE_NAME || "rocket_workspace_test";
if (!/^[a-z][a-z0-9_]{0,62}$/.test(databaseName))
  throw new Error("TEST_DATABASE_NAME must be a safe PostgreSQL identifier");

const compose = (args) =>
  execFileSync("docker", ["compose", ...args], { stdio: "inherit" });

// This script only creates and migrates the isolated test database. It never
// resets, drops, or writes to the application's configured DATABASE_URL.
compose([
  "exec",
  "-T",
  "-e",
  `TEST_DATABASE_NAME=${databaseName}`,
  "postgres",
  "sh",
  "-ec",
  'if [ "$(psql -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = \'$TEST_DATABASE_NAME\'")" != "1" ]; then createdb -U "$POSTGRES_USER" "$TEST_DATABASE_NAME"; fi',
]);
compose([
  "run",
  "--rm",
  ...(process.env.SKIP_INTEGRATION_IMAGE_BUILD === "1" ? [] : ["--build"]),
  "--no-deps",
  "-e",
  `TEST_DATABASE_NAME=${databaseName}`,
  "app",
  "sh",
  "-ec",
  "test_url=$(node -e 'const url = new URL(process.env.DATABASE_URL); url.pathname = `/${process.env.TEST_DATABASE_NAME}`; process.stdout.write(url.toString())'); DATABASE_URL=\"$test_url\" pnpm prisma migrate deploy",
]);

console.log(`Integration database ${databaseName} is ready.`);
