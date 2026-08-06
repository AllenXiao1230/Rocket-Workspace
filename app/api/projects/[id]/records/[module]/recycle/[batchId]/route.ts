import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, projectAccess } from "@/lib/permissions";

const kinds = ["tasks", "issues", "bom", "tests"] as const;
type Kind = typeof kinds[number];

export async function PATCH(_: Request, { params }: { params: Promise<{ id: string; module: string; batchId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, module, batchId } = await params; if (!kinds.includes(module as Kind)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await projectAccess(session.user.id, id); if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const where = { projectId: id, deletionBatchId: batchId, deletedAt: { not: null } }; const data = { deletedAt: null, deletionBatchId: null };
  const result = module === "tasks" ? await prisma.task.updateMany({ where, data }) : module === "issues" ? await prisma.issue.updateMany({ where, data }) : module === "bom" ? await prisma.bomItem.updateMany({ where, data }) : await prisma.testRecord.updateMany({ where, data });
  if (!result.count) return NextResponse.json({ error: "找不到可還原的紀錄" }, { status: 404 });
  await prisma.auditEvent.create({ data: { userId: session.user.id, action: `${module}.restored`, entity: module, entityId: batchId, metadata: { restoredCount: result.count } } });
  return NextResponse.json({ ok: true, restoredCount: result.count });
}
