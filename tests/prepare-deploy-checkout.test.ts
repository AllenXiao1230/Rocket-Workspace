import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.resolve(
  import.meta.dirname,
  "..",
  "scripts",
  "prepare-deploy-checkout.sh",
);

function git(directory: string, ...arguments_: string[]) {
  return execFileSync("git", arguments_, { cwd: directory, encoding: "utf8" }).trim();
}

function createRepository() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "rocket-deploy-checkout-"));
  git(directory, "init", "--initial-branch=main");
  git(directory, "config", "user.email", "tests@example.invalid");
  git(directory, "config", "user.name", "Deployment tests");
  writeFileSync(path.join(directory, "tracked.txt"), "baseline\n");
  git(directory, "add", "tracked.txt");
  git(directory, "commit", "-m", "baseline");
  git(directory, "switch", "-c", "feature");
  return directory;
}

function runBootstrap(directory: string) {
  return spawnSync("bash", [script, directory, "main"], {
    cwd: directory,
    encoding: "utf8",
  });
}

describe("production deployment checkout bootstrap", () => {
  it("restores a clean feature checkout to the deployment branch", () => {
    const directory = createRepository();

    try {
      const result = runBootstrap(directory);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        "Restoring deployment checkout from feature to main.",
      );
      expect(git(directory, "branch", "--show-current")).toBe("main");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("refuses to switch away from a checkout with tracked changes", () => {
    const directory = createRepository();

    try {
      writeFileSync(path.join(directory, "tracked.txt"), "local production change\n");
      const result = runBootstrap(directory);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "server repository has tracked uncommitted changes",
      );
      expect(git(directory, "branch", "--show-current")).toBe("feature");
      expect(git(directory, "diff", "--", "tracked.txt")).toContain(
        "local production change",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
