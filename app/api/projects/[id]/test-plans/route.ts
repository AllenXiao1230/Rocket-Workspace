import { NextResponse } from "next/server";
import { ApprovalStatus } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, projectAccess } from "@/lib/permissions";

const inputSchema = z.object({
  title: z.string().trim().min(1).max(180),
  objective: z.string().trim().max(10_000).nullable().optional(),
  version: z.string().trim().max(80).nullable().optional(),
  approvalStatus: z.nativeEnum(ApprovalStatus).optional(),
});
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await projectAccess(session.user.id, id)))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(
    await prisma.testPlan.findMany({
      where: { projectId: id },
      include: { _count: { select: { records: true } } },
      orderBy: { updatedAt: "desc" },
    }),
  );
}
export async function POST(
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
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json({ error: "測試計畫資料不正確" }, { status: 400 });
  const plan = await prisma.testPlan.create({ data: { projectId: id, ...input.data } });
  await prisma.auditEvent.create({
    data: {
      userId: session.user.id,
      action: "test_plan.created",
      entity: "test_plan",
      entityId: plan.id,
      workspaceId: access.project.workspaceId,
      projectId: id,
      metadata: { title: plan.title, approvalStatus: plan.approvalStatus },
    },
  });
  return NextResponse.json(plan, { status: 201 });
}
