# Rocket Workspace

可自架、以繁體中文為主的團隊知識庫與專案工作空間。它將 Notion 風格文件、結構化資料庫、專案模組、即時協作與本機 Markdown 備份放在同一套 Docker Compose 服務中。

> AI 與外部整合預設停用。未在設定中心明確啟用並填入服務資料前，系統不會向 OpenAI-compatible API、Ollama、GitHub 或 Webhook 發出請求。

## 已完成

- **工作空間與權限**：登入、`OWNER`／`ADMIN`／`EDITOR`／`VIEWER` 角色、專案空間、成員名單、暱稱、所屬分組、職位、Emoji 與可私密讀取的照片頭像（MinIO）。
- **文件工作區**：樹狀頁面、子頁面與文件內同層資料庫、Emoji 頁面圖示、展開／收合、拖放排序與移動、複製、回收桶與還原；另有頁面屬性、鎖定、送審／核准／要求修改、反向連結、版本 Markdown diff，以及圖形化文件模板選擇器。
- **編輯與協作**：Tiptap 區塊編輯、斜線選單、浮動表格工具、表格頂端／左側的欄列增減把手、可拖曳欄寬、右鍵選單、連結、待辦、程式碼、引用、Callout、表格、圖片與安全外嵌（影片／網頁）、復原／重做；Yjs 即時同步、協作游標、離線 IndexedDB、LevelDB 持久化與 Redis 更新／presence 傳播，供多個協作容器共用文件狀態。
- **Markdown 檔案**：每份文件同步至 `workspace-data/documents/`；可原始碼編輯、讀取外部修改、下載 `.md`，寫入採原子更名。外部變更提供三方合併預覽：安全情況自動選用單側變更，雙方修改時以衝突標記保留兩份文字。
- **資料庫**：欄位型別、表格／看板／行事曆／時間軸／圖庫／清單／表單檢視、多層 AND/OR 篩選群組、組合排序、關聯、Rollup、公式、模板、自動化、CSV 匯入／匯出、欄列拖放排序、列回收桶與欄位回收桶；新增欄位時可設定說明、文字限制、數字格式與精度、日期時間、選項、檔案上限等型別屬性，列與欄位設定、選項、關聯及值皆由伺服器端驗證。
- **專案管理**：任務、Issue、BOM、測試紀錄可新增、編輯、軟刪除與還原；任務可指派團隊成員、設定父／子任務、里程碑、SLA、週期規則、工時與多個前置任務，並阻止循環依賴。甘特圖支援拖拉日期、CPM forward/backward pass、slack、基線、資源負載、專案工作日曆與依前置任務自動順延；任務另有看板拖放。右側欄按登入帳號彙整跨專案的「我的工作」與「待辦事項」，可直接標記完成。內建 scheduler 會產生到期的週期任務，並發出即將到期 SLA 通知。BOM 與測試紀錄支援 MinIO 附件，測試支援計畫、步驟、量測、簽核、需求追溯與可下載的測試報告／追溯矩陣 CSV。
- **文件協作周邊**：留言串、回覆、解析、刪除、版本歷史與還原、MinIO 附件上傳／下載／刪除、站內通知。
- **日曆同步**：每個專案可在設定中心建立可輪替、可撤銷的標準 iCalendar（`.ics`）訂閱網址；Google Calendar、Apple Calendar、Outlook 等可唯讀同步有日期的任務與測試紀錄，權杖只儲存 SHA-256 雜湊。
- **設定與維運**：明暗模式、主題配色、專案資訊、工作空間隔離的安全／功能開關與管理者操作紀錄；主機備份排程僅由系統管理員調整，並備份 PostgreSQL、Markdown、MinIO 附件及完整性資訊。
- **一致的互動操作**：文件與專案模組的新增／移至回收桶、文件留言刪除、版本還原、附件刪除、移除成員與停用日曆訂閱使用應用程式內對話框；可用鍵盤確認或以 Escape 取消，不依賴瀏覽器原生確認視窗。
- **AI 與外部整合**：可在設定中心設定 OpenAI-compatible API 或 Ollama，於「AI 與整合」頁面對話；GitHub Issue 為唯讀查詢，Webhook 可帶 HMAC SHA-256 簽章送出測試事件。每個工作空間的密鑰以 AES-256-GCM 加密存於 PostgreSQL、永不回顯；外連一律驗證 HTTPS、私有網路位址與實際連線 IP，Ollama 僅允許受信任的內部主機。AI 請求與 Webhook 測試會保留不含提示、回覆或密鑰的稽核事件。
- **規模與維運可觀測性**：首頁文件樹、資料庫列與專案模組紀錄採 cursor 分頁；資料庫欄位、檢視與模板會在選取資料庫時按需載入。`/api/health` 提供完整 readiness 檢查，`/api/health/live` 提供不依賴外部服務的 liveness 檢查。
- **部署**：Docker Compose 一鍵啟動 Next.js、PostgreSQL、Redis、MinIO、Yjs 協作、任務 scheduler 與備份服務；資料庫 migration 自動套用。

