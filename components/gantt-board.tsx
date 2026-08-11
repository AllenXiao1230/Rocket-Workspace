"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { calculateCriticalPath } from "@/lib/cpm";

type GanttTask = {
  id: string;
  title: string;
  status: string;
  startDate: string | Date | null;
  dueDate: string | Date | null;
  baselineStartDate?: string | Date | null;
  baselineDueDate?: string | Date | null;
  estimatedHours?: number | null;
  assignee?: { name: string } | null;
  dependencies?: Array<{ dependsOn: { id: string; title: string; status: string } }>;
};
const statusText: Record<string, string> = {
  BACKLOG: "待排程",
  TODO: "待處理",
  IN_PROGRESS: "進行中",
  BLOCKED: "受阻",
  DONE: "已完成",
};
const oneDay = 86_400_000;
const iso = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const toDate = (value: string) => new Date(`${value}T00:00:00`);
const datePart = (value: string | Date | null | undefined) =>
  typeof value === "string" ? value.slice(0, 10) : value ? iso(value) : "";
const mondayOf = (date: Date) => {
  const next = new Date(date);
  next.setDate(next.getDate() - ((next.getDay() + 6) % 7));
  next.setHours(0, 0, 0, 0);
  return next;
};
const taskDays = (task: GanttTask) => {
  const start = datePart(task.startDate);
  const end = datePart(task.dueDate);
  return start && end
    ? Math.max(
        1,
        Math.round((toDate(end).getTime() - toDate(start).getTime()) / oneDay) + 1,
      )
    : 0;
};

