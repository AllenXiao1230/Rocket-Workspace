import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.resolve(import.meta.dirname, "..", "scripts", "bump-version.sh");

describe("版本號遞增腳本", () => {
  it("只遞增語意化版本的 patch，並保留其他 package 資料", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "rocket-workspace-version-"));
    const packageFile = path.join(directory, "package.json");
    writeFileSync(packageFile, '{\n  "name": "fixture",\n  "version": "2.14.9",\n  "private": true\n}\n');

    try {
      execFileSync("bash", [script, "--file", packageFile], { encoding: "utf8" });
      const updated = JSON.parse(readFileSync(packageFile, "utf8"));
      expect(updated).toMatchObject({ name: "fixture", version: "2.14.10", private: true });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
