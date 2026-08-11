"use client";

import { useMemo, useState } from "react";
import { groupMyTasks, taskDueLabel, type MyTask } from "@/lib/my-work";
export type { MyTask } from "@/lib/my-work";

const priorityLabel: Record<number, string> = {
  1: "最高",
  2: "高",
  3: "中",
  4: "低",
  5: "最低",
};

export function MyWorkPanel({
  tasks,
  editable,
  currentProjectId,
  onOpenTask,
  onTaskUpdated,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: {
  tasks: MyTask[];
  editable: boolean;
  currentProjectId: string;
  onOpenTask: (task: MyTask) => void;
  onTaskUpdated: (task: MyTask) => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  const groups = useMemo(() => groupMyTasks(tasks), [tasks]);
  const [notice, setNotice] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const unfinished = (task: MyTask) =>
    (task.dependencies || [])
      .filter((dependency) => dependency.dependsOn.status !== "DONE")
      .map((dependency) => dependency.dependsOn.title);

  async function complete(task: MyTask) {
    if (!editable || savingId) return;
    const pendingDependencies = unfinished(task);
    if (pendingDependencies.length)
      return setNotice(
        `尚有前置任務未完成：${pendingDependencies.slice(0, 2).join("、")}${pendingDependencies.length > 2 ? "…" : ""}`,
      );
    setSavingId(task.id);
    setNotice("");
    try {
      const response = await fetch(
        `/api/projects/${task.projectId}/records/tasks/${task.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "DONE" }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "無法完成任務");
      onTaskUpdated({ ...task, ...result });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "無法完成任務");
    } finally {
      setSavingId(null);
    }
  }

  const taskRow = (task: MyTask) => {
    const due = taskDueLabel(task.dueDate);
    return (
      <article className="my-work-item" key={task.id}>
        <button
          className="my-work-check"
          aria-label={`完成 ${task.title}`}
          title="標記為完成"
          disabled={!editable || savingId === task.id}
          onClick={() => void complete(task)}
        >
          ○
        </button>
        <button className="my-work-main" onClick={() => onOpenTask(task)}>
          <strong>{task.title}</strong>
          <span>
            {task.projectCode} · <em className={`due-${due.state}`}>{due.text}</em>
          </span>
        </button>
        <i
          className={`priority priority-${task.priority}`}
          title={`優先級：${priorityLabel[task.priority] || task.priority}`}
        >
          P{task.priority}
        </i>
      </article>
    );
  };
  const section = (title: string, list: MyTask[], empty: string) => (
    <div className="my-work-section">
      <h3>
        {title}
        <small>{list.length}</small>
      </h3>
      {list.length ? (
        list.slice(0, 6).map(taskRow)
      ) : (
        <p className="my-work-empty">{empty}</p>
      )}
    </div>
  );

  return (
    <section className="my-work-panel">
      <div className="panel-heading">
        <h2>我的工作</h2>
        <button
          type="button"
          onClick={() =>
            onOpenTask({
              id: "",
              title: "",
              status: "",
              priority: 3,
              dueDate: null,
              projectId: currentProjectId,
              projectName: "",
              projectCode: "",
            })
          }
        >
          查看專案任務
        </button>
      </div>
      <div className="my-work-summary">
        <span>
          <strong>{groups.pending.length}</strong> 待辦
        </span>
        <span>
          <strong>{groups.inProgress.length}</strong> 進行中
        </span>
        <span>
          <strong>{groups.blocked.length}</strong> 受阻
        </span>
      </div>
      {section("待辦事項", groups.pending, "沒有待處理事項。")}
      {section("進行中", groups.inProgress, "目前沒有進行中的任務。")}
      {groups.blocked.length > 0 && section("受阻任務", groups.blocked, "")}
      {hasMore && (
        <button
          className="button-secondary"
          type="button"
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          {loadingMore ? "載入中…" : "載入更多任務"}
        </button>
      )}
      {notice && (
        <p className="my-work-notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
