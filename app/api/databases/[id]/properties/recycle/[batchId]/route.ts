import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, databaseAccess } from "@/lib/permissions";
export async function PATCH(
  _: Request,
  { params }: { params: Promise<{ id: string; batchId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, batchId } = await params;
  const access = await databaseAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await prisma.databaseProperty.updateMany({
    where: { databaseId: id, deletionBatchId: batchId, deletedAt: { not: null } },
    data: { deletedAt: null, deletionBatchId: null },
  });
  if (!result.count)
    return NextResponse.json({ error: "找不到可還原的欄位" }, { status: 404 });
  await prisma.auditEvent.create({
    data: {
      userId: session.user.id,
      action: "database_property.restored",
      entity: "database_property",
      entityId: batchId,
      workspaceId: access.database.project.workspaceId,
      projectId: access.database.projectId,
      metadata: { databaseId: id, restoredCount: result.count },
    },
  });
  return NextResponse.json({ ok: true, restoredCount: result.count });
}
