import { NextResponse } from "next/server";
import {
  ApprovalStatus,
  IssueStatus,
  PurchaseStatus,
  TaskStatus,
  TestOutcome,
} from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, projectAccess } from "@/lib/permissions";
import { isRecurrenceRule } from "@/lib/task-automation";
const moduleSchema = z.enum(["tasks", "issues", "bom", "tests"]);

const dateValue = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();
const taskSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.number().int().min(1).max(5).optional(),
  startDate: dateValue,
  dueDate: dateValue,
  assigneeId: z.string().cuid().nullable().optional(),
  parentId: z.string().cuid().nullable().optional(),
  milestone: z.boolean().optional(),
  recurrenceRule: z
    .string()
    .trim()
    .max(500)
    .refine(isRecurrenceRule, "週期規則格式不正確")
    .nullable()
    .optional(),
  recurrenceAnchor: dateValue,
  slaDueAt: dateValue,
});
const issueSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  key: z.string().trim().min(1).max(50).optional(),
  status: z.nativeEnum(IssueStatus).optional(),
  severity: z.number().int().min(1).max(5).optional(),
});
const bomSchema = z.object({
  name: z.string().trim().min(1).max(180).optional(),
  partNumber: z.string().trim().min(1).max(80).optional(),
  quantity: z.number().int().min(1).max(1_000_000).optional(),
  supplier: z.string().trim().max(180).nullable().optional(),
  status: z.string().trim().min(1).max(60).optional(),
  unitCost: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .nullable()
    .optional(),
  supplierPartNumber: z.string().trim().max(120).nullable().optional(),
  alternatives: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
  inventoryQuantity: z.number().int().min(0).max(10_000_000).optional(),
  reorderPoint: z.number().int().min(0).max(10_000_000).nullable().optional(),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  version: z.string().trim().max(80).nullable().optional(),
  approvalStatus: z.nativeEnum(ApprovalStatus).optional(),
  purchaseStatus: z.nativeEnum(PurchaseStatus).optional(),
  leadTimeDays: z.number().int().min(0).max(3_650).nullable().optional(),
  riskLevel: z.number().int().min(1).max(5).optional(),
  notes: z.string().trim().max(20_000).nullable().optional(),
});
const testSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  outcome: z.nativeEnum(TestOutcome).optional(),
  testDate: dateValue,
  operator: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(20_000).nullable().optional(),
  planId: z.string().cuid().nullable().optional(),
});