## 仍需加強／尚未完成

這些項目尚未宣稱完成，適合列入後續迭代：

1. **帳號與企業整合**：沒有忘記密碼信、邀請信、2FA、SSO、帳號停用、細粒度頁面分享或對外訪客流程。（依本輪範圍暫不處理）
2. **產品深化的待辦**：公式錯誤目前只在檢視中顯示，尚未提供歷史追蹤；Rollup 仍即時計算，尚未建立背景快取。跨文件同步區塊尚未提供完整 UI；圖片與嵌入內容是可協作的 Tiptap 節點，但 Markdown 只能保留退化的文字表示。
3. **工作流深化的待辦**：通知目前涵蓋 SLA 到期提醒，但尚未提供管理者可編輯的細粒度通知規則與假日例外日曆。
4. **進階外部整合**：目前提供 OpenAI-compatible、Ollama、GitHub Issue、通用 Webhook 與 iCalendar 唯讀訂閱；AI 的串流/停止、範圍引用、成本上限，以及 OAuth/App 安裝、同步游標、重試/DLQ、GitHub 寫入、CalDAV／Google／Outlook 雙向寫入仍未實作。AI 請求與 Webhook 測試已有不含敏感內容的稽核紀錄。
5. **營運驗證深度**：已加入單元測試、備份完整性檢查、隔離還原演練及可重複執行的三節點 Yjs 壓測；跨可用區故障轉移與瀏覽器端端對端測試仍應在正式擴容前執行。

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

服務就緒探針為 `http://localhost:3000/api/health`：它只回傳 `ok` 或 `degraded`，並確認 PostgreSQL、MinIO、Redis、協作服務、scheduler 心跳與 migration 版本；不會洩漏帳號或設定內容。容器存活探針為 `http://localhost:3000/api/health/live`，不依賴外部服務。

首次啟動會建立 `Rocket Workspace` 與範例專案。MinIO 管理介面僅供基礎設施管理，位於 `http://localhost:9001`；請使用 `.env` 中的 `MINIO_ACCESS_KEY` 與 `MINIO_SECRET_KEY` 登入。

## 日常使用

- 在側邊欄建立、拖放或右鍵管理文件；文件會以 `.md` 同步到 `workspace-data/documents/`。
- 文件內以 `/` 開啟區塊選單；使用 **MD 原始碼** 編輯 Markdown，使用 **讀取檔案** 明確載入外部修改。
- 在文件底部按 **新增資料庫**，建立的資料庫會與子頁面同層顯示在該文件下方；側邊欄的獨立「新增資料庫」則建立專案根層資料庫。
- 以工具列或 `/` 插入 **Callout**、圖片或嵌入內容。按「上傳圖片」可選取多張本機照片；也可以把圖片檔拖到編輯器或直接貼上圖片，系統會上傳至 MinIO 並插入文件。外部媒體只接受 HTTPS。
- 到 **任務** 模組按「啟用編輯」，在 **前置任務** 欄位以 Command（Windows/Linux：Ctrl）多選前置任務。
- 在 **任務** 模組可切換看板並拖拉卡片改變狀態；週期任務與 SLA 提醒由 `scheduler` 容器自動處理。可在甘特圖的專案工作日曆中選擇工作日；它目前是排程設定與顯示資料，不會自動略過假日重算期限。
- 在資料庫的 **篩選與排序** 中建立 AND／OR 條件群組與多欄排序，儲存檢視後供團隊共用。CSV 匯入要求欄名對應既有欄位名稱，單次最多 2,000 列；匯入值仍會經伺服器型別驗證。
- BOM 與測試紀錄可附加檔案；測試報告與需求追溯矩陣可由 `GET /api/projects/<projectId>/tests/report` 下載 CSV，且仍須以登入權限存取。
- 到 **設定中心** 管理主題、專案、團隊帳號、安全開關與該工作空間的外部整合。只有擁有者與管理員可調整工作空間設定；bootstrap 管理員同時是系統管理員，可調整主機備份排程。
- 到 **設定中心 → 專案日曆同步** 產生訂閱網址，立刻複製到外部日曆的「透過網址訂閱」功能。網址只會顯示一次；若外流或需要換用日曆帳號，按「輪替訂閱網址」。停用後舊訂閱會回傳不存在。

