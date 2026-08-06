# Rocket Workspace 協作指引

本檔案提供人類與自動化協作者的專案規則。所有說明與介面文字使用繁體中文；程式識別字、套件名稱與既有 API 路徑維持英文。

## 專案目標與邊界

- 這是自架的團隊文件與專案管理系統，不是飛控、地面站或任何即時安全決策系統。
- 文件的 Markdown 位置是 `workspace-data/documents/`；它是可讀的交換／備份格式。Tiptap JSON、資料庫記錄、附件、留言與版本歷史仍以 PostgreSQL/MinIO 為準。
- AI 功能目前暫緩。不要新增或要求 OpenAI、Ollama 或任何 API 金鑰，除非使用者重新明確啟用此範圍。

## 技術地圖

| 範圍 | 位置 |
| --- | --- |
| Web 介面與 API | `app/`、`components/` |
| 權限、認證、資料服務 | `lib/` |
| 資料模型與 migrations | `prisma/schema.prisma`、`prisma/migrations/` |
| Yjs 協作服務 | `apps/collab-server/` |
| Markdown 同步 | `scripts/sync-markdown.ts`、`lib/document-storage.ts` |
| Compose 與備份 | `docker-compose.yml`、`backup/` |
| 功能稽核與 Markdown 限制 | `docs/` |

## 不可違反的資料規則

1. 不要提交 `.env`、`workspace-data/`、`backups/`、附件、資料庫 dump 或使用者 Markdown。
2. 不要用破壞性 Git 指令覆蓋使用者工作；先檢查 `git status` 與差異。
3. 文件、任務、Issue、BOM、測試與資料庫列使用軟刪除／回收桶。新增刪除流程時必須保留可還原性或明確取得使用者同意。
4. 所有讀寫 API 都必須先認證，再依 `lib/permissions.ts` 檢查專案或工作空間角色。不可只依賴前端鎖定介面。
5. Markdown 外部載入必須是明確使用者動作，不能靜默覆蓋線上協作內容。
6. 資料庫結構變更必須同時修改 Prisma schema 與新增 migration；不以 `prisma db push` 取代 migration。

## 開發流程

1. 先確認工作目錄、`git status -sb` 與既有相關程式碼。
2. 先讀取資料模型與 API，再改元件；不要憑 UI 假設資料欄位存在。
3. 使用 `apply_patch` 修改檔案，保持變更小且可審查。
4. 至少執行：

   ```bash
   pnpm db:generate
   pnpm typecheck
   pnpm test
   git diff --check
   ```

5. 修改容器執行內容時，再執行 `docker compose --progress plain build app`，重建 `app`，檢查健康狀態與登入頁 HTTP 回應。
6. 需要推送 GitHub 時，先確認 diff、測試與目標分支；不要提交使用者資料。

## 功能設計原則

- 預設閱讀模式；模組需要由有寫入權限的使用者按「啟用編輯」才可修改。
- 選單、錯誤、通知與空狀態採繁體中文，並清楚告知操作後果。
- 功能開關由設定中心管理；關閉服務時應阻止新操作但保留現有資料。
- 任務相依不可自我相依、跨專案或形成循環。修改任務 API 回傳時保留 `dependencies`，避免前端編輯後遺失顯示。
- 資料庫、文件與附件要有明確的新增、編輯、刪除／回收與還原路徑；不要只做新增按鈕。

## 已知限制

- Yjs/LevelDB 協作服務是單一節點設計；未實作多副本共享 awareness。
- Rollup 設定精靈、資料庫拖放排序、關鍵路徑與自動排程尚未完成。
- 沒有忘記密碼、2FA、SSO、電子郵件邀請、不可竄改稽核或完整端對端測試。
- 見 `docs/functionality-audit.md` 與 `docs/markdown-editor-audit.md`，更新功能時必須同步更新相關文件。
