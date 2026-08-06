import { NextResponse } from "next/server";
import { IssueStatus, TaskStatus, TestOutcome } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, projectAccess } from "@/lib/permissions";

const moduleSchema = z.enum(["tasks", "issues", "bom", "tests"]);
const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
const taskSchema = z.object({ title: z.string().trim().min(1).max(180), status: z.nativeEnum(TaskStatus).optional(), priority: z.number().int().min(1).max(5).optional(), startDate: dateValue, dueDate: dateValue, assigneeId: z.string().cuid().nullable().optional() });
const issueSchema = z.object({ title: z.string().trim().min(1).max(180), key: z.string().trim().min(1).max(50).optional(), status: z.nativeEnum(IssueStatus).optional(), severity: z.number().int().min(1).max(5).optional() });
const bomSchema = z.object({ name: z.string().trim().min(1).max(180), partNumber: z.string().trim().min(1).max(80).optional(), quantity: z.number().int().min(1).max(1_000_000).optional(), supplier: z.string().trim().max(180).nullable().optional(), status: z.string().trim().min(1).max(60).optional(), unitCost: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().optional() });
const testSchema = z.object({ title: z.string().trim().min(1).max(180), outcome: z.nativeEnum(TestOutcome).optional(), testDate: dateValue, operator: z.string().trim().max(120).nullable().optional(), notes: z.string().trim().max(20_000).nullable().optional() });

export async function GET(_: Request, { params }: { params: Promise<{ id: string; module: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, module } = await params; const access = await projectAccess(session.user.id, id); const kind = moduleSchema.safeParse(module);
  if (!access || !kind.success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const data = kind.data === "tasks" ? await prisma.task.findMany({ where: { projectId: id }, include: { assignee: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "desc" } }) : kind.data === "issues" ? await prisma.issue.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" } }) : kind.data === "bom" ? await prisma.bomItem.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" } }) : await prisma.testRecord.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(data);
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string; module: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, module } = await params; const access = await projectAccess(session.user.id, id); const kind = moduleSchema.safeParse(module);
  if (!access || !kind.success || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (kind.data === "tasks") { const input = taskSchema.safeParse(body); if (!input.success || (input.data.startDate && input.data.dueDate && input.data.startDate > input.data.dueDate)) return NextResponse.json({ error: "任務日期不正確" }, { status: 400 }); if (input.data.assigneeId && !await prisma.membership.findFirst({ where: { userId: input.data.assigneeId, workspaceId: access.project.workspaceId } })) return NextResponse.json({ error: "負責人必須是工作空間成員" }, { status: 400 }); return NextResponse.json(await prisma.task.create({ data: { projectId: id, ...input.data, startDate: input.data.startDate ? new Date(`${input.data.startDate}T00:00:00.000Z`) : null, dueDate: input.data.dueDate ? new Date(`${input.data.dueDate}T00:00:00.000Z`) : null }, include: { assignee: { select: { id: true, name: true, email: true } } } }), { status: 201 }); }
  if (kind.data === "issues") { const input = issueSchema.safeParse(body); if (!input.success) return NextResponse.json({ error: "議題資料不正確" }, { status: 400 }); return NextResponse.json(await prisma.issue.create({ data: { projectId: id, title: input.data.title, key: input.data.key || `ISSUE-${Date.now()}`, status: input.data.status, severity: input.data.severity } }), { status: 201 }); }
  if (kind.data === "bom") { const input = bomSchema.safeParse(body); if (!input.success) return NextResponse.json({ error: "物料資料不正確" }, { status: 400 }); return NextResponse.json(await prisma.bomItem.create({ data: { projectId: id, ...input.data, partNumber: input.data.partNumber || `PART-${Date.now()}`, unitCost: input.data.unitCost || null } }), { status: 201 }); }
  const input = testSchema.safeParse(body); if (!input.success) return NextResponse.json({ error: "測試資料不正確" }, { status: 400 }); return NextResponse.json(await prisma.testRecord.create({ data: { projectId: id, ...input.data, testDate: input.data.testDate ? new Date(`${input.data.testDate}T00:00:00.000Z`) : null } }), { status: 201 });
}
