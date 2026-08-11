import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, projectAccess } from "@/lib/permissions";

const inputSchema = z.object({
  minutes: z
    .number()
    .int()
    .min(1)
    .max(24 * 60),
  note: z.string().trim().max(2_000).nullable().optional(),
  workDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, taskId } = await params;
  const access = await projectAccess(session.user.id, projectId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const task = await prisma.task.findFirst({
    where: { id: taskId, projectId, deletedAt: null },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(
    await prisma.taskWorkLog.findMany({
      where: { taskId },
      include: { user: { select: { name: true } } },
      orderBy: { workDate: "desc" },
    }),
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId, taskId } = await params;
  const access = await projectAccess(session.user.id, projectId);
  if (!access || !canWrite(access.membership.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json({ error: "工時資料不正確" }, { status: 400 });
  const task = await prisma.task.findFirst({
    where: { id: taskId, projectId, deletedAt: null },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const workLog = await prisma.taskWorkLog.create({
    data: {
      taskId,
      userId: session.user.id,
      minutes: input.data.minutes,
      note: input.data.note || null,
      workDate: input.data.workDate
        ? new Date(`${input.data.workDate}T00:00:00.000Z`)
        : new Date(),
    },
    include: { user: { select: { name: true } } },
  });
  await prisma.auditEvent.create({
    data: {
      userId: session.user.id,
      action: "task.worklog_created",
      entity: "task",
      entityId: taskId,
      workspaceId: access.project.workspaceId,
      projectId,
      metadata: { minutes: workLog.minutes },
    },
  });
  return NextResponse.json(workLog, { status: 201 });
}
