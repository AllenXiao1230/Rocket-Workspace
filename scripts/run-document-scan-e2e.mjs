import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const databaseName = `rocket_workspace_e2e_${process.pid}`;
const port = 3100;
const baseUrl = `http://127.0.0.1:${port}`;
const adminEmail = "document-scan-e2e@example.test";
const adminPassword = "document-scan-e2e-password";
const authSecret = "document-scan-e2e-auth-secret-at-least-32-chars";
const contentRoot = await mkdtemp(path.join(tmpdir(), "rocket-document-scan-e2e-"));
let containerId = "";
let databasePrepared = false;

const run = (command, args, options = {}) =>
  execFileSync(command, args, { stdio: "inherit", ...options });
const capture = (command, args) =>
  execFileSync(command, args, { encoding: "utf8" }).trim();

async function waitForApp() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health/live`);
      if (response.ok) return;
    } catch {
      // The temporary app is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("Timed out waiting for the isolated E2E app");
}

try {
  run("node", ["scripts/prepare-integration-db.mjs"], {
    env: {
      ...process.env,
      TEST_DATABASE_NAME: databaseName,
      SKIP_INTEGRATION_IMAGE_BUILD: process.env.E2E_REUSE_IMAGE === "1" ? "1" : "0",
    },
  });
  databasePrepared = true;
  containerId = capture("docker", [
    "compose",
    "run",
    "--rm",
    "-d",
    "--no-deps",
    "-p",
    `127.0.0.1:${port}:${port}`,
    "-e",
    `TEST_DATABASE_NAME=${databaseName}`,
    "-e",
    `PORT=${port}`,
    "-e",
    `NEXTAUTH_URL=${baseUrl}`,
    "-e",
    "AUTH_TRUST_HOST=true",
    "-e",
    `AUTH_SECRET=${authSecret}`,
    "-e",
    `BOOTSTRAP_ADMIN_EMAIL=${adminEmail}`,
    "-e",
    `BOOTSTRAP_ADMIN_PASSWORD=${adminPassword}`,
    "-v",
    `${contentRoot}:/workspace-data`,
    "app",
    "sh",
    "-ec",
    "test_url=$(node -e 'const url = new URL(process.env.DATABASE_URL); url.pathname = `/${process.env.TEST_DATABASE_NAME}`; process.stdout.write(url.toString())'); export DATABASE_URL=\"$test_url\" WORKSPACE_CONTENT_DIR=/workspace-data; pnpm db:seed; exec pnpm start",
  ]);
  await waitForApp();

  await new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["playwright", "test", "e2e/external-markdown-scan.spec.ts"],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          E2E_BASE_URL: baseUrl,
          E2E_MUTATION_TESTS: "1",
          E2E_ADMIN_EMAIL: adminEmail,
          E2E_ADMIN_PASSWORD: adminPassword,
          E2E_WORKSPACE_CONTENT_DIR: contentRoot,
        },
      },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve(undefined) : reject(new Error(`Playwright exited ${code}`)),
    );
  });
} finally {
  if (containerId) run("docker", ["stop", containerId]);
  if (databasePrepared)
    run("docker", [
      "compose",
      "exec",
      "-T",
      "-e",
      `TEST_DATABASE_NAME=${databaseName}`,
      "postgres",
      "sh",
      "-ec",
      'dropdb --if-exists -U "$POSTGRES_USER" "$TEST_DATABASE_NAME"',
    ]);
  await rm(contentRoot, { recursive: true, force: true });
}