async function accessFor(
  params: Promise<{ id: string; module: string; recordId: string }>,
  userId: string,
) {
  const values = await params;
  const access = await projectAccess(userId, values.id);
  const kind = moduleSchema.safeParse(values.module);
  return { ...values, access, kind };
}
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string; module: string; recordId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const values = await accessFor(params, session.user.id);
  if (!values.access || !values.kind.success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const where = { id: values.recordId, projectId: values.id, deletedAt: null };
  const record =
    values.kind.data === "tasks"
      ? await prisma.task.findFirst({
          where,
          include: {
            assignee: { select: { id: true, name: true, email: true } },
            dependencies: {
              where: { dependsOn: { deletedAt: null } },
              include: { dependsOn: { select: { id: true, title: true, status: true } } },
            },
          },
        })
      : values.kind.data === "issues"
        ? await prisma.issue.findFirst({ where })
        : values.kind.data === "bom"
          ? await prisma.bomItem.findFirst({ where })
          : await prisma.testRecord.findFirst({ where });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(record);
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; module: string; recordId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const values = await accessFor(params, session.user.id);
  if (!values.access || !values.kind.success || !canWrite(values.access.membership.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (values.kind.data === "tasks") {
    const input = taskSchema.safeParse(body);
    if (!input.success)
      return NextResponse.json({ error: "任務資料不正確" }, { status: 400 });
    const record = await prisma.task.findFirst({
      where: { id: values.recordId, projectId: values.id, deletedAt: null },
    });
    if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const nextStart =
      input.data.startDate === undefined
        ? record.startDate
        : input.data.startDate
          ? new Date(`${input.data.startDate}T00:00:00.000Z`)
          : null;
    const nextDue =
      input.data.dueDate === undefined
        ? record.dueDate
        : input.data.dueDate
          ? new Date(`${input.data.dueDate}T00:00:00.000Z`)
          : null;
    if (nextStart && nextDue && nextStart > nextDue)
      return NextResponse.json({ error: "開始日期不可晚於結束日期" }, { status: 400 });
    if (
      input.data.assigneeId &&
      !(await prisma.membership.findFirst({
        where: {
          userId: input.data.assigneeId,
          workspaceId: values.access.project.workspaceId,
        },
      }))
    )
      return NextResponse.json({ error: "負責人必須是工作空間成員" }, { status: 400 });
    if (input.data.status === "DONE" && record.status !== "DONE") {
      const incompleteDependencies = await prisma.taskDependency.findMany({
        where: {
          taskId: record.id,
          dependsOn: { deletedAt: null, status: { not: "DONE" } },
        },
        select: { dependsOn: { select: { title: true } } },
      });
      if (incompleteDependencies.length)
        return NextResponse.json(
          {
            error: `尚有未完成前置任務：${incompleteDependencies
              .slice(0, 3)
              .map((item) => item.dependsOn.title)
              .join("、")}`,
          },
          { status: 409 },
        );
    }
    if (input.data.parentId) {
      if (input.data.parentId === record.id)
        return NextResponse.json({ error: "任務不能是自己的父任務" }, { status: 400 });
      let cursor = await prisma.task.findFirst({
        where: { id: input.data.parentId, projectId: values.id, deletedAt: null },
      });
      if (!cursor) return NextResponse.json({ error: "父任務不存在" }, { status: 400 });
      while (cursor?.parentId) {
        if (cursor.parentId === record.id)
          return NextResponse.json({ error: "子任務關係不可形成循環" }, { status: 400 });
        cursor = await prisma.task.findUnique({ where: { id: cursor.parentId } });
      }
    }
    const recurrenceChanged =
      input.data.status !== undefined ||
      input.data.recurrenceRule !== undefined ||
      input.data.recurrenceAnchor !== undefined ||
      input.data.dueDate !== undefined;
    return NextResponse.json(
      await prisma.task.update({
        where: { id: record.id },
        data: {
          ...input.data,
          recurrenceProcessedAt: recurrenceChanged ? null : undefined,
          startDate: input.data.startDate === undefined ? undefined : nextStart,
          dueDate: input.data.dueDate === undefined ? undefined : nextDue,
          recurrenceAnchor:
            input.data.recurrenceAnchor === undefined
              ? undefined
              : input.data.recurrenceAnchor
                ? new Date(`${input.data.recurrenceAnchor}T00:00:00.000Z`)
                : null,
          slaDueAt:
            input.data.slaDueAt === undefined
              ? undefined
              : input.data.slaDueAt
                ? new Date(`${input.data.slaDueAt}T00:00:00.000Z`)
                : null,
        },
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          dependencies: {
            where: { dependsOn: { deletedAt: null } },
            include: { dependsOn: { select: { id: true, title: true, status: true } } },
          },
        },
      }),
    );
  }
  if (values.kind.data === "issues") {
    const input = issueSchema.safeParse(body);
    if (!input.success)
      return NextResponse.json({ error: "議題資料不正確" }, { status: 400 });
    const record = await prisma.issue.findFirst({
      where: { id: values.recordId, projectId: values.id, deletedAt: null },
    });
    if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(
      await prisma.issue.update({ where: { id: record.id }, data: input.data }),
    );
  }
  if (values.kind.data === "bom") {
    const input = bomSchema.safeParse(body);
    if (!input.success)
      return NextResponse.json({ error: "物料資料不正確" }, { status: 400 });
    const record = await prisma.bomItem.findFirst({
      where: { id: values.recordId, projectId: values.id, deletedAt: null },
    });
    if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(
      await prisma.bomItem.update({
        where: { id: record.id },
        data: {
          ...input.data,
          unitCost:
            input.data.unitCost === undefined ? undefined : input.data.unitCost || null,
        },
      }),
    );
  }
  const input = testSchema.safeParse(body);
  if (
    !input.success ||
    (input.data.planId &&
      !(await prisma.testPlan.findFirst({
        where: { id: input.data.planId, projectId: values.id },
      })))
  )
    return NextResponse.json({ error: "測試資料或測試計畫不正確" }, { status: 400 });
  const record = await prisma.testRecord.findFirst({
    where: { id: values.recordId, projectId: values.id, deletedAt: null },
  });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(
    await prisma.testRecord.update({
      where: { id: record.id },
      data: {
        ...input.data,
        testDate:
          input.data.testDate === undefined
            ? undefined
            : input.data.testDate
              ? new Date(`${input.data.testDate}T00:00:00.000Z`)
              : null,
      },
    }),
  );
}
export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string; module: string; recordId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const values = await accessFor(params, session.user.id);
  if (!values.access || !values.kind.success || !canWrite(values.access.membership.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const where = { id: values.recordId, projectId: values.id, deletedAt: null };
  const deletionBatchId = crypto.randomUUID();
  const data = { deletedAt: new Date(), deletionBatchId };
  if (values.kind.data === "tasks") {
    const result = await prisma.task.updateMany({ where, data });
    if (!result.count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  } else if (values.kind.data === "issues") {
    const result = await prisma.issue.updateMany({ where, data });
    if (!result.count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  } else if (values.kind.data === "bom") {
    const result = await prisma.bomItem.updateMany({ where, data });
    if (!result.count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  } else {
    const result = await prisma.testRecord.updateMany({ where, data });
    if (!result.count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.auditEvent.create({
    data: {
      userId: session.user.id,
      action: `${values.kind.data}.trashed`,
      entity: values.kind.data,
      entityId: values.recordId,
      workspaceId: values.access.project.workspaceId,
      projectId: values.id,
      metadata: { deletionBatchId },
    },
  });
  return NextResponse.json({ ok: true, deletionBatchId });
}
