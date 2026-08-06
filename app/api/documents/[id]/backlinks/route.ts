import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { documentAccess } from "@/lib/permissions";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await documentAccess(session.user.id, id); if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const marker = `[[${access.document.title}]]`;
  const rows = await prisma.document.findMany({ where: { projectId: access.document.projectId, deletedAt: null, id: { not: id }, markdownBase: { contains: marker } }, select: { id: true, title: true, icon: true, updatedAt: true }, orderBy: { updatedAt: "desc" } });
  return NextResponse.json(rows);
}
