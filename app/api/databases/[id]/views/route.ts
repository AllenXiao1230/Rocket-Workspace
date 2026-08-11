import { NextResponse } from "next/server";
import { DatabaseViewLayout, Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, databaseAccess } from "@/lib/permissions";

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
  const body = await request.json().catch(() => ({}));
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 80)
      : "New view";
  const layout = Object.values(DatabaseViewLayout).includes(body.layout)
    ? (body.layout as DatabaseViewLayout)
    : DatabaseViewLayout.TABLE;
  const max = await prisma.databaseView.aggregate({
    where: { databaseId: id },
    _max: { position: true },
  });
  const view = await prisma.databaseView.create({
    data: {
      databaseId: id,
      name,
      layout,
      config: body.config as Prisma.InputJsonValue | undefined,
      filter: body.filter as Prisma.InputJsonValue | undefined,
      sort: body.sort as Prisma.InputJsonValue | undefined,
      position: (max._max.position ?? -1) + 1,
    },
  });
  await prisma.auditEvent.create({
    data: {
      userId: session.user.id,
      action: "database_view.created",
      entity: "database_view",
      entityId: view.id,
      workspaceId: access.database.project.workspaceId,
      projectId: access.database.projectId,
      metadata: {
        databaseId: id,
        name: view.name,
        layout: view.layout,
        position: view.position,
      },
    },
  });
  return NextResponse.json(view, { status: 201 });
}
