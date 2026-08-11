import { NextResponse } from "next/server";
import { z } from "zod";
import { DatabasePropertyType, Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, databaseAccess } from "@/lib/permissions";
import { validatePropertyOptions } from "@/lib/database-validation";
import { validatePropertyReference } from "@/lib/database-reference-validation";

const optionValue = z.union([
  z.array(z.string().trim().min(1).max(50)).max(40),
  z.record(z.string(), z.unknown()),
]);
const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  type: z.nativeEnum(DatabasePropertyType).optional(),
  options: optionValue.nullable().optional(),
});
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; propertyId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, propertyId } = await params;
  const access = await databaseAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const property = await prisma.databaseProperty.findFirst({
    where: { id: propertyId, databaseId: id, deletedAt: null },
  });
  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid property" }, { status: 400 });
  const type = parsed.data.type || property.type;
  const options =
    parsed.data.options === undefined ? property.options : parsed.data.options;
  const issues = validatePropertyOptions(type, options);
  if (issues.length)
    return NextResponse.json({ error: issues[0].message }, { status: 400 });
  const databaseId =
    typeof options === "object" &&
    options &&
    !Array.isArray(options) &&
    typeof options.databaseId === "string"
      ? options.databaseId
      : "";
  const [sourceProperties, target] = await Promise.all([
    prisma.databaseProperty.findMany({
      where: { databaseId: id },
      select: { id: true, name: true, type: true, options: true, deletedAt: true },
    }),
    databaseId
      ? prisma.database.findFirst({
          where: { id: databaseId },
          select: {
            id: true,
            project: { select: { workspaceId: true } },
            properties: {
              select: {
                id: true,
                name: true,
                type: true,
                options: true,
                deletedAt: true,
              },
            },
          },
        })
      : null,
  ]);
  const nextSourceProperties = sourceProperties.map((item) =>
    item.id === propertyId ? { ...item, type, options } : item,
  );
  const referenceIssues = validatePropertyReference(type, options, {
    workspaceId: access.database.project.workspaceId,
    sourceProperties: nextSourceProperties,
    targetDatabase: target
      ? {
          id: target.id,
          workspaceId: target.project.workspaceId,
          properties: target.properties,
        }
      : null,
  });
  if (referenceIssues.length)
    return NextResponse.json({ error: referenceIssues[0].message }, { status: 400 });
  const updated = await prisma.databaseProperty.update({
    where: { id: propertyId },
    data: {
      ...parsed.data,
      options:
        parsed.data.options === undefined
          ? undefined
          : parsed.data.options === null
            ? Prisma.JsonNull
            : (parsed.data.options as Prisma.InputJsonValue),
    },
  });
  await prisma.auditEvent.create({
    data: {
      userId: session.user.id,
      action: "database_property.updated",
      entity: "database_property",
      entityId: propertyId,
      workspaceId: access.database.project.workspaceId,
      projectId: access.database.projectId,
      metadata: { databaseId: id, changedFields: Object.keys(parsed.data) },
    },
  });
  return NextResponse.json(updated);
}
export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string; propertyId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, propertyId } = await params;
  const access = await databaseAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const property = await prisma.databaseProperty.findFirst({
    where: { id: propertyId, databaseId: id, deletedAt: null },
  });
  if (!property) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const deletionBatchId = crypto.randomUUID();
  await prisma.databaseProperty.update({
    where: { id: propertyId },
    data: { deletedAt: new Date(), deletionBatchId },
  });
  await prisma.auditEvent.create({
    data: {
      userId: session.user.id,
      action: "database_property.trashed",
      entity: "database_property",
      entityId: propertyId,
      workspaceId: access.database.project.workspaceId,
      projectId: access.database.projectId,
      metadata: { databaseId: id, deletionBatchId },
    },
  });
  return NextResponse.json({ ok: true, deletionBatchId });
}
