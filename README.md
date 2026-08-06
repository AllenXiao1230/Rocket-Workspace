# Rocket Workspace

可自架、以繁體中文為主的團隊知識庫與專案工作空間。它將 Notion 風格文件、結構化資料庫、專案模組、即時協作與本機 Markdown 備份放在同一套 Docker Compose 服務中。

> AI 與外部整合預設停用。未在設定中心明確啟用並填入服務資料前，系統不會向 OpenAI-compatible API、Ollama、GitHub 或 Webhook 發出請求。

## 已完成

- **工作空間與權限**：登入、`OWNER`／`ADMIN`／`EDITOR`／`VIEWER` 角色、專案空間、成員名單、暱稱、所屬分組、職位與使用者 Emoji 頭像。
- **文件工作區**：樹狀頁面、子頁面、Emoji 頁面圖示、展開／收合、拖放排序與移動、複製、回收桶與還原。
- **編輯與協作**：Tiptap 區塊編輯、斜線選單、浮動表格工具、右鍵選單、連結、待辦、程式碼、引用、表格、復原／重做；Yjs 即時同步、協作游標、離線 IndexedDB、LevelDB 持久化與 Redis 更新／presence 傳播，供多個協作容器共用文件狀態。
- **Markdown 檔案**：每份文件同步至 `workspace-data/documents/`；可原始碼編輯、讀取外部修改、下載 `.md`，寫入採原子更名。外部變更提供三方合併預覽：安全情況自動選用單側變更，雙方修改時以衝突標記保留兩份文字。
- **資料庫**：欄位型別、表格／看板／行事曆／時間軸／圖庫／清單／表單檢視、篩選、排序、關聯、Rollup、公式、模板、自動化、欄列拖放排序、列回收桶與欄位回收桶。
- **專案管理**：任務、Issue、BOM、測試紀錄可新增、編輯、軟刪除與還原；任務可指派團隊成員、設定多個前置任務，並阻止循環依賴。甘特圖支援拖拉日期、關鍵路徑、基線、資源負載與依前置任務自動順延。
- **文件協作周邊**：留言串、回覆、解析、刪除、版本歷史與還原、MinIO 附件上傳／下載／刪除、站內通知。
- **設定與維運**：明暗模式、主題配色、專案資訊、備份排程、安全與功能開關；PostgreSQL、Markdown、MinIO 附件定時備份及完整性驗證。
- **AI 與外部整合**：可在設定中心設定 OpenAI-compatible API 或 Ollama，於「AI 與整合」頁面對話；GitHub Issue 為唯讀查詢，Webhook 可帶 HMAC SHA-256 簽章送出測試事件。服務與金鑰都預設留白、停用且不回顯。
- **部署**：Docker Compose 一鍵啟動 Next.js、PostgreSQL、Redis、MinIO、Yjs 協作與備份服務；資料庫 migration 自動套用。

## 仍需加強／尚未完成

這些項目尚未宣稱完成，適合列入後續迭代：

1. **帳號與企業整合**：沒有忘記密碼信、邀請信、2FA、SSO、帳號停用、細粒度頁面分享或對外訪客流程。（依本輪範圍暫不處理）
2. **進階外部整合**：目前提供 OpenAI-compatible、Ollama、GitHub Issue 與通用 Webhook；MCP、日曆雙向同步與 GitHub 寫入仍未實作。
3. **營運驗證深度**：已加入單元測試、備份完整性檢查與隔離還原演練；實際多節點壓力／故障轉移與瀏覽器端對端測試仍應在正式擴容前執行。

完整限制與改善方向請見 [docs/functionality-audit.md](docs/functionality-audit.md) 與 [docs/markdown-editor-audit.md](docs/markdown-editor-audit.md)。

## 快速啟動

1. 建立設定檔：

   ```bash
   cp .env.example .env
   ```

2. 在 `.env` 至少改掉 `AUTH_SECRET`、`MINIO_SECRET_KEY`、`BOOTSTRAP_ADMIN_EMAIL`、`BOOTSTRAP_ADMIN_PASSWORD`。

3. 啟動：

   ```bash
   docker compose up --build -d
   ```

4. 開啟 `http://localhost:3000`，以 bootstrap 管理員帳號登入。

