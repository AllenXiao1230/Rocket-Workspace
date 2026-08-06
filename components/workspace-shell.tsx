"use client";

import { useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { CollaborativeEditor } from "@/components/collaborative-editor";
import { DatabaseTable, type DatabaseData } from "@/components/database-view";
import { WorkspaceSearch } from "@/components/workspace-search";
import { SettingsPanel } from "@/components/settings-panel";
import { TeamManagement, type TeamMember } from "@/components/team-management";
import { ProjectModuleBoard, type ModuleRecord } from "@/components/project-module-board";
import { GanttBoard } from "@/components/gantt-board";
import { DocumentRecycleBin } from "@/components/document-recycle-bin";

type DocumentItem = { id: string; title: string; icon: string; parentId: string | null; content: Record<string, unknown>; markdown: string | null; updatedAt: Date | string; position: number };
type RecordData = { tasks: Array<ModuleRecord & { title: string; status: string; priority: number; startDate: string | Date | null; dueDate: string | Date | null }>; issues: Array<ModuleRecord & { key: string; title: string; status: string; severity: number }>; bom: Array<ModuleRecord & { partNumber: string; name: string; quantity: number; status: string; unitCost: string | null }>; tests: Array<ModuleRecord & { title: string; outcome: string; operator: string | null }> };
type ModuleName = keyof RecordData;
type WorkspaceModule = ModuleName | "gantt";

const moduleLabels: Record<WorkspaceModule, string> = { tasks: "任務", gantt: "甘特圖", issues: "議題", bom: "物料清單", tests: "測試紀錄" };
const moduleIcons: Record<WorkspaceModule, string> = { tasks: "✓", gantt: "▤", issues: "!", bom: "◫", tests: "⌁" };

function DocumentTree({ documents, activeId, onSelect, onCreateChild, onMove, onDuplicate, onDelete }: { documents: DocumentItem[]; activeId: string; onSelect: (id: string) => void; onCreateChild: (parentId: string) => void; onMove: (draggedId: string, targetId: string, placement: "before" | "after" | "inside") => void; onDuplicate: (id: string) => void; onDelete: (id: string) => void }) {
  const byParent = useMemo(() => documents.reduce<Record<string, DocumentItem[]>>((acc, item) => { const key = item.parentId || "root"; (acc[key] ||= []).push(item); return acc; }, {}), [documents]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set()); const [draggedId, setDraggedId] = useState<string | null>(null); const [dropTarget, setDropTarget] = useState<string | null>(null); const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const toggle = (id: string) => setCollapsed((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const render = (parentId: string | null, depth = 0): React.ReactNode => (byParent[parentId || "root"] || []).map((item) => { const hasChildren = Boolean(byParent[item.id]?.length); return <div className="tree-item" key={item.id}><div className={`tree-row ${dropTarget === item.id ? "drag-target" : ""}`} draggable onContextMenu={(event) => { event.preventDefault(); setContextMenu({ id: item.id, x: event.clientX, y: event.clientY }); }} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); setDraggedId(item.id); }} onDragEnd={() => { setDraggedId(null); setDropTarget(null); }} onDragOver={(event) => { if (draggedId && draggedId !== item.id) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget(item.id); } }} onDragLeave={() => setDropTarget((current) => current === item.id ? null : current)} onDrop={(event) => { event.preventDefault(); const source = event.dataTransfer.getData("text/plain") || draggedId; if (!source || source === item.id) return; const rect = event.currentTarget.getBoundingClientRect(); const placement = event.clientY < rect.top + rect.height * .28 ? "before" : event.clientY > rect.bottom - rect.height * .28 ? "after" : "inside"; onMove(source, item.id, placement); setDraggedId(null); setDropTarget(null); }}><button className="tree-collapse" aria-label={hasChildren ? (collapsed.has(item.id) ? `展開 ${item.title}` : `摺疊 ${item.title}`) : "沒有子頁面"} disabled={!hasChildren} onClick={() => toggle(item.id)}>{hasChildren ? (collapsed.has(item.id) ? "›" : "⌄") : "·"}</button><button className={activeId === item.id ? "active" : ""} onClick={() => onSelect(item.id)}><span className="tree-rail" style={{ marginLeft: depth * 14 }}>{item.icon || "📄"}</span><span>{item.title}</span></button><button className="tree-subpage" aria-label={`在 ${item.title} 下新增子頁面`} onClick={() => onCreateChild(item.id)}>＋</button></div>{!collapsed.has(item.id) && render(item.id, depth + 1)}</div>; });
  return <nav className="tree" aria-label="文件樹" onClick={() => setContextMenu(null)}>{render(null)}{contextMenu && <div className="tree-context-menu" role="menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}><button onClick={() => { onDuplicate(contextMenu.id); setContextMenu(null); }}>⧉ 複製文件</button><button className="danger" onClick={() => { const document = documents.find((item) => item.id === contextMenu.id); if (document && window.confirm(`確定要刪除「${document.title}」嗎？`)) onDelete(contextMenu.id); setContextMenu(null); }}>⌫ 刪除文件</button></div>}</nav>;
}