export function GanttBoard({
  projectId,
  initialTasks,
  editable,
}: {
  projectId: string;
  initialTasks: GanttTask[];
  editable: boolean;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [anchor, setAnchor] = useState(() => mondayOf(new Date()));
  const [notice, setNotice] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newStart, setNewStart] = useState(iso(mondayOf(new Date())));
  const [newEnd, setNewEnd] = useState(
    iso(new Date(mondayOf(new Date()).getTime() + 6 * oneDay)),
  );
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const days = useMemo(
    () =>
      Array.from(
        { length: 42 },
        (_, index) => new Date(anchor.getTime() + index * oneDay),
      ),
    [anchor],
  );
  const canEdit = editable && editMode;
  useEffect(() => {
    void fetch(`/api/projects/${projectId}/records/tasks`, { cache: "no-store" })
      .then(async (response) =>
        response.ok ? (response.json() as Promise<GanttTask[]>) : null,
      )
      .then((data) => {
        if (data) setTasks(data);
      })
      .catch(() => undefined);
    void fetch(`/api/projects/${projectId}/work-calendar`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (Array.isArray(data?.workingDays)) setWorkingDays(data.workingDays);
      });
  }, [projectId]);
  async function saveWorkingDays(days: number[]) {
    const response = await fetch(`/api/projects/${projectId}/work-calendar`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workingDays: days }),
    });
    const result = await response.json();
    if (!response.ok) return setNotice(result.error || "工作日曆未儲存");
    setWorkingDays(result.workingDays);
    setNotice("工作日曆已更新");
  }
  async function savePlan(task: GanttTask, changes: Partial<GanttTask>) {
    try {
      const response = await fetch(
        `/api/projects/${projectId}/records/tasks/${task.id}/planning`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changes),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "無法儲存排程");
      setTasks((current) => current.map((item) => (item.id === task.id ? result : item)));
      setNotice("甘特圖已更新");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "無法儲存排程");
    }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const response = await fetch(`/api/projects/${projectId}/records/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          startDate: newStart || null,
          dueDate: newEnd || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "無法新增任務");
      setTasks((current) => [result, ...current]);
      setNewTitle("");
      setNotice("已新增排程任務");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "無法新增任務");
    }
  }
  async function setBaseline() {
    const candidates = tasks.filter((task) => task.startDate && task.dueDate);
    await Promise.all(
      candidates.map((task) =>
        savePlan(task, {
          baselineStartDate: datePart(task.startDate),
          baselineDueDate: datePart(task.dueDate),
        }),
      ),
    );
    setNotice(`已建立 ${candidates.length} 項任務的時程基線`);
  }
  function moveTask(task: GanttTask, day: Date) {
    const duration = taskDays(task);
    if (!duration) return setNotice("請先設定此任務的開始與結束日期");
    const startDate = iso(day);
    const dueDate = iso(new Date(day.getTime() + (duration - 1) * oneDay));
    void savePlan(task, { startDate, dueDate });
  }
  const incompleteDependencies = (task: GanttTask) =>
    (task.dependencies || []).filter(
      (dependency) => dependency.dependsOn.status !== "DONE",
    );
  const cpm = useMemo(
    () =>
      calculateCriticalPath(
        tasks.map((task) => ({
          id: task.id,
          startDate: task.startDate,
          dueDate: task.dueDate,
          dependencies: (task.dependencies || []).map(
            (dependency) => dependency.dependsOn.id,
          ),
        })),
      ),
    [tasks],
  );
  const criticalTasks = useMemo(
    () => new Set(cpm.results.filter((item) => item.critical).map((item) => item.id)),
    [cpm],
  );
  const slackById = useMemo(
    () => new Map(cpm.results.map((item) => [item.id, item.slackDays])),
    [cpm],
  );
  const resourceLoad = useMemo(
    () => [
      ...new Map(
        tasks
          .filter((task) => task.assignee?.name)
          .map((task) => task.assignee!.name)
          .map((name) => [
            name,
            {
              tasks: tasks.filter((task) => task.assignee?.name === name).length,
              hours: tasks
                .filter((task) => task.assignee?.name === name)
                .reduce(
                  (sum, task) => sum + (task.estimatedHours ?? taskDays(task) * 8),
                  0,
                ),
            },
          ]),
      ).entries(),
    ],
    [tasks],
  );
  async function autoScheduleDependencies() {
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const changes: Array<{ task: GanttTask; startDate: string; dueDate: string }> = [];
    for (const task of tasks) {
      const latest = (task.dependencies || [])
        .map((dependency) => byId.get(dependency.dependsOn.id))
        .filter((item): item is GanttTask => Boolean(item))
        .map((dependency) => datePart(dependency.dueDate))
        .filter(Boolean)
        .sort()
        .at(-1);
      if (!latest) continue;
      const minStart = iso(new Date(toDate(latest).getTime() + oneDay));
      if (!datePart(task.startDate) || datePart(task.startDate) < minStart) {
        const duration = Math.max(1, taskDays(task));
        changes.push({
          task,
          startDate: minStart,
          dueDate: iso(new Date(toDate(minStart).getTime() + (duration - 1) * oneDay)),
        });
      }
    }
    for (const change of changes) await savePlan(change.task, change);
    setNotice(
      changes.length
        ? `已依前置任務順延 ${changes.length} 項任務`
        : "所有相依任務的日期皆已符合前置關係",
    );
  }
  const bar = (task: GanttTask, baseline = false) => {
    const startValue = datePart(baseline ? task.baselineStartDate : task.startDate);
    const dueValue = datePart(baseline ? task.baselineDueDate : task.dueDate);
    if (!startValue || !dueValue) return null;
    const start = Math.round((toDate(startValue).getTime() - anchor.getTime()) / oneDay);
    const end = Math.round((toDate(dueValue).getTime() - anchor.getTime()) / oneDay);
    if (end < 0 || start > 41) return null;
    const left = Math.max(0, start);
    const span = Math.max(1, Math.min(41, end) - left + 1);
    return (
      <span
        draggable={!baseline && canEdit}
        onDragStart={() => setDraggedTaskId(task.id)}
        className={`${baseline ? "gantt-baseline" : `gantt-bar ${task.status.toLowerCase()}${criticalTasks.has(task.id) ? " critical" : ""}`}`}
        style={{ gridColumn: `${left + 1} / span ${span}` }}
        title={`${baseline ? "基線" : task.title}：${startValue} 至 ${dueValue}`}
      >
        {!baseline && span > 3 ? task.title : ""}
      </span>
    );
  };
  return (
    <section className="module-view gantt-view">
      <div className="module-hero">
        <div>
          <p className="eyebrow">專案模組 · 時程管理</p>
          <h1>甘特圖</h1>
          <p>可拖曳任務到日期格調整時程；虛線為基線，紅框代表 CPM 關鍵路徑。</p>
        </div>
        <div className="module-hero-actions">
          {editable && (
            <button
              className={canEdit ? "module-edit-toggle active" : "module-edit-toggle"}
              onClick={() => setEditMode((current) => !current)}
            >
              {canEdit ? "✓ 完成編輯" : "✎ 啟用編輯"}
            </button>
          )}
          <span className="overview-badge">
            {tasks.length} 項 · CPM {cpm.projectDurationDays} 天
          </span>
        </div>
      </div>
      {canEdit ? (
        <form className="gantt-create" onSubmit={(event) => void create(event)}>
          <input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="新增排程任務"
            required
          />
          <label>
            開始
            <input
              type="date"
              value={newStart}
              onChange={(event) => setNewStart(event.target.value)}
            />
          </label>
          <label>
            結束
            <input
              type="date"
              value={newEnd}
              min={newStart || undefined}
              onChange={(event) => setNewEnd(event.target.value)}
            />
          </label>
          <button type="submit">＋ 加入甘特圖</button>
        </form>
      ) : (
        <p className="module-locked-hint">
          {editable
            ? "目前為閱讀模式。按「啟用編輯」後才可建立、拖曳或調整排程。"
            : "你目前為檢視者，只能閱讀此模組。"}
        </p>
      )}
      <div className="gantt-controls">
        <button
          onClick={() =>
            setAnchor((current) => new Date(current.getTime() - 42 * oneDay))
          }
        >
          ← 前六週
        </button>
        <strong>
          {anchor.toLocaleDateString("zh-TW", { month: "long", year: "numeric" })} 起
        </strong>
        <button onClick={() => setAnchor(mondayOf(new Date()))}>今天</button>
        {canEdit && (
          <>
            <button onClick={() => void setBaseline()}>設定目前基線</button>
            <button onClick={() => void autoScheduleDependencies()}>
              依相依關係自動排程
            </button>
          </>
        )}
        <button
          onClick={() =>
            setAnchor((current) => new Date(current.getTime() + 42 * oneDay))
          }
        >
          後六週 →
        </button>
      </div>
      {canEdit && (
        <div className="gantt-work-calendar">
          <strong>工作日曆</strong>
          {[0, 1, 2, 3, 4, 5, 6].map((day) => (
            <label key={day}>
              <input
                type="checkbox"
                checked={workingDays.includes(day)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...workingDays, day].sort()
                    : workingDays.filter((value) => value !== day);
                  if (next.length) void saveWorkingDays(next);
                  else setNotice("至少保留一個工作日");
                }}
              />
              {["日", "一", "二", "三", "四", "五", "六"][day]}
            </label>
          ))}
        </div>
      )}
      {cpm.cycles.length > 0 && (
        <p className="error">
          相依關係包含循環：{cpm.cycles.join("、")}。請先修正，避免產生不可信的排程。
        </p>
      )}
      {resourceLoad.length > 0 && (
        <div className="gantt-resources">
          資源負載：
          {resourceLoad.map(([name, load]) => (
            <span key={name}>
              {name} · {load.tasks} 項／{load.hours}h
            </span>
          ))}
        </div>
      )}
      <div className="gantt-scroll">
        <div className="gantt-chart">
          <div className="gantt-head gantt-row">
            <div className="gantt-task-label">任務與日期</div>
            <div className="gantt-days">
              {days.map((day) => (
                <span
                  className={day.getDay() === 0 || day.getDay() === 6 ? "weekend" : ""}
                  key={day.toISOString()}
                >
                  <b>{day.getDate()}</b>
                  <small>
                    {["日", "一", "二", "三", "四", "五", "六"][day.getDay()]}
                  </small>
                </span>
              ))}
            </div>
          </div>
          {tasks.length ? (
            tasks.map((task) => {
              const blockedBy = incompleteDependencies(task);
              const slack = slackById.get(task.id);
              return (
                <div className="gantt-row" key={task.id}>
                  <div className="gantt-task-label">
                    <strong>
                      {criticalTasks.has(task.id) ? "◆ " : ""}
                      {task.title}
                    </strong>
                    <span>
                      {statusText[task.status] || task.status}
                      {task.assignee?.name ? ` · ${task.assignee.name}` : ""}
                      {slack !== undefined ? ` · 餘裕 ${slack} 天` : ""}
                    </span>
                    {blockedBy.length ? (
                      <span className="gantt-dependency-warning">
                        ⚠ 等待：
                        {blockedBy
                          .map((dependency) => dependency.dependsOn.title)
                          .join("、")}
                      </span>
                    ) : null}
                    {canEdit ? (
                      <div className="gantt-date-inputs">
                        <input
                          aria-label={`${task.title} 開始日期`}
                          type="date"
                          value={datePart(task.startDate)}
                          onChange={(event) =>
                            void savePlan(task, { startDate: event.target.value || null })
                          }
                        />
                        <span>→</span>
                        <input
                          aria-label={`${task.title} 結束日期`}
                          type="date"
                          value={datePart(task.dueDate)}
                          min={datePart(task.startDate) || undefined}
                          onChange={(event) =>
                            void savePlan(task, { dueDate: event.target.value || null })
                          }
                        />
                        <input
                          aria-label={`${task.title} 預估工時`}
                          type="number"
                          min="0"
                          step="0.5"
                          placeholder="工時"
                          value={task.estimatedHours ?? ""}
                          onChange={(event) =>
                            void savePlan(task, {
                              estimatedHours: event.target.value
                                ? Number(event.target.value)
                                : null,
                            })
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className="gantt-track">
                    {days.map((day) => (
                      <i
                        onDragOver={(event) => {
                          if (canEdit) event.preventDefault();
                        }}
                        onDrop={() => {
                          const moved = tasks.find((item) => item.id === draggedTaskId);
                          if (moved) moveTask(moved, day);
                          setDraggedTaskId(null);
                        }}
                        className={
                          day.getDay() === 0 || day.getDay() === 6 ? "weekend" : ""
                        }
                        key={day.toISOString()}
                      />
                    ))}
                    {bar(task, true)}
                    {bar(task)}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty">尚無任務；建立第一項排程後即可顯示甘特圖。</div>
          )}
        </div>
      </div>
      {notice && <span className="collab-notice">{notice}</span>}
    </section>
  );
}