首次啟動會建立 `Rocket Workspace` 與範例專案。MinIO 管理介面僅供基礎設施管理，位於 `http://localhost:9001`；請使用 `.env` 中的 `MINIO_ACCESS_KEY` 與 `MINIO_SECRET_KEY` 登入。

## 日常使用

- 在側邊欄建立、拖放或右鍵管理文件；文件會以 `.md` 同步到 `workspace-data/documents/`。
- 文件內以 `/` 開啟區塊選單；使用 **MD 原始碼** 編輯 Markdown，使用 **讀取檔案** 明確載入外部修改。
- 到 **任務** 模組按「啟用編輯」，在 **前置任務** 欄位以 Command（Windows/Linux：Ctrl）多選前置任務。
- 到 **設定中心** 管理主題、專案、團隊帳號、備份與安全開關。只有擁有者與管理員可調整工作空間設定。

## 架構與資料位置

```text
瀏覽器
  ├─ Next.js / Auth.js / Prisma ────────────── PostgreSQL
  ├─ Yjs WebSocket（短效文件權杖）──────────── collab + LevelDB
  └─ 附件 API ─────────────────────────────── MinIO

Redis：登入限速與未來背景工作／橫向協作預留
workspace-data/documents：可讀 Markdown 文件
backups：資料庫、Markdown 與附件備份
```

`workspace-data/`、`backups/`、附件與 `.env` 都不應提交到 Git。這些路徑已由 `.gitignore` 排除。

## 備份與還原驗證

備份服務啟動後會先執行一次，之後依 `BACKUP_INTERVAL_HOURS`（預設 24）排程，並依 `BACKUP_RETENTION_DAYS`（預設 14）保留。檔案存於：

| 路徑 | 內容 |
| --- | --- |
| `backups/database/` | PostgreSQL `.dump` |
| `backups/workspace/` | Markdown 與本機工作區封存 |
| `backups/attachments/` | MinIO 附件封存 |
| `backups/status/` | manifest、SHA-256 與最後成功狀態 |

驗證最近一次備份時，先從 `backups/status/last-success.txt` 取得 ID，再執行：

```bash
docker compose exec backup verify-backup <backup-id>
```

這是非破壞性的完整性驗證。另可執行隔離還原演練；它會建立暫用資料庫、還原 dump、檢查核心資料表後自動刪除暫用資料庫：

```bash
docker compose exec backup restore-drill <backup-id>
```

## 安全與部署注意事項

- 對外部署請以 TLS reverse proxy 代理 `app` 與 `collab`，並將 `NEXTAUTH_URL` 改為公開 HTTPS 網址、`NEXT_PUBLIC_COLLABORATION_URL` 改為對應的 `wss://`。
- 不要將 PostgreSQL、Redis、MinIO 對公網暴露。Compose 預設只把 MinIO 與協作連接埠綁在本機。
- **設定中心 → 安全與功能開關** 可關閉協作、附件、Markdown 下載、網頁帳號建立、強制首次改密碼與登入限速；設定檔會存於 Git 忽略的 `workspace-data/.rocket-workspace-settings.env`。
- **帳號安全**與 AI／整合設定都預設關閉。設定頁的密鑰欄位只接受新值，既有值不會回傳至瀏覽器；留白會保留目前的本機值。
- 關閉功能只阻止新操作，不會刪除既有資料。

## 開發與驗證

需要 Node.js 22+ 與 pnpm：

```bash
pnpm install
pnpm db:generate
pnpm db:deploy
pnpm db:seed
pnpm dev
# 另一個終端機
pnpm collab
```

修改後最低限度執行：

```bash
pnpm typecheck
pnpm test
pnpm build
```

資料庫 schema 的唯一來源是 [prisma/schema.prisma](prisma/schema.prisma)。任何結構變更都必須新增 Prisma migration，不能只依賴 `db push`。

## 授權

[AGPL-3.0-or-later](LICENSE)。若修改後透過網路提供此應用程式，必須向使用者提供相對應的原始碼。貢獻方式見 [CONTRIBUTING.md](CONTRIBUTING.md)，安全通報見 [SECURITY.md](SECURITY.md)。