function RecordView({ module, data }: { module: ModuleName; data: RecordData }) {
  const rows: string[][] = module === "tasks"
    ? data.tasks.map((r) => [r.title, r.status.replace("_", " "), `P${r.priority}`])
    : module === "issues"
      ? data.issues.map((r) => [`${r.key} · ${r.title}`, r.status, `S${r.severity}`])
      : module === "bom"
        ? data.bom.map((r) => [`${r.partNumber} · ${r.name}`, r.status, `× ${r.quantity}`])
        : data.tests.map((r) => [r.title, r.outcome, r.operator || "—"]);
  return <section className="module-view"><div className="module-hero"><div><p className="eyebrow">專案模組 · {String(rows.length).padStart(2, "0")}</p><h1>{moduleLabels[module]}</h1><p>專案記錄集中於此，讓每一項工作、風險與驗證結果都可追溯。</p></div><span className="overview-badge">總覽</span></div><div className="records"><div className="record header"><span>項目</span><span>狀態</span><span>資訊</span></div>{rows.length ? rows.map((row, i) => <div className="record" key={i}>{row.map((value, index) => <span key={index}>{index === 1 ? <span className="record-state">{value}</span> : value}</span>)}</div>) : <div className="empty">尚無紀錄</div>}</div></section>;
}

