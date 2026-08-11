import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectAccess } from "@/lib/permissions";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await projectAccess(session.user.id, id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json([]);
  const documents = await prisma.document.findMany({
    where: {
      projectId: id,
      deletedAt: null,
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { markdownBase: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, title: true, updatedAt: true },
    take: 20,
    orderBy: { updatedAt: "desc" },
  });
  const databases = await prisma.database.findMany({
    where: { projectId: id, name: { contains: q, mode: "insensitive" } },
    select: { id: true, name: true, updatedAt: true },
    take: 20,
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json([
    ...documents.map((item) => ({ ...item, type: "document" })),
    ...databases.map((item) => ({
      id: item.id,
      title: item.name,
      updatedAt: item.updatedAt,
      type: "database",
    })),
  ]);
}
