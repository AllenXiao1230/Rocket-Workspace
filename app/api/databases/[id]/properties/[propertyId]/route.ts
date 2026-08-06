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
  const property = await prisma.databaseProperty.findFirst({ where: { id: propertyId, databaseId: id } }); if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Invalid property" }, { status: 400 });
  return NextResponse.json(await prisma.databaseProperty.update({ where: { id: propertyId }, data: { ...parsed.data, options: parsed.data.options === undefined ? undefined : parsed.data.options === null ? Prisma.JsonNull : parsed.data.options as Prisma.InputJsonValue } }));
}
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; propertyId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, propertyId } = await params; const access = await databaseAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const property = await prisma.databaseProperty.findFirst({ where: { id: propertyId, databaseId: id } }); if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.$transaction(async (tx) => { const rows = await tx.databaseRow.findMany({ where: { databaseId: id } }); await Promise.all(rows.map((row) => { const values = { ...(row.values as Record<string, unknown>) }; delete values[propertyId]; return tx.databaseRow.update({ where: { id: row.id }, data: { values: values as Prisma.InputJsonValue } }); })); await tx.databaseProperty.delete({ where: { id: propertyId } }); });
  return NextResponse.json({ ok: true });
}
