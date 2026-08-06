"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type GanttTask = { id: string; title: string; status: string; startDate: string | Date | null; dueDate: string | Date | null; assignee?: { name: string } | null; dependencies?: Array<{ dependsOn: { id: string; title: string; status: string } }> };

const statusText: Record<string, string> = { BACKLOG: "待排程", TODO: "待處理", IN_PROGRESS: "進行中", BLOCKED: "受阻", DONE: "已完成" };
const oneDay = 86_400_000;
const iso = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const toDate = (value: string) => new Date(`${value}T00:00:00`);
const datePart = (value: string | Date | null) => typeof value === "string" ? value.slice(0, 10) : value ? iso(value) : "";
const mondayOf = (date: Date) => { const next = new Date(date); const shift = (next.getDay() + 6) % 7; next.setDate(next.getDate() - shift); next.setHours(0, 0, 0, 0); return next; };

export function GanttBoard({ projectId, initialTasks, editable }: { projectId: string; initialTasks: GanttTask[]; editable: boolean }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [anchor, setAnchor] = useState(() => mondayOf(new Date()));
  const [notice, setNotice] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newStart, setNewStart] = useState(iso(mondayOf(new Date())));
  const [newEnd, setNewEnd] = useState(iso(new Date(mondayOf(new Date()).getTime() + 6 * oneDay)));
  const days = useMemo(() => Array.from({ length: 42 }, (_, index) => new Date(anchor.getTime() + index * oneDay)), [anchor]);
  const canEdit = editable && editMode;

  useEffect(() => { void fetch(`/api/projects/${projectId}/records/tasks`, { cache: "no-store" }).then(async (response) => response.ok ? response.json() as Promise<GanttTask[]> : null).then((data) => { if (data) setTasks(data); }).catch(() => undefined); }, [projectId]);
  async function save(task: GanttTask, changes: Partial<Pick<GanttTask, "startDate" | "dueDate">>) {
    try {
      const response = await fetch(`/api/projects/${projectId}/records/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "無法儲存日期");
      setTasks((current) => current.map((item) => item.id === task.id ? result : item)); setNotice("甘特圖已更新");
    } catch (error) { setNotice(error instanceof Error ? error.message : "無法儲存日期"); }
  }
  async function create(event: FormEvent) {
    event.preventDefault(); if (!newTitle.trim()) return;
    try {
      const response = await fetch(`/api/projects/${projectId}/records/tasks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: newTitle.trim(), startDate: newStart || null, dueDate: newEnd || null }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "無法新增任務");
      setTasks((current) => [result, ...current]); setNewTitle(""); setNotice("已新增排程任務");
    } catch (error) { setNotice(error instanceof Error ? error.message : "無法新增任務"); }
  }
  const chartTask = (task: GanttTask) => {
    if (!task.startDate || !task.dueDate) return null;
    const startDate = datePart(task.startDate); const dueDate = datePart(task.dueDate); if (!startDate || !dueDate) return null;
    const start = Math.round((toDate(startDate).getTime() - anchor.getTime()) / oneDay);
    const end = Math.round((toDate(dueDate).getTime() - anchor.getTime()) / oneDay);
    if (end < 0 || start > 41) return null;
    const left = Math.max(0, start); const span = Math.max(1, Math.min(41, end) - left + 1);
    return <span className={`gantt-bar ${task.status.toLowerCase()}`} style={{ gridColumn: `${left + 1} / span ${span}` }} title={`${startDate} 至 ${dueDate}`}>{span > 3 ? task.title : ""}</span>;
  };
  const incompleteDependencies = (task: GanttTask) => (task.dependencies || []).filter((dependency) => dependency.dependsOn.status !== "DONE");
  return <section className="module-view gantt-view"><div className="module-hero"><div><p className="eyebrow">專案模組 · 時程管理</p><h1>甘特圖</h1><p>任務的開始與結束日期會同步回任務模組；可在這裡建立排程並調整時程。</p></div><div className="module-hero-actions">{editable && <button className={canEdit ? "module-edit-toggle active" : "module-edit-toggle"} onClick={() => setEditMode((current) => !current)}>{canEdit ? "✓ 完成編輯" : "✎ 啟用編輯"}</button>}<span className="overview-badge">{tasks.length} 項任務</span></div></div>
    {canEdit ? <form className="gantt-create" onSubmit={(event) => void create(event)}><input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="新增排程任務" required /><label>開始<input type="date" value={newStart} onChange={(event) => setNewStart(event.target.value)} /></label><label>結束<input type="date" value={newEnd} min={newStart || undefined} onChange={(event) => setNewEnd(event.target.value)} /></label><button type="submit">＋ 加入甘特圖</button></form> : <p className="module-locked-hint">{editable ? "目前為閱讀模式。按「啟用編輯」後才可建立或調整排程。" : "你目前為檢視者，只能閱讀此模組。"}</p>}
    <div className="gantt-controls"><button onClick={() => setAnchor((current) => new Date(current.getTime() - 42 * oneDay))}>← 前六週</button><strong>{anchor.toLocaleDateString("zh-TW", { month: "long", year: "numeric" })} 起</strong><button onClick={() => setAnchor(mondayOf(new Date()))}>今天</button><button onClick={() => setAnchor((current) => new Date(current.getTime() + 42 * oneDay))}>後六週 →</button></div>
    <div className="gantt-scroll"><div className="gantt-chart"><div className="gantt-head gantt-row"><div className="gantt-task-label">任務與日期</div><div className="gantt-days">{days.map((day) => <span className={day.getDay() === 0 || day.getDay() === 6 ? "weekend" : ""} key={day.toISOString()}><b>{day.getDate()}</b><small>{["日", "一", "二", "三", "四", "五", "六"][day.getDay()]}</small></span>)}</div></div>{tasks.length ? tasks.map((task) => { const blockedBy = incompleteDependencies(task); return <div className="gantt-row" key={task.id}><div className="gantt-task-label"><strong>{task.title}</strong><span>{statusText[task.status] || task.status}{task.assignee?.name ? ` · ${task.assignee.name}` : ""}</span>{blockedBy.length ? <span className="gantt-dependency-warning">⚠ 等待：{blockedBy.map((dependency) => dependency.dependsOn.title).join("、")}</span> : null}{canEdit ? <div className="gantt-date-inputs"><input aria-label={`${task.title} 開始日期`} type="date" value={datePart(task.startDate)} onChange={(event) => void save(task, { startDate: event.target.value || null })}/><span>→</span><input aria-label={`${task.title} 結束日期`} type="date" value={datePart(task.dueDate)} min={datePart(task.startDate) || undefined} onChange={(event) => void save(task, { dueDate: event.target.value || null })}/></div> : null}</div><div className="gantt-track">{days.map((day) => <i className={day.getDay() === 0 || day.getDay() === 6 ? "weekend" : ""} key={day.toISOString()} />)}{chartTask(task)}</div></div>; }) : <div className="empty">尚無任務；建立第一項排程後即可顯示甘特圖。</div>}</div></div>{notice && <span className="collab-notice">{notice}</span>}</section>;
}
