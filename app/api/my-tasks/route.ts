import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const takeFor = (value: string | null) => Math.min(100, Math.max(1, Number(value || 50) || 50));

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url); const take = takeFor(url.searchParams.get("take")); const cursor = url.searchParams.get("cursor");
  const tasks = await prisma.task.findMany({
    where: { assigneeId: session.user.id, deletedAt: null },
    orderBy: { id: "asc" },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { project: { select: { id: true, name: true, code: true } }, dependencies: { where: { dependsOn: { deletedAt: null } }, include: { dependsOn: { select: { id: true, title: true, status: true } } } } },
  });
  const hasMore = tasks.length > take; const items = hasMore ? tasks.slice(0, take) : tasks;
  return NextResponse.json({ tasks: items.map((task) => ({ id: task.id, title: task.title, status: task.status, priority: task.priority, dueDate: task.dueDate, updatedAt: task.updatedAt, dependencies: task.dependencies, projectId: task.project.id, projectName: task.project.name, projectCode: task.project.code })), nextCursor: hasMore ? items.at(-1)?.id || null : null });
}
