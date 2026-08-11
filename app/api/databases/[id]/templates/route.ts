import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, databaseAccess } from "@/lib/permissions";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  values: z.record(z.string(), z.unknown()).default({}),
});
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await databaseAccess(session.user.id, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(
    await prisma.databaseTemplate.findMany({
      where: { databaseId: id },
      orderBy: { name: "asc" },
    }),
  );
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await databaseAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid template" }, { status: 400 });
  const existing = await prisma.databaseTemplate.findUnique({
    where: { databaseId_name: { databaseId: id, name: parsed.data.name } },
    select: { id: true },
  });
  const template = await prisma.databaseTemplate.upsert({
    where: { databaseId_name: { databaseId: id, name: parsed.data.name } },
    update: { values: parsed.data.values as Prisma.InputJsonValue },
    create: {
      databaseId: id,
      name: parsed.data.name,
      values: parsed.data.values as Prisma.InputJsonValue,
    },
  });
  await prisma.auditEvent.create({
    data: {
      userId: session.user.id,
      action: existing ? "database_template.updated" : "database_template.created",
      entity: "database_template",
      entityId: template.id,
      workspaceId: access.database.project.workspaceId,
      projectId: access.database.projectId,
      metadata: { databaseId: id, name: template.name },
    },
  });
  return NextResponse.json(template);
}
