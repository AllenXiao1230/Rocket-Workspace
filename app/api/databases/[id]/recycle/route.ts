import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { databaseAccess } from "@/lib/permissions";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await databaseAccess(session.user.id, id); if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await prisma.databaseRow.findMany({ where: { databaseId: id, deletedAt: { not: null } }, select: { id: true, values: true, deletedAt: true, deletionBatchId: true }, orderBy: { deletedAt: "desc" } }));
}
