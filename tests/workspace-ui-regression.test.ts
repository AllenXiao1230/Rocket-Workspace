import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("工作空間設定與導覽介面", () => {
  it("提供受保護的外部 Markdown 掃描入口", () => {
    expect(fs.existsSync(path.join(root, "app/api/projects/[id]/documents/scan/route.ts"))).toBe(true);
    expect(read("components/settings-panel.tsx")).toContain("scanDocuments");
    expect(read("components/settings-panel.tsx")).toContain("掃描外部文件");
  });

  it("讓任務模組的回收桶按鈕使用同一組面板控制列樣式", () => {
    expect(read("components/project-module-board.tsx")).toContain('className="module-edit-toggle module-trash-toggle"');
  });

  it("在團隊列表中顯示成員的照片頭像", () => {
    const source = read("components/team-management.tsx");
    expect(source).toContain("avatarUrl?: string | null");
    expect(source).toContain('member.user.avatarUrl ? <img');
  });

  it("將回收桶放在資料庫區塊之後", () => {
    const source = read("components/workspace-shell.tsx");
    expect(source.indexOf('className="database-nav"')).toBeLessThan(source.indexOf("♻ 回收桶"));
    expect(source.indexOf("♻ 回收桶")).toBeLessThan(source.indexOf("♙ 團隊成員"));
  });
});
