import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, projectAccess } from "@/lib/permissions";

export async function PATCH(_: Request, { params }: { params: Promise<{ id: string; batchId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, batchId } = await params;
  const access = await projectAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await prisma.document.updateMany({ where: { projectId: id, deletionBatchId: batchId, deletedAt: { not: null } }, data: { deletedAt: null, deletionBatchId: null } });
  if (!result.count) return NextResponse.json({ error: "找不到可還原的文件" }, { status: 404 });
  await prisma.auditEvent.create({ data: { userId: session.user.id, action: "document.restored", entity: "document", entityId: batchId, workspaceId: access.project.workspaceId, projectId: id, metadata: { restoredCount: result.count } } });
  return NextResponse.json({ ok: true, restoredCount: result.count });
}
