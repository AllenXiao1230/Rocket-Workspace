export type MyTask = {
  id: string;
  title: string;
  status: string;
  priority: number;
  dueDate: string | Date | null;
  updatedAt?: string | Date;
  projectId: string;
  projectName: string;
  projectCode: string;
  dependencies?: Array<{ dependsOn: { id: string; title: string; status: string } }>;
};

export type WorkGroups = { pending: MyTask[]; inProgress: MyTask[]; blocked: MyTask[] };

export function dueTime(value: MyTask["dueDate"]) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

export function dayStart(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

export function groupMyTasks(tasks: MyTask[]): WorkGroups {
  const now = dayStart(new Date());
  const sort = (left: MyTask, right: MyTask) => {
    const leftDue = dueTime(left.dueDate);
    const rightDue = dueTime(right.dueDate);
    const leftOverdue = leftDue !== null && leftDue < now;
    const rightOverdue = rightDue !== null && rightDue < now;
    if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;
    if (leftDue !== null && rightDue !== null && leftDue !== rightDue)
      return leftDue - rightDue;
    if (leftDue !== null && rightDue === null) return -1;
    if (leftDue === null && rightDue !== null) return 1;
    if (left.priority !== right.priority) return left.priority - right.priority;
    return (
      new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
    );
  };
  const open = tasks.filter((task) => task.status !== "DONE");
  return {
    pending: open
      .filter((task) => task.status === "BACKLOG" || task.status === "TODO")
      .sort(sort),
    inProgress: open.filter((task) => task.status === "IN_PROGRESS").sort(sort),
    blocked: open.filter((task) => task.status === "BLOCKED").sort(sort),
  };
}

export function taskDueLabel(value: MyTask["dueDate"]) {
  const due = dueTime(value);
  if (due === null) return { text: "未設期限", state: "none" };
  const today = dayStart(new Date());
  const delta = Math.round((due - today) / 86_400_000);
  if (delta < 0) return { text: "已逾期", state: "overdue" };
  if (delta === 0) return { text: "今天到期", state: "today" };
  if (delta === 1) return { text: "明天到期", state: "soon" };
  return {
    text: new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric" }).format(
      new Date(value!),
    ),
    state: "future",
  };
}
