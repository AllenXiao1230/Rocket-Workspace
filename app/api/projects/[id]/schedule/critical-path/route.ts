import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectAccess } from "@/lib/permissions";
import { calculateCriticalPath } from "@/lib/cpm";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await projectAccess(session.user.id, id)))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const tasks = await prisma.task.findMany({
    where: { projectId: id, deletedAt: null },
    select: {
      id: true,
      startDate: true,
      dueDate: true,
      dependencies: { select: { dependsOnId: true } },
    },
  });
  return NextResponse.json(
    calculateCriticalPath(
      tasks.map((task) => ({
        ...task,
        dependencies: task.dependencies.map((dependency) => dependency.dependsOnId),
      })),
    ),
  );
}
