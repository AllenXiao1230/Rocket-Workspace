# Rocket Workspace 協作指引

本檔案提供人類與自動化協作者的專案規則。所有說明與介面文字使用繁體中文；程式識別字、套件名稱與既有 API 路徑維持英文。

## 專案目標與邊界

- 這是自架的團隊文件與專案管理系統，不是飛控、地面站或任何即時安全決策系統。
- 文件的 Markdown 位置是 `workspace-data/documents/`；它是可讀的交換／備份格式。Tiptap JSON、資料庫記錄、附件、留言與版本歷史仍以 PostgreSQL/MinIO 為準。
- AI 與外部整合預設停用。AI 金鑰、GitHub Token、Webhook 密鑰必須以 `WorkspaceSettings.encryptedSecrets` 的 AES-256-GCM 密文保存，依工作空間隔離；不得回傳至前端、寫入文件、日誌、工作區檔案或 Git。舊版 `.rocket-workspace-settings.env` 不可用於整合密鑰。

## 技術地圖

| 範圍                     | 位置                                                            |
| ------------------------ | --------------------------------------------------------------- |
| Web 介面與 API           | `app/`、`components/`                                           |
| 權限、認證、資料服務     | `lib/`                                                          |
| 資料模型與 migrations    | `prisma/schema.prisma`、`prisma/migrations/`                    |
| Yjs 協作服務             | `apps/collab-server/`                                           |
| Markdown 同步            | `scripts/sync-markdown.ts`、`lib/document-storage.ts`           |
| 任務排程                 | `scripts/task-scheduler.ts`、`lib/task-automation.ts`           |
| GitHub 自動部署          | `.github/workflows/deploy.yml`、`scripts/deploy-from-github.sh` |
| Compose 與備份           | `docker-compose.yml`、`backup/`                                 |
| 功能稽核與 Markdown 限制 | `docs/`                                                         |

## 不可違反的資料規則

1. 不要提交 `.env`、`workspace-data/`、`backups/`、附件、資料庫 dump 或使用者 Markdown。
2. 不要用破壞性 Git 指令覆蓋使用者工作；先檢查 `git status` 與差異。
3. 文件、任務、Issue、BOM、測試與資料庫列使用軟刪除／回收桶。新增刪除流程時必須保留可還原性或明確取得使用者同意。
4. 所有讀寫 API 都必須先認證，再依 `lib/permissions.ts` 檢查專案或工作空間角色。不可只依賴前端鎖定介面。
5. Markdown 外部載入必須是明確使用者動作，不能靜默覆蓋線上協作內容；雙方同時變更時以三方合併預覽與衝突標記保留兩份內容。
6. 資料庫結構變更必須同時修改 Prisma schema 與新增 migration；不以 `prisma db push` 取代 migration。
7. AI、GitHub 與 Webhook API 必須先檢查工作空間權限與設定開關；未啟用時不可對外發出網路請求。使用者提供的 AI／Webhook URL 必須經 `lib/external-url.ts` 驗證，拒絕私有網路與非 HTTPS 目標；只有受 `OLLAMA_ALLOWED_HOSTS` 限制的 Ollama 可使用內部 HTTP。
8. 建立工作空間相關稽核事件時，必須寫入 `workspaceId`，有專案內容時也要寫入 `projectId`；管理介面只能依此範圍查詢，禁止以未篩選的稽核事件清單代替。
9. scheduler 的週期任務與 SLA 通知必須使用可重跑安全的去重條件；不可因容器重啟、排程間隔縮短或手動重跑而建立重複任務／通知。工作日曆未接入自動期限計算前，不可宣稱會自動跳過假日。
10. 資料庫 CSV 匯入必須限制列數、驗證欄位名稱與所有值型別，並以伺服器端驗證為準；不能只依賴前端預覽。BOM／測試附件的操作也必須依專案角色檢查，且新增回收／永久刪除流程時要保留可還原性。
11. 文件媒體節點僅接受 HTTPS 外部 URL；圖片可使用權限保護的 `/api/attachments?id=<id>`。不得接受 `data:`、`javascript:`、HTTP 或其他相對路徑，iframe 必須維持 sandbox 與嚴格 referrer policy。
12. 自動部署只能經 GitHub Actions SSH 觸發，且預設由 `AUTO_DEPLOY_ENABLED` repository variable 關閉。伺服器腳本只能 `git pull --ff-only`；若分支不正確或有已追蹤的未提交修改必須失敗，不得以 `reset --hard` 強制部署。所有 SSH 私鑰、known_hosts、主機名稱與 `.env` 僅能存於 GitHub Secrets 或伺服器，不能提交。

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

5. 修改容器執行內容時，再執行 `docker compose --progress plain build app collab scheduler backup`，重建相關服務，檢查 `GET /api/health`（含資料庫可用性）、健康狀態與登入頁 HTTP 回應。
6. 需要推送 GitHub 時，先確認 diff、測試與目標分支；不要提交使用者資料。

## 功能設計原則

- 預設閱讀模式；模組需要由有寫入權限的使用者按「啟用編輯」才可修改。
- 選單、錯誤、通知與空狀態採繁體中文，並清楚告知操作後果。
- 功能開關由設定中心按工作空間管理；關閉服務時應阻止新操作但保留現有資料。主機備份排程是跨工作空間設定，僅 `isSystemAdmin` 可調整。附件先進回收桶，永久刪除必須是 OWNER／ADMIN 的明確確認操作。
- 執行 `restore-drill` 時必須同時驗證資料庫 dump、Markdown 工作區封存與附件封存；不可只因資料庫可還原就宣稱完整備份可復原。
- 任務相依不可自我相依、跨專案或形成循環。修改任務 API 回傳時保留 `dependencies`，避免前端編輯後遺失顯示。
- 任務父／子關係同樣不可形成循環；CPM 僅在無環的 finish-to-start 網路上計算，偵測到環時必須回傳錯誤而非顯示假的關鍵路徑。週期任務的建立必須可重複安全執行，不能因重跑產生同一 occurrence 的重複任務。
- 專案工作日曆目前是排程設定與 UI 資料；若未同步實作到 CPM、scheduler 與到期日計算，介面與文件必須明說不會自動避開假日。多層篩選與排序可以持久化在資料庫檢視中，但公式錯誤歷史與 Rollup 快取尚未存在。
- 文件鎖定、送審與核准是伺服器端狀態：一般編輯者不得修改或刪除其他人鎖定的頁面（包含其子頁面）；資料庫列值、BOM 採購欄位與測試證據也必須在 API 驗證，不能只信任前端。
- 資料庫、文件與附件要有明確的新增、編輯、刪除／回收與還原路徑；不要只做新增按鈕。

## 已知限制

- 協作服務透過 Redis 傳播 Yjs 更新與 awareness；正式水平擴容前仍須做多副本壓力與故障轉移演練。
- 資料庫欄位採軟刪除，還原前必須保留欄位 ID，不能以重建同名欄位取代還原。
- 沒有忘記密碼、2FA、SSO、電子郵件邀請、不可竄改稽核或完整瀏覽器端對端測試。AI／外部整合已有基礎 API，但串流、成本控管、OAuth/App 安裝、同步佇列與死信佇列仍未實作。
- 公式錯誤已有近期歷史追蹤、Rollup 由 scheduler 背景快取；文件圖片／影片／外部嵌入的 Markdown 表示仍有侷限，雙向同步區塊目前為文字內容。BOM／測試附件目前尚無與文件附件對等的回收與還原畫面。
- 見 `docs/functionality-audit.md` 與 `docs/markdown-editor-audit.md`，更新功能時必須同步更新相關文件。
