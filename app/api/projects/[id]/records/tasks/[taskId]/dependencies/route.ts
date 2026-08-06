import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, projectAccess } from "@/lib/permissions";

const inputSchema = z.object({ dependencyIds: z.array(z.string().cuid()).max(50) });
const taskInclude = {
  assignee: { select: { id: true, name: true, email: true } },
  dependencies: {
    where: { dependsOn: { deletedAt: null } },
    include: { dependsOn: { select: { id: true, title: true, status: true } } },
  },
} as const;

/** Returns true when `startId` already reaches `targetId` through prerequisite links. */
async function reachesTask(startId: string, targetId: string, projectId: string) {
  let frontier = [startId];
  const visited = new Set<string>();
  while (frontier.length) {
    const current = frontier.filter((id) => !visited.has(id));
    current.forEach((id) => visited.add(id));
    if (current.includes(targetId)) return true;
    const links = await prisma.taskDependency.findMany({
      where: { taskId: { in: current }, task: { projectId, deletedAt: null }, dependsOn: { deletedAt: null } },
      select: { dependsOnId: true },
    });
    frontier = links.map((link) => link.dependsOnId).filter((id) => !visited.has(id));
  }
  return false;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, taskId } = await params;
  const access = await projectAccess(session.user.id, projectId);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "前置任務資料不正確" }, { status: 400 });

  const task = await prisma.task.findFirst({ where: { id: taskId, projectId, deletedAt: null }, select: { id: true } });
  if (!task) return NextResponse.json({ error: "找不到任務" }, { status: 404 });
  const dependencyIds = [...new Set(parsed.data.dependencyIds)];
  if (dependencyIds.includes(taskId)) return NextResponse.json({ error: "任務不能依賴自己" }, { status: 400 });
  const available = await prisma.task.findMany({ where: { id: { in: dependencyIds }, projectId, deletedAt: null }, select: { id: true } });
  if (available.length !== dependencyIds.length) return NextResponse.json({ error: "前置任務必須位於同一專案且尚未刪除" }, { status: 400 });
  for (const dependencyId of dependencyIds) {
    if (await reachesTask(dependencyId, taskId, projectId)) return NextResponse.json({ error: "這項設定會形成循環相依，未儲存" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.taskDependency.deleteMany({ where: { taskId } }),
    prisma.taskDependency.createMany({ data: dependencyIds.map((dependsOnId) => ({ taskId, dependsOnId })) }),
  ]);
  const updated = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });
  await prisma.auditEvent.create({ data: { userId: session.user.id, action: "task.dependencies.updated", entity: "task", entityId: taskId, metadata: { dependencyIds } } });
  return NextResponse.json(updated);
}
