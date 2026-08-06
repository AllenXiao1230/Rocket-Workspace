# Rocket Workspace

Self-hosted, Notion-style project workspace for teams. This MVP deliberately starts with the collaboration and evidence trail that a hardware programme needs: structured project space, nested documents, authenticated access, role checks, auditable module records, attachment storage, and real-time text synchronization.

## License

Rocket Workspace is licensed under [AGPL-3.0-or-later](LICENSE). In particular, modified versions offered to users over a network must also offer their corresponding source code. Do not commit personal documents, backups, attachments, or secrets; see [CONTRIBUTING.md](CONTRIBUTING.md).

AI is intentionally **out of scope for this version**. No OpenAI key is required, stored, or used.

## Included MVP

- **Workspace, project, and roles**: `OWNER`, `ADMIN`, `EDITOR`, and `VIEWER`; writes are checked server-side. Owners and administrators can manage members, assign a display nickname, and set roles.
- **Project spaces**: a workspace can contain multiple projects; use the project selector in the left panel to change context without exposing projects outside the signed-in workspace.
- **Notion-style pages**: project-scoped document tree, one-click child pages, rich Tiptap content, tables, task lists, and links. Every page is mirrored as a human-readable Markdown file in `workspace-data/documents/`, ready for backup or Git.
- **Markdown workflow**: source editor, protected file reload, Markdown copy/download, atomic file writes, and formatting tools for headings, lists, quotes, code, links, tables, and task lists.
- **Database engine**: typed properties including multi-select, relations, rollups, formulas, unique IDs, timestamps, people, and files; persistent Table, Board, Calendar, Timeline, Gallery, and List views.
- **Workflow controls**: database templates, row-triggered automation rules, project search, page comments, version history with restore, and in-app notifications.
- **Real-time editing**: Tiptap + Yjs + a protected WebSocket service. A short-lived token is only issued after the application has checked membership.
- **Login**: Auth.js credentials login, with the first owner safely supplied through environment variables during seed.
- **Team account provisioning**: owners and administrators can create a member account in the team page; the new member is forced to replace their initial password on first login.
- **Project modules**: Tasks, Issues, BOM, and Test Records are modelled in PostgreSQL, shown in the workspace, and exposed through role-protected APIs. A task has one optional responsible member, selected from the active workspace team.
- **Attachments**: MinIO object storage is initialized automatically; a protected multipart upload endpoint stores attachment metadata in PostgreSQL.
- **Scheduled backup**: PostgreSQL, Markdown documents, and MinIO attachments are archived locally on a regular schedule with retention.
- **Audit base**: all document writes create an `AuditEvent`; the schema is ready for module-level audit events as the UI grows.

## Architecture

```text
Browser (Next.js + Tiptap)
  ├─ HTTPS → Next.js app → Auth.js / permission checks / Prisma → PostgreSQL
  ├─ WSS  → Yjs collaboration server (short-lived document token)
  └─ uploads → Next.js app → MinIO (object bytes) + PostgreSQL (metadata)

Redis is provisioned for presence, jobs, rate limits, and collaborative scaling.
```

### Markdown documents in the project folder

`workspace-data/documents/` is bind-mounted into the application container. Each file has YAML front matter for its stable ID, title, project, parent page, and update time, followed by the Markdown body. The editor writes the Markdown file whenever it saves, and reads the Markdown version when opening a page; PostgreSQL keeps a Tiptap JSON checkpoint for real-time collaboration and fast rendering. On startup, only missing Markdown files are created, so existing files are safe to edit, copy, back up, or version with Git.

The `Document.content` JSON is the durable checkpoint. Yjs distributes live changes and the editor saves a debounced JSON checkpoint to PostgreSQL. For multi-replica collaboration, add a Redis-backed Yjs persistence/awareness adapter before scaling the `collab` service horizontally.

Use **MD 原始碼** in a document to edit its Markdown directly, **讀取檔案** to intentionally load an externally edited file, or **下載 .md** to export it with its front matter. The attachment panel supports permission-checked upload, download, and removal; set a size limit or optional file-type allow-list in `.env`. Markdown is an interchange and backup format: comments, revision history, attachments, database records, and some advanced editor structure remain in PostgreSQL. See [`docs/markdown-editor-audit.md`](docs/markdown-editor-audit.md) for known limits and the production hardening roadmap.

