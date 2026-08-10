import { NextResponse } from "next/server";
import { z } from "zod";
import { DatabasePropertyType, Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, databaseAccess } from "@/lib/permissions";
import { validatePropertyOptions } from "@/lib/database-validation";
import { validatePropertyReference } from "@/lib/database-reference-validation";

const optionValue = z.union([z.array(z.string().trim().min(1).max(50)).max(40), z.record(z.string(), z.unknown())]);
const schema = z.object({ name: z.string().trim().min(1).max(80), type: z.nativeEnum(DatabasePropertyType).default("TEXT"), options: optionValue.optional() });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await databaseAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Invalid property" }, { status: 400 });
  const issues = validatePropertyOptions(parsed.data.type, parsed.data.options); if (issues.length) return NextResponse.json({ error: issues[0].message }, { status: 400 });
  const databaseId = typeof parsed.data.options === "object" && parsed.data.options && !Array.isArray(parsed.data.options) && typeof parsed.data.options.databaseId === "string" ? parsed.data.options.databaseId : "";
  const [sourceProperties, target] = await Promise.all([prisma.databaseProperty.findMany({ where: { databaseId: id }, select: { id: true, name: true, type: true, options: true, deletedAt: true } }), databaseId ? prisma.database.findFirst({ where: { id: databaseId }, select: { id: true, project: { select: { workspaceId: true } }, properties: { select: { id: true, name: true, type: true, options: true, deletedAt: true } } } }) : null]);
  const referenceIssues = validatePropertyReference(parsed.data.type, parsed.data.options, { workspaceId: access.database.project.workspaceId, sourceProperties, targetDatabase: target ? { id: target.id, workspaceId: target.project.workspaceId, properties: target.properties } : null });
  if (referenceIssues.length) return NextResponse.json({ error: referenceIssues[0].message }, { status: 400 });
  const max = await prisma.databaseProperty.aggregate({ where: { databaseId: id, deletedAt: null }, _max: { position: true } });
  const property = await prisma.databaseProperty.create({ data: { databaseId: id, name: parsed.data.name, type: parsed.data.type, options: parsed.data.options as Prisma.InputJsonValue | undefined, position: (max._max.position ?? -1) + 1 } });
  await prisma.auditEvent.create({ data: { userId: session.user.id, action: "database_property.created", entity: "database_property", entityId: property.id, workspaceId: access.database.project.workspaceId, projectId: access.database.projectId, metadata: { databaseId: id, name: property.name, type: property.type, position: property.position } } });
  return NextResponse.json(property, { status: 201 });
}
