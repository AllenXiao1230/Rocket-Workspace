import { describe, expect, it } from "vitest";
import { groupMyTasks, type MyTask } from "@/lib/my-work";

const task = (id: string, status: string, overrides: Partial<MyTask> = {}): MyTask => ({ id, title: id, status, priority: 3, dueDate: null, projectId: "project", projectName: "Project", projectCode: "PRJ", ...overrides });

describe("groupMyTasks", () => {
  it("分類為互斥的待辦、進行中與受阻任務", () => {
    const groups = groupMyTasks([task("backlog", "BACKLOG"), task("todo", "TODO"), task("working", "IN_PROGRESS"), task("blocked", "BLOCKED"), task("done", "DONE")]);
    expect(groups.pending.map((item) => item.id)).toEqual(["backlog", "todo"]);
    expect(groups.inProgress.map((item) => item.id)).toEqual(["working"]);
    expect(groups.blocked.map((item) => item.id)).toEqual(["blocked"]);
  });

  it("把逾期任務與較高優先級排在前面", () => {
    const groups = groupMyTasks([task("none", "TODO", { priority: 1 }), task("future", "TODO", { dueDate: "2099-01-02", priority: 1 }), task("overdue", "TODO", { dueDate: "2000-01-02", priority: 5 })]);
    expect(groups.pending.map((item) => item.id)).toEqual(["overdue", "future", "none"]);
  });
});
