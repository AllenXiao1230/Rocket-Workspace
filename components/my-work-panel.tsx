"use client";

import { useMemo, useState } from "react";

export type MyTask = { id: string; title: string; status: string; priority: number; dueDate: string | Date | null; projectId: string; projectName: string; projectCode: string };

const statusLabel: Record<string, string> = { BACKLOG: "待排程", TODO: "待處理", IN_PROGRESS: "進行中", BLOCKED: "受阻", DONE: "已完成" };
const dateText = (value: string | Date | null) => value ? new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric" }).format(new Date(value)) : "未設期限";

export function MyWorkPanel({ tasks: initialTasks, editable, currentProjectId, onOpenTasks }: { tasks: MyTask[]; editable: boolean; currentProjectId: string; onOpenTasks: (projectId: string) => void }) {
  const [tasks, setTasks] = useState(initialTasks);
  const active = useMemo(() => tasks.filter((task) => task.status !== "DONE"), [tasks]);
  const todos = useMemo(() => active.filter((task) => task.status === "TODO" || task.status === "BACKLOG"), [active]);
  const visibleTasks = active.slice(0, 5); const visibleTodos = todos.slice(0, 4);
  async function complete(task: MyTask) {
    if (!editable) return;
    const response = await fetch(`/api/projects/${task.projectId}/records/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "DONE" }) });
    if (!response.ok) return;
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: "DONE" } : item));
  }
  const open = (task: MyTask) => onOpenTasks(task.projectId || currentProjectId);
  const taskRow = (task: MyTask, showStatus: boolean) => <article className="my-work-item" key={task.id}><button className="my-work-check" aria-label={`完成 ${task.title}`} disabled={!editable} onClick={() => void complete(task)}>○</button><button className="my-work-main" onClick={() => open(task)}><strong>{task.title}</strong><span>{task.projectCode} · {dateText(task.dueDate)}{showStatus ? ` · ${statusLabel[task.status] || task.status}` : ""}</span></button><i className={`priority priority-${task.priority}`}>P{task.priority}</i></article>;
  return <section className="my-work-panel"><div className="panel-heading"><h2>我的工作</h2><button type="button" onClick={() => onOpenTasks(currentProjectId)}>查看全部</button></div><div className="my-work-summary"><span><strong>{active.length}</strong> 進行中</span><span><strong>{todos.length}</strong> 待辦</span></div><div className="my-work-section"><h3>指派給我</h3>{visibleTasks.length ? visibleTasks.map((task) => taskRow(task, true)) : <p className="my-work-empty">目前沒有進行中的任務。</p>}</div><div className="my-work-section"><h3>待辦事項</h3>{visibleTodos.length ? visibleTodos.map((task) => taskRow(task, false)) : <p className="my-work-empty">沒有待處理事項。</p>}</div></section>;
}
