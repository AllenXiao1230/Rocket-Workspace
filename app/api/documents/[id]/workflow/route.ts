import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, documentAccess } from "@/lib/permissions";

const schema = z.object({
  action: z.enum([
    "lock",
    "unlock",
    "request_review",
    "approve",
    "changes_requested",
    "update_properties",
  ]),
  properties: z
    .record(z.string().trim().min(1).max(80), z.string().trim().max(2_000))
    .optional(),
});
const managers = (role: string) => role === "OWNER" || role === "ADMIN";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await documentAccess(session.user.id, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const document = await prisma.document.findUnique({
    where: { id },
    select: {
      properties: true,
      reviewState: true,
      reviewRequestedAt: true,
      reviewedAt: true,
      lockedAt: true,
      lockedById: true,
      reviewerId: true,
      lockedBy: { select: { name: true } },
      reviewer: { select: { name: true } },
    },
  });
  return NextResponse.json({
    ...document,
    canManage: managers(access.membership.role),
    canWrite: canWrite(access.membership.role),
    isLockedByMe: document?.lockedById === session.user.id,
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
  const access = await documentAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const input = schema.safeParse(await request.json().catch(() => null));
  if (
    !input.success ||
    (input.data.properties && Object.keys(input.data.properties).length > 40)
  )
    return NextResponse.json({ error: "工作流程資料不正確" }, { status: 400 });
  const current = access.document;
  const manage = managers(access.membership.role);
  const lockedByOther = current.lockedById && current.lockedById !== session.user.id;
  if (lockedByOther && !manage && input.data.action !== "unlock")
    return NextResponse.json({ error: "文件已被其他成員鎖定" }, { status: 423 });
  if (
    input.data.action === "unlock" &&
    current.lockedById &&
    current.lockedById !== session.user.id &&
    !manage
  )
    return NextResponse.json({ error: "只有鎖定者或管理者可解除鎖定" }, { status: 403 });
  if (
    (input.data.action === "approve" || input.data.action === "changes_requested") &&
    !manage
  )
    return NextResponse.json({ error: "只有擁有者或管理員可審核文件" }, { status: 403 });
  const now = new Date();
  const data =
    input.data.action === "lock"
      ? { lockedById: session.user.id, lockedAt: now }
      : input.data.action === "unlock"
        ? { lockedById: null, lockedAt: null }
        : input.data.action === "request_review"
          ? {
              reviewState: "IN_REVIEW" as const,
              reviewRequestedAt: now,
              reviewedAt: null,
              reviewerId: null,
            }
          : input.data.action === "approve"
            ? {
                reviewState: "APPROVED" as const,
                reviewedAt: now,
                reviewerId: session.user.id,
              }
            : input.data.action === "changes_requested"
              ? {
                  reviewState: "CHANGES_REQUESTED" as const,
                  reviewedAt: now,
                  reviewerId: session.user.id,
                }
              : { properties: input.data.properties as Prisma.InputJsonValue };
  const document = await prisma.document.update({
    where: { id },
    data,
    select: {
      properties: true,
      reviewState: true,
      reviewRequestedAt: true,
      reviewedAt: true,
      lockedAt: true,
      lockedById: true,
      reviewerId: true,
      lockedBy: { select: { name: true } },
      reviewer: { select: { name: true } },
    },
  });
  if (input.data.action === "request_review") {
    const reviewers = await prisma.membership.findMany({
      where: {
        workspaceId: current.project.workspaceId,
        role: { in: ["OWNER", "ADMIN"] },
        userId: { not: session.user.id },
      },
      select: { userId: true },
    });
    if (reviewers.length)
      await prisma.notification.createMany({
        data: reviewers.map((reviewer) => ({
          userId: reviewer.userId,
          title: `文件等待審核：${current.title}`,
          body: "請檢視並核准或要求修改。",
          href: `/?project=${current.projectId}`,
        })),
      });
  }
  await prisma.auditEvent.create({
    data: {
      userId: session.user.id,
      action: `document.workflow_${input.data.action}`,
      entity: "document",
      entityId: id,
      workspaceId: current.project.workspaceId,
      projectId: current.projectId,
    },
  });
  return NextResponse.json({
    ...document,
    canManage: manage,
    canWrite: true,
    isLockedByMe: document.lockedById === session.user.id,
  });
}