Deleting a document now moves it, including its active child pages, into the **回收桶** instead of permanently removing it. Restoring a batch returns its original hierarchy and keeps its Markdown file, attachments, comments, and revision history.

## Start with Docker Compose

1. Copy the example configuration and choose unique secrets:

   ```bash
   cp .env.example .env
   ```

2. Change at least `AUTH_SECRET`, `MINIO_SECRET_KEY`, `BOOTSTRAP_ADMIN_EMAIL`, and `BOOTSTRAP_ADMIN_PASSWORD` in `.env`. Do not commit this file.

3. Start the stack:

   ```bash
   docker compose up --build
   ```

4. Open `http://localhost:3000` and log in with the bootstrap administrator account. The seed creates the `Rocket Workspace` and `Rocket 2027` sample project exactly once.

MinIO Console is available at `http://localhost:9001`. It is infrastructure administration, not the normal user interface.

### Scheduled backup

The `backup` service creates one backup when the stack starts, then repeats at the configured interval. The default is every 24 hours and it keeps 14 days. Backup files stay on the host in `backups/` and are deliberately excluded from Git because they can contain project data and database records.

| Folder | Contents |
| --- | --- |
| `backups/database/` | PostgreSQL custom-format dumps (`.dump`) |
| `backups/workspace/` | Markdown documents and local workspace files (`.tar.gz`) |
| `backups/attachments/` | MinIO attachments exported through the storage API (`.tar.gz`) |
| `backups/status/` | Latest successful backup ID, failure marker, manifest, and SHA-256 checksums |

Adjust `BACKUP_INTERVAL_HOURS` and `BACKUP_RETENTION_DAYS` in `.env`, then restart the stack for the new schedule. Keep the `backups/` folder on a disk that is included in your device or off-site backup plan; a backup stored only on the same disk does not protect against disk loss.

Workspace owners and administrators can also adjust the backup interval and retention from the in-app **設定中心**. The backup service checks these values every minute, so a new schedule applies within about one minute; deployment secrets remain server-only.

### Team members and task owners

Open **團隊成員** in the left sidebar. Owners and administrators can add an existing login account by email, set its workspace role, and give it a display nickname. The nickname is shown first in the task module's **負責人** menu; the account identity remains the value stored in the database, so renaming someone does not break their assignments. Editors can assign task owners but cannot manage membership. Viewers can see assignments but cannot change them.

To check the most recent backup, read `backups/status/last-success.txt`. Its matching checksum file in `backups/status/` verifies the three archive files.

To validate a backup without changing the live database, run the following from the project folder (replace the ID with `last-success.txt`):

```bash
docker compose exec backup verify-backup 20260806T021936Z
```

This checks checksums, both archives, and the PostgreSQL dump format. It is an integrity check, not a destructive restore drill; restore into a separate environment before using a backup for disaster recovery.

For a network deployment, put the `app` and `collab` services behind a TLS reverse proxy, set `NEXTAUTH_URL` to the public HTTPS address, and set `NEXT_PUBLIC_COLLABORATION_URL` to its matching `wss://` endpoint. Do not expose PostgreSQL, Redis, or MinIO to the public Internet.

## Development

Requires Node.js 22+ and pnpm.

```bash
cp .env.example .env
pnpm install
pnpm db:generate
pnpm db:push
pnpm db:seed
pnpm dev
```

In a second terminal, run `pnpm collab`. Set `DATABASE_URL` to `localhost` rather than `postgres` when PostgreSQL is running outside Compose.

## Data model

The authoritative Prisma schema is [`prisma/schema.prisma`](prisma/schema.prisma). Its main relationships are:

```text
User ──< Membership >── Workspace ──< Project
Project ──< Document (self-referencing parent/children tree)
Project ──< Database ──< DatabaseProperty | DatabaseView | DatabaseRow | DatabaseTemplate | DatabaseAutomation
Project ──< Task | Issue | BomItem | TestRecord
Document ──< Attachment (MinIO object key)
Document ──< DocumentComment | DocumentRevision
User ──< Notification
User ──< AuditEvent
```

### Module APIs

All routes require an authenticated project member; `POST` also requires `OWNER`, `ADMIN`, or `EDITOR`.