## 架構與資料位置

```text
瀏覽器
  ├─ Next.js / Auth.js / Prisma ────────────── PostgreSQL
  ├─ Yjs WebSocket（短效文件權杖）──────────── collab + LevelDB
  └─ 附件 API ─────────────────────────────── MinIO

Redis：登入限速與未來背景工作／橫向協作預留
Scheduler：週期任務產生與 SLA 即將到期站內通知
workspace-data/documents：可讀 Markdown 文件
backups：資料庫、Markdown 與附件備份
`/api/calendar/<權杖>.ics`：專案任務／測試紀錄的唯讀 iCalendar 訂閱
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

這是非破壞性的完整性驗證，並確認工作區封存不含舊版設定檔。另可執行隔離還原演練；它會建立暫用資料庫、還原 dump、檢查核心資料表與 Markdown／附件封存結構，最後自動刪除暫用資料庫：

```bash
docker compose exec backup restore-drill <backup-id>
```

## 安全與部署注意事項

- 對外部署請以 TLS reverse proxy 代理 `app` 與 `collab`，並將 `NEXTAUTH_URL` 改為公開 HTTPS 網址、`NEXT_PUBLIC_COLLABORATION_URL` 改為對應的 `wss://`。
- 不要將 PostgreSQL、Redis、MinIO 對公網暴露。Compose 預設只把 MinIO 與協作連接埠綁在本機。
- **設定中心 → 安全與功能開關** 可關閉協作、附件、Markdown 下載、網頁帳號建立、強制首次改密碼與登入限速；設定依工作空間隔離，帳號同時加入多個空間時採最嚴格的密碼與登入限制。
- **帳號安全**與 AI／整合設定都預設關閉。設定頁的密鑰欄位只接受新值，既有值不會回傳至瀏覽器；留白會保留目前的加密值。系統不再讀取舊版明文 AI／整合設定，舊的 `.rocket-workspace-settings.env` 亦會從工作區備份排除。
- `WORKSPACE_SETTINGS_ENCRYPTION_KEY` 可設定為獨立 32 字元以上的密鑰；留白時會使用 `AUTH_SECRET` 衍生加密金鑰。請勿遺失此值，否則既有整合密鑰無法解密。
- 關閉功能只阻止新操作，不會刪除既有資料。
- 日曆訂閱網址是高熵的唯讀 bearer 權杖，不要求外部 OAuth，也不會儲存 Google／Microsoft 密碼。把網址視為敏感連結；若外流請在設定中心輪替或停用。外部日曆的重新整理頻率由該服務決定，Rocket Workspace 不會直接寫回外部日曆。

## GitHub 推送後自動部署

專案內建 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)：推送到 `main` 後，GitHub Actions 會 SSH 到伺服器，執行 `scripts/deploy-from-github.sh`。預設**不啟用**；必須由儲存庫擁有者在 GitHub 設定後才會真的部署。

伺服器初次準備（只需一次）：

1. 以專用 deploy 使用者把此儲存庫 clone 到固定位置，例如 `/srv/rocket-workspace`，建立不納入 Git 的 `.env`，並先成功執行一次 `docker compose up -d --build`。
2. 讓該使用者能執行 Docker（通常加入 `docker` 群組）。若儲存庫為私有，伺服器本身也需要可讀取儲存庫的 deploy key 或 GitHub App 憑證，才能執行 `git pull`。
3. 使腳本可執行：`chmod +x /srv/rocket-workspace/scripts/deploy-from-github.sh`。

接著到 GitHub 儲存庫的 **Settings → Secrets and variables → Actions** 設定：

| 類型 | 名稱 | 值 |
| --- | --- | --- |
| Variable | `AUTO_DEPLOY_ENABLED` | `true` 才開啟自動部署；刪除或改為其他值即可停用。 |
| Secret | `DEPLOY_HOST` | 伺服器 DNS 名稱或 IP。 |
| Secret | `DEPLOY_PORT` | SSH 連接埠；留白時預設 `22`。 |
| Secret | `DEPLOY_USER` | 專用 deploy 使用者。 |
| Secret | `DEPLOY_SSH_KEY` | GitHub Actions 用來登入伺服器的私鑰內容。 |
| Secret | `DEPLOY_KNOWN_HOSTS` | 該伺服器的 `ssh-keyscan -H <host>` 輸出，防止 SSH 中間人攻擊。 |
| Secret | `DEPLOY_PATH` | 伺服器上的專案絕對路徑，例如 `/srv/rocket-workspace`。 |

