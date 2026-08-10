import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, databaseAccess } from "@/lib/permissions";

const schema = z.object({ propertyIds: z.array(z.string().cuid()).min(1).max(200) });
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await databaseAccess(session.user.id, id); if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success || new Set(parsed.data.propertyIds).size !== parsed.data.propertyIds.length) return NextResponse.json({ error: "欄位排序資料不正確" }, { status: 400 });
  const properties = await prisma.databaseProperty.findMany({ where: { databaseId: id, deletedAt: null }, select: { id: true } }); if (properties.length !== parsed.data.propertyIds.length || properties.some((property) => !parsed.data.propertyIds.includes(property.id))) return NextResponse.json({ error: "欄位清單已變更，請重新整理後再試" }, { status: 409 });
  await prisma.$transaction(parsed.data.propertyIds.map((propertyId, position) => prisma.databaseProperty.update({ where: { id: propertyId }, data: { position } })));
  await prisma.auditEvent.create({ data: { userId: session.user.id, action: "database_property.reordered", entity: "database", entityId: id, workspaceId: access.database.project.workspaceId, projectId: access.database.projectId, metadata: { propertyIds: parsed.data.propertyIds } } });
  return NextResponse.json({ ok: true });
}
