import { NextResponse } from "next/server";
import { z } from "zod";
import { DatabasePropertyType, Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, databaseAccess } from "@/lib/permissions";

const optionValue = z.union([z.array(z.string().trim().min(1).max(50)).max(40), z.record(z.string(), z.unknown())]);
const schema = z.object({ name: z.string().trim().min(1).max(80).optional(), type: z.nativeEnum(DatabasePropertyType).optional(), options: optionValue.nullable().optional() });
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; propertyId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, propertyId } = await params; const access = await databaseAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const property = await prisma.databaseProperty.findFirst({ where: { id: propertyId, databaseId: id, deletedAt: null } }); if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Invalid property" }, { status: 400 });
  return NextResponse.json(await prisma.databaseProperty.update({ where: { id: propertyId }, data: { ...parsed.data, options: parsed.data.options === undefined ? undefined : parsed.data.options === null ? Prisma.JsonNull : parsed.data.options as Prisma.InputJsonValue } }));
}
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; propertyId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, propertyId } = await params; const access = await databaseAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const property = await prisma.databaseProperty.findFirst({ where: { id: propertyId, databaseId: id, deletedAt: null } }); if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const deletionBatchId = crypto.randomUUID(); await prisma.databaseProperty.update({ where: { id: propertyId }, data: { deletedAt: new Date(), deletionBatchId } }); await prisma.auditEvent.create({ data: { userId: session.user.id, action: "database_property.trashed", entity: "database_property", entityId: propertyId, metadata: { databaseId: id, deletionBatchId } } });
  return NextResponse.json({ ok: true, deletionBatchId });
}