export function WorkspaceShell({ user, workspace, workspaceId, project, projects, documents: initialDocuments, databases: initialDatabases, records, teamMembers: initialTeamMembers }: { user: { name: string; role: string; avatarEmoji?: string | null }; workspace: string; workspaceId: string; project: { id: string; name: string; code: string }; projects: Array<{ id: string; name: string; code: string }>; documents: DocumentItem[]; databases: DatabaseData[]; records: RecordData; teamMembers: TeamMember[] }) {
  const [documents, setDocuments] = useState(initialDocuments); const [databases, setDatabases] = useState(initialDatabases); const [activeId, setActiveId] = useState(initialDocuments[0]?.id || ""); const [activeDatabaseId, setActiveDatabaseId] = useState(""); const [module, setModule] = useState<WorkspaceModule | null>(null); const [showSettings, setShowSettings] = useState(false); const [showTeam, setShowTeam] = useState(false); const [showRecycle, setShowRecycle] = useState(false); const [workspaceName, setWorkspaceName] = useState(workspace); const [projectDisplay, setProjectDisplay] = useState(project); const [teamMembers, setTeamMembers] = useState(initialTeamMembers); const [currentUser, setCurrentUser] = useState(user);
  const active = documents.find((item) => item.id === activeId); const initials = currentUser.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const completedTasks = records.tasks.filter((task) => task.status === "DONE").length; const taskProgress = records.tasks.length ? Math.round((completedTasks / records.tasks.length) * 100) : 0; const activeIssues = records.issues.filter((issue) => issue.status !== "RESOLVED" && issue.status !== "WONT_FIX").length;
  const activeDatabase = databases.find((database) => database.id === activeDatabaseId);
  async function createDocument(parentId?: string) {
    const title = window.prompt("新文件名稱"); if (!title?.trim()) return;
    const response = await fetch(`/api/projects/${project.id}/documents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim(), parentId: parentId || null }) });
    if (!response.ok) return window.alert("無法建立文件：請確認你的編輯權限。");
    const document = await response.json(); setDocuments((current) => [...current, document]); setActiveId(document.id); setActiveDatabaseId(""); setModule(null); setShowSettings(false); setShowTeam(false);
  }
  async function createDatabase() {
    const name = window.prompt("資料庫名稱", "專案追蹤表"); if (!name?.trim()) return;
    const response = await fetch(`/api/projects/${project.id}/databases`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
    if (!response.ok) return window.alert("無法建立資料庫：請確認你的編輯權限。"); const database = await response.json(); setDatabases((current) => [...current, database]); setActiveDatabaseId(database.id); setModule(null); setShowSettings(false); setShowTeam(false);
  }
  async function deleteDocument(id: string) {
    const response = await fetch(`/api/documents/${id}`, { method: "DELETE" }); if (!response.ok) return window.alert("無法刪除文件：請確認你的編輯權限。");
    const result = await response.json() as { removedIds: string[] }; setDocuments((current) => current.filter((document) => !result.removedIds.includes(document.id))); const next = documents.find((document) => !result.removedIds.includes(document.id)); setActiveId(next?.id || "");
  }
  async function duplicateDocument(id: string) {
    const response = await fetch(`/api/documents/${id}/duplicate`, { method: "POST" }); const result = await response.json();
    if (!response.ok) return window.alert(result.error || "無法複製文件：請確認你的編輯權限。");
    setDocuments((current) => [...current, result]); setActiveId(result.id); setActiveDatabaseId(""); setModule(null); setShowSettings(false); setShowTeam(false);
  }
  async function moveDocument(draggedId: string, targetId: string, placement: "before" | "after" | "inside") {
    const dragged = documents.find((item) => item.id === draggedId); const target = documents.find((item) => item.id === targetId); if (!dragged || !target || draggedId === targetId) return;
    const parentId = placement === "inside" ? target.id : target.parentId; const siblings = documents.filter((item) => item.parentId === parentId && item.id !== draggedId).sort((a, b) => a.position - b.position); const targetIndex = placement === "inside" ? siblings.length : siblings.findIndex((item) => item.id === targetId) + (placement === "after" ? 1 : 0);
    const response = await fetch(`/api/documents/${draggedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parentId, position: Math.max(0, targetIndex) }) }); const result = await response.json();
    if (!response.ok) return window.alert(result.error || "無法移動頁面"); const moved = new Map((result.documents as Array<{ id: string; parentId: string | null; position: number }>).map((item) => [item.id, item])); setDocuments((current) => current.map((item) => moved.has(item.id) ? { ...item, ...moved.get(item.id) } : item));
  }
  return <div className="app">
    <aside className="sidebar">
      <div className="brand-lockup"><span className="rocket-mark"><i /> <i /> <i /></span><div><p className="brand">Rocket Workspace</p><span className="brand-subtitle">任務控制台</span></div></div>
      <section className="project-card"><div className="project-code"><span className="live-dot" />{projectDisplay.code}</div><label><span className="sr-only">切換專案</span><select value={project.id} aria-label="切換專案" onChange={(event) => { window.location.assign(`/?project=${encodeURIComponent(event.target.value)}`); }}>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><span>專案工作空間</span></section>
      <div className="side-heading"><span>文件庫</span><span>{documents.length}</span></div>
      <DocumentTree documents={documents} activeId={activeId} onSelect={(id) => { setActiveId(id); setActiveDatabaseId(""); setModule(null); setShowSettings(false); setShowTeam(false); setShowRecycle(false); }} onCreateChild={createDocument} onMove={moveDocument} onDuplicate={(id) => void duplicateDocument(id)} onDelete={(id) => void deleteDocument(id)} />
      <button className="create-document" onClick={() => createDocument()}><span>＋</span> 新增頁面</button>
      <button className={`workspace-settings-link ${showRecycle ? "active" : ""}`} onClick={() => { setShowRecycle(true); setShowSettings(false); setShowTeam(false); setModule(null); setActiveDatabaseId(""); }}>♻ 回收桶</button>
      <div className="side-heading database-heading"><span>資料庫</span><span>{databases.length}</span></div>
      <nav className="database-nav" aria-label="資料庫">{databases.map((database) => <button key={database.id} className={activeDatabaseId === database.id ? "active" : ""} onClick={() => { setActiveDatabaseId(database.id); setModule(null); setShowSettings(false); setShowTeam(false); }}><span>▦</span>{database.name}</button>)}</nav>
      <button className="create-database" onClick={createDatabase}><span>＋</span> 新增資料庫</button>
      <button className={`workspace-settings-link ${showTeam ? "active" : ""}`} onClick={() => { setShowTeam(true); setShowSettings(false); setModule(null); setActiveDatabaseId(""); }}>♙ 團隊成員</button>
      <button className={`workspace-settings-link ${showSettings ? "active" : ""}`} onClick={() => { setShowSettings(true); setShowTeam(false); setModule(null); setActiveDatabaseId(""); }}>⚙ 設定中心</button>
      <div className="sidebar-footer"><span className="safe-indicator" />ObserveOnly · 安全模式</div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumbs"><span>{workspaceName}</span><b>/</b><strong>{showSettings ? "設定中心" : showTeam ? "團隊成員" : showRecycle ? "回收桶" : module ? moduleLabels[module] : activeDatabase ? activeDatabase.name : active?.title || "文件"}</strong></div><div className="topbar-actions"><WorkspaceSearch projectId={project.id} onSelect={(result) => { setShowSettings(false); setShowTeam(false); setShowRecycle(false); setModule(null); if (result.type === "document") { setActiveId(result.id); setActiveDatabaseId(""); } else setActiveDatabaseId(result.id); }} /><button className="topbar-settings" aria-label="開啟設定中心" title="設定中心" onClick={() => { setShowSettings(true); setShowTeam(false); setShowRecycle(false); setModule(null); setActiveDatabaseId(""); }}>⚙</button><span className="sync-state"><i /> 即時同步中</span><span className="role-badge">{currentUser.role}</span><div className="avatar" title={currentUser.name}>{currentUser.avatarEmoji || initials}</div></div></header>
      {showSettings ? <SettingsPanel projectId={project.id} workspaceId={workspaceId} onIdentitySaved={({ workspaceName: nextWorkspace, projectName, projectCode }) => { setWorkspaceName(nextWorkspace); setProjectDisplay({ ...projectDisplay, name: projectName, code: projectCode }); }} onMembersChange={setTeamMembers} onProfileSaved={(profile) => setCurrentUser((current) => ({ ...current, ...profile }))} /> : showTeam ? <TeamManagement workspaceId={workspaceId} /> : showRecycle ? <DocumentRecycleBin projectId={project.id} canWrite={currentUser.role !== "VIEWER"} onRestored={() => window.location.reload()} /> : module === "gantt" ? <GanttBoard projectId={project.id} initialTasks={records.tasks} editable={currentUser.role !== "VIEWER"} /> : module ? <ProjectModuleBoard projectId={project.id} module={module} initialRecords={records[module]} members={teamMembers} editable={currentUser.role !== "VIEWER"} /> : activeDatabase ? <DatabaseTable key={activeDatabase.id} database={activeDatabase} allDatabases={databases} editable={currentUser.role !== "VIEWER"} onChange={(changed) => setDatabases((current) => current.map((database) => database.id === changed.id ? changed : database))} onDelete={(id) => { setDatabases((current) => current.filter((database) => database.id !== id)); setActiveDatabaseId(""); }} /> : active ? <CollaborativeEditor key={active.id} document={active} user={currentUser} editable={currentUser.role !== "VIEWER"} onCreateSubpage={createDocument} onIconChange={(icon) => setDocuments((current) => current.map((item) => item.id === active.id ? { ...item, icon } : item))} onDelete={() => void deleteDocument(active.id)} /> : <section className="document"><div className="empty">尚無文件</div></section>}
    </main>
    <aside className="rightbar">
      <section className="mission-panel"><div className="panel-label">任務整備度</div><div className="readiness-row"><div className="readiness-ring" style={{ "--progress": `${Math.max(taskProgress, 8)}%` } as React.CSSProperties}><span>{taskProgress}%</span></div><div><strong>工作空間運作正常</strong><p>文件、資料庫與協作服務已連線。</p></div></div><div className="readiness-foot"><span><i />ObserveOnly</span><span>v0.3 引擎</span></div></section>
      <section className="module-panel"><div className="panel-heading"><h2>專案模組</h2><span>即時</span></div><div className="module-list">{(Object.keys(moduleLabels) as WorkspaceModule[]).map((name) => <button key={name} className={`module ${module === name ? "active" : ""}`} onClick={() => { setModule(name); setActiveDatabaseId(""); setShowSettings(false); setShowTeam(false); }}><span className="module-icon">{moduleIcons[name]}</span><span className="module-name">{moduleLabels[name]}</span><span className="module-count">{name === "gantt" ? records.tasks.filter((task) => task.startDate && task.dueDate).length : records[name].length}</span></button>)}</div></section>
      <section className="signal-panel"><div className="panel-label">狀態訊號</div><div className="signal-row"><span>未解決議題</span><strong className={activeIssues ? "warning" : "good"}>{activeIssues}</strong></div><div className="signal-row"><span>測試紀錄</span><strong>{records.tests.length}</strong></div><div className="signal-row"><span>線上協作者</span><strong className="good">01</strong></div></section>
      <div className="account-row"><div className="avatar small">{currentUser.avatarEmoji || initials}</div><div><strong>{currentUser.name}</strong><span>{currentUser.role.toLowerCase()}</span></div><button className="logout" aria-label="登出" onClick={() => signOut({ callbackUrl: "/login" })}>↗</button></div>
    </aside>
  </div>;
}