每次 `main` 有程式碼推送時，工作流程會先確認設定完整，再於伺服器執行 `git pull --ff-only`、重建 `app`／`collab`／`scheduler`／`backup`，並輪詢 `/api/health`。純 Markdown 與 `docs/` 推送會略過部署。伺服器有未提交的**已追蹤**修改、分支不在 `main`，或 health check 失敗時會中止並在 GitHub Actions 顯示失敗，避免覆蓋本機設定或使用者資料。

部署腳本會把已部署提交的 SHA 與 `package.json` 版本傳入 Docker image。登入後，右側帳號區會定期比對此 SHA 與 GitHub 儲存庫預設分支；若伺服器落後，會顯示「可更新」並彈出更新提醒。手動部署時也應帶入相同資訊：`APP_COMMIT=$(git rev-parse HEAD) APP_VERSION=$(node -p 'require("./package.json").version') docker compose up -d --build app`。如需使用 fork，請以 `UPDATE_REPOSITORY=owner/repository` 覆寫預設儲存庫。若該儲存庫是私有的，請在伺服器 `.env` 加入只讀 fine-grained Token：`UPDATE_GITHUB_TOKEN=...`；此 Token 只會用於 GitHub 版本比較，絕不會送到瀏覽器或設定頁面。

## Git 推送前版本號

版本號以 `package.json` 的 `MAJOR.MINOR.PATCH` 為唯一來源。安裝本儲存庫的 hooks 後，每個有實際內容的 commit 都會自動遞增 patch 版本並將 `package.json` 加入該 commit；push 前也會驗證所有要推送的新提交都含有版本變更。因此每一次有新提交的 push 都會帶有新的版本號，空 push 不會產生無意義版本。

每個 clone（包含伺服器上的 `/srv/rocket-workspace`）只需執行一次：

```bash
git config core.hooksPath .githooks
```

手動遞增版本可執行 `pnpm version:bump`。此腳本只依賴 Bash、Sed 與 Perl，不需要在部署主機另外安裝 Node.js。

## 三節點協作壓測

正式部署或變更協作服務前，可在同一個 Docker 網路啟動三個獨立 Yjs 節點，讓 36 個客戶端平均分布連線並驗證每一筆更新都會跨 Redis 傳遞到所有其他客戶端。測試預設要求 p95 傳播延遲不超過 3 秒；輸出為單行 JSON，`"result":"PASS"` 才算通過。

```bash
docker compose -f docker-compose.yml -f docker-compose.loadtest.yml \
  up --build --abort-on-container-exit --exit-code-from collab-loadtest collab-loadtest
docker compose -f docker-compose.yml -f docker-compose.loadtest.yml \
  rm -sf collab-loadtest collab-node-1 collab-node-2 collab-node-3
docker volume rm rocketworkspace_collab-loadtest-node-1 rocketworkspace_collab-loadtest-node-2 rocketworkspace_collab-loadtest-node-3
```

可在 `.env` 設定下列門檻，但不要將 `.env` 提交：

```dotenv
COLLAB_LOADTEST_CLIENTS=36
COLLAB_LOADTEST_TIMEOUT_MS=30000
COLLAB_LOADTEST_MAX_P95_MS=3000
```

壓測會使用暫時的隨機文件 ID，不會讀取或修改 PostgreSQL 的專案文件；清除命令只移除三個壓測節點，不會停止正式的 `app`、`postgres`、`redis`、`minio` 或 `backup` 服務。此驗證涵蓋多節點同步與延遲，不等同跨主機、跨區域或反向代理的完整容錯演練。

## 開發與驗證

需要 Node.js 22+ 與 pnpm：

```bash
pnpm install
pnpm db:generate
pnpm db:deploy
pnpm db:seed

# Creates/migrates the isolated Compose integration database; it never resets
# or writes to the configured application database.
pnpm test:integration:prepare
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

`pnpm test` 與 `pnpm test:coverage` 只執行不需要服務的單元／路由測試。需要 PostgreSQL 與 MinIO 的整合測試必須明確準備隔離資料庫後執行，避免誤寫入應用程式資料庫：

```bash
pnpm test:integration:prepare
pnpm test:integration
```

資料庫 schema 的唯一來源是 [prisma/schema.prisma](prisma/schema.prisma)。任何結構變更都必須新增 Prisma migration，不能只依賴 `db push`。

## 授權

[AGPL-3.0-or-later](LICENSE)。若修改後透過網路提供此應用程式，必須向使用者提供相對應的原始碼。貢獻方式見 [CONTRIBUTING.md](CONTRIBUTING.md)，安全通報見 [SECURITY.md](SECURITY.md)。
