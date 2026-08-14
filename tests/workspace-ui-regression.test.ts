import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("工作空間設定與導覽介面", () => {
  it("提供受保護的外部 Markdown 掃描入口", () => {
    expect(
      fs.existsSync(path.join(root, "app/api/projects/[id]/documents/scan/route.ts")),
    ).toBe(true);
    expect(read("components/settings-panel.tsx")).toContain("scanDocuments");
    expect(read("components/settings-panel.tsx")).toContain("掃描外部文件");
  });

  it("讓任務模組的回收桶按鈕使用同一組面板控制列樣式", () => {
    expect(read("components/project-module-board.tsx")).toContain(
      'className="module-edit-toggle module-trash-toggle"',
    );
  });

  it("在團隊列表中顯示成員的照片頭像", () => {
    const source = read("components/team-management.tsx");
    expect(source).toContain("avatarUrl?: string | null");
    expect(source).toContain("member.user.avatarUrl ? (");
  });

  it("將回收桶放在資料庫區塊之後", () => {
    const source = read("components/workspace-shell.tsx");
    expect(source.indexOf('className="database-nav"')).toBeLessThan(
      source.indexOf("> 回收桶"),
    );
    expect(source.indexOf("> 回收桶")).toBeLessThan(source.indexOf("> 團隊成員"));
  });

  it("讓外觀與定時備份卡片使用不同的設定網格區域", () => {
    const css = read("app/globals.css");
    expect(css).toMatch(/\.appearance-settings\s*\{\s*grid-area:\s*appearance/);
    expect(css).toMatch(
      /\.settings-grid\s*>\s*:nth-child\(4\)\s*\{\s*grid-area:\s*backup/,
    );
    expect(css).not.toContain(
      ".settings-grid .settings-card:nth-of-type(3){grid-area:backup}",
    );
  });

  it("提供公式錯誤歷史的載入、空狀態與失敗狀態", () => {
    const source = read("components/database-view.tsx");
    expect(source).toContain("公式錯誤紀錄");
    expect(source).toContain("正在載入公式錯誤紀錄");
    expect(source).toContain("目前沒有已記錄的公式錯誤");
    expect(source).toContain("無法載入公式錯誤紀錄");
  });

  it("在文件中提供雙向同步區塊", () => {
    expect(read("components/collaborative-editor.tsx")).toContain("DocumentSyncBlocks");
    expect(read("components/document-sync-blocks.tsx")).toContain("建立同步區塊");
  });

  it("在協作不可用或唯讀時仍以伺服器內容初始化文件", () => {
    const editor = read("components/collaborative-editor.tsx");

    expect(editor).toContain("const seedServerDocument");
    expect(editor).toContain("queueMicrotask(seedServerDocument)");
    expect(editor).toContain("!current || !current.isEmpty");
  });

  it("讓非同步結果以可讀屏通知的共用元件呈現", () => {
    const source = read("components/status-message.tsx");
    expect(source).toContain('role={tone === "alert" ? "alert" : "status"}');
    expect(source).toContain('aria-live={tone === "alert" ? "assertive" : "polite"}');
    expect(read("components/settings-panel.tsx")).toContain(
      "<StatusMessage tone={noticeTone}>{notice}</StatusMessage>",
    );
  });

  it("讓密碼變更的錯誤可恢復且與確認欄位相關聯", () => {
    const source = read("components/change-password-form.tsx");
    expect(source).toContain("try {");
    expect(source).toContain("finally {");
    expect(source).toContain('id="password-confirmation-error"');
    expect(source).toContain("button-spinner");
  });

  it("使用 cursor 分頁載入大型成員清單", () => {
    const source = read("components/team-management.tsx");
    expect(source).toContain("take: String(pageSize)");
    expect(source).toContain("nextCursor");
    expect(source).toContain('loading="lazy"');
    expect(read("app/api/workspaces/[id]/members/route.ts")).toContain("nextCursor");
  });

  it("提供跳至主要內容連結與可聚焦的主要地標", () => {
    expect(read("app/layout.tsx")).toContain('href="#main-content"');
    expect(read("components/workspace-shell.tsx")).toContain('id="main-content"');
  });

  it("將工作空間檢視與文件排序替代操作保留在可分享的導覽中", () => {
    const shell = read("components/workspace-shell.tsx");
    expect(read("app/page.tsx")).toContain("database?: string");
    expect(read("app/page.tsx")).toContain("taskView?: string");
    expect(read("app/page.tsx")).toContain("panel?: string");
    expect(shell).toContain(
      '"document", "database", "module", "task", "taskView", "panel"',
    );
    expect(shell).toContain("router.push(href");
    expect(shell).toContain("↑ 移到前一項之前");
    expect(shell).toContain("↓ 移到下一項之後");
    expect(shell).toContain("⇲ 移至其他頁面…");
    expect(shell).toContain("移至專案根層");
  });

  it("在切換專案時以新的工作區資料重新掛載殼層", () => {
    expect(read("app/page.tsx")).toContain("key={`${workspace.id}:${project.id}`}");
  });

  it("在深連結任務尚未載入時不保留先前任務的詳情", () => {
    const tasks = read("components/project-module-board.tsx");

    expect(tasks).toContain("const [selectedTaskLoading, setSelectedTaskLoading]");
    expect(tasks).toContain("正在載入指定任務…");
    expect(tasks).toContain("找不到指定任務或你沒有檢視權限。");
  });
});
