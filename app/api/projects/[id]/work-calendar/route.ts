import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, projectAccess } from "@/lib/permissions";

const schema = z.object({
  workingDays: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7)
    .refine((days) => new Set(days).size === days.length, "工作日不可重複"),
});
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await projectAccess(session.user.id, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    workingDays: Array.isArray(access.project.workingDays)
      ? access.project.workingDays
      : [1, 2, 3, 4, 5],
  });
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await projectAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json({ error: "工作日曆資料不正確" }, { status: 400 });
  const project = await prisma.project.update({
    where: { id },
    data: { workingDays: input.data.workingDays as Prisma.InputJsonValue },
    select: { workingDays: true },
  });
  await prisma.auditEvent.create({
    data: {
      userId: session.user.id,
      action: "project_work_calendar.updated",
      entity: "project",
      entityId: id,
      workspaceId: access.project.workspaceId,
      projectId: id,
      metadata: { workingDays: input.data.workingDays },
    },
  });
  return NextResponse.json(project);
}
