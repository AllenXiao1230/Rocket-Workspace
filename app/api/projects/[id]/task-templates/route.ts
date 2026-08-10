import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, projectAccess } from "@/lib/permissions";

const valuesSchema = z.object({ status: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "BLOCKED", "DONE"]).optional(), priority: z.number().int().min(1).max(5).optional(), estimatedHours: z.number().min(0).max(100_000).nullable().optional(), milestone: z.boolean().optional(), recurrenceRule: z.string().trim().max(500).nullable().optional() });
const inputSchema = z.object({ name: z.string().trim().min(1).max(100), values: valuesSchema.default({}) });

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await projectAccess(session.user.id, id); if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await prisma.taskTemplate.findMany({ where: { projectId: id }, orderBy: { name: "asc" } }));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await projectAccess(session.user.id, id); if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const input = inputSchema.safeParse(await request.json().catch(() => null)); if (!input.success) return NextResponse.json({ error: "任務模板資料不正確" }, { status: 400 });
  let template;
  try { template = await prisma.taskTemplate.create({ data: { projectId: id, ...input.data } }); }
  catch { return NextResponse.json({ error: "模板名稱已存在" }, { status: 409 }); }
  await prisma.auditEvent.create({ data: { userId: session.user.id, action: "task_template.created", entity: "task_template", entityId: template.id, workspaceId: access.project.workspaceId, projectId: id, metadata: { name: template.name } } });
  return NextResponse.json(template, { status: 201 });
}
