import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canWrite, projectAccess } from "@/lib/permissions";

const databaseInclude = { properties: { orderBy: { position: "asc" as const } }, views: { orderBy: { position: "asc" as const } }, rows: { orderBy: { position: "asc" as const } } };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await projectAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({})); const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : "Untitled database";
  const parentDocumentId = typeof body.parentDocumentId === "string" && body.parentDocumentId.trim() ? body.parentDocumentId.trim() : null;
  if (parentDocumentId) {
    const parent = await prisma.document.findFirst({ where: { id: parentDocumentId, projectId: id, deletedAt: null }, select: { id: true } });
    if (!parent) return NextResponse.json({ error: "Parent document not found" }, { status: 400 });
  }
  const database = await prisma.database.create({
    data: { projectId: id, parentDocumentId, name, properties: { create: [
      { name: "Name", type: "TEXT", position: 0 },
      { name: "Status", type: "STATUS", options: ["Not started", "In progress", "Done"], position: 1 },
      { name: "Priority", type: "SELECT", options: ["High", "Medium", "Low"], position: 2 },
      { name: "Due date", type: "DATE", position: 3 },
    ] }, views: { create: { name: "All records", position: 0 } } },
    include: databaseInclude,
  });
  return NextResponse.json(database, { status: 201 });
}