| Route | Purpose |
| --- | --- |
| `POST /api/projects/:id/documents` | Create a root or child document |
| `PATCH /api/documents/:id` | Persist title or Tiptap JSON |
| `POST /api/documents/:id/collaboration-token` | Obtain a short-lived, document-scoped Yjs token |
| `POST /api/projects/:id/databases` | Create a database with a default schema and table view |
| `PATCH /api/databases/:id` | Rename a database |
| `POST /api/databases/:id/properties` | Add a typed database property |
| `PATCH /api/databases/:id/properties/:propertyId` | Update a property definition |
| `POST /api/databases/:id/rows` | Add a database row |
| `PATCH /api/databases/:id/rows/:rowId` | Persist row values |
| `POST /api/databases/:id/views` | Create a saved filter/sort view |
| `PATCH /api/databases/:id/views/:viewId` | Persist a view's name, filter, or sort |
| `POST /api/databases/:id/templates` | Create or update a reusable row template |
| `POST /api/databases/:id/automations` | Create a row-created or row-updated rule |
| `GET/POST /api/documents/:id/comments` | Read or add document comments |
| `GET /api/documents/:id/revisions` | Read saved document versions |
| `POST /api/documents/:id/revisions/:revisionId/restore` | Restore a previous version |
| `GET /api/projects/:id/search?q=` | Search document and database titles |
| `GET/PATCH /api/notifications` | Read or mark notifications as read |
| `GET/POST /api/projects/:id/records/tasks` | Tasks |
| `GET/POST /api/projects/:id/records/issues` | Issues |
| `GET/POST /api/projects/:id/records/bom` | BOM records |
| `GET/POST /api/projects/:id/records/tests` | Test records |
| `POST /api/attachments` | Multipart file upload with `documentId` and `file` |
| `GET/POST /api/workspaces/:id/members` | List members or give an existing account a workspace role (admin/owner only) |
| `PATCH/DELETE /api/workspaces/:id/members/:memberId` | Update a nickname or role, or remove a member (admin/owner only) |
| `PATCH /api/projects/:id/records/tasks/:taskId` | Assign or clear a task's responsible workspace member |

## Environment variables

Use [`.env.example`](.env.example) as the complete non-secret template.

| Variable | Required | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | Cookie and collaboration-token signing key |
| `NEXTAUTH_URL` | Yes | Canonical app URL |
| `BOOTSTRAP_ADMIN_*` | First start | Initial owner account only |
| `NEXT_PUBLIC_COLLABORATION_URL` | Yes | Browser-reachable Yjs WebSocket URL |
| `COLLABORATION_TOKEN_TTL` | No | Collaboration token lifetime; default `10m` |
| `COLLABORATION_ALLOWED_ORIGINS` | No | Comma-separated browser origins allowed to open collaboration sockets |
| `MINIO_*` | For uploads | MinIO endpoint, credentials, and bucket |
| `MAX_ATTACHMENT_BYTES` | Attachment safety limit | Maximum upload size in bytes; default is 10 MiB |
| `ALLOWED_ATTACHMENT_MIME_TYPES` | Optional attachment allow-list | Comma-separated MIME types; blank permits all types |
| `REDIS_URL` | Planned scaling | Reserved for background jobs and collaboration scaling |
| `BACKUP_INTERVAL_HOURS` | No | Backup interval in hours; default `24` |
| `BACKUP_RETENTION_DAYS` | No | Days of backup archives retained; default `14` |

## Security and operational notes

- Use a unique, long `AUTH_SECRET` and replace the example passwords before the first launch.
- The collaboration server validates the application-signed document token before accepting a socket. It does not trust a room name supplied by the browser, restricts browser origins, and closes a socket at token expiry. A removed member therefore loses active editing access within the configured token lifetime (10 minutes by default).
- Keep the WebSocket URL private or TLS-protected in production. The token is short-lived but should still only travel over `wss://`.
- This MVP does not provide self-service registration, password recovery, deletion workflows, automated restore, SSO, or immutable audit retention. Add them before production use.
- For Rocket projects, preserve the existing safety discipline: state evaluation must remain `ObserveOnly`, unsafe/unknown ground links fail closed, and missing telemetry is represented as `UNKNOWN`/`---`, never silently converted to zero.

## Deliberately deferred

- AI assistant and OpenAI-compatible/Ollama provider configuration
- Fine-grained document sharing, invitations, and SSO
- Cursors/awareness UI, Yjs persistent update log, and multi-replica collaboration fan-out
- Rich record-editing forms, external integrations, exports, and automated restore

These are intentionally listed so the MVP is not mistaken for a complete production control system.
