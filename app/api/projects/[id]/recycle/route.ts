import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectAccess } from "@/lib/permissions";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await projectAccess(session.user.id, id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const documents = await prisma.document.findMany({
    where: { projectId: id, deletedAt: { not: null } },
    select: { id: true, title: true, icon: true, parentId: true, deletedAt: true, deletionBatchId: true },
    orderBy: { deletedAt: "desc" },
  });
  const roots = documents.filter((document) => !document.parentId || !documents.some((candidate) => candidate.id === document.parentId));
  return NextResponse.json(roots.map((document) => ({ ...document, descendantCount: document.deletionBatchId ? documents.filter((candidate) => candidate.deletionBatchId === document.deletionBatchId).length - 1 : 0 })));
}
