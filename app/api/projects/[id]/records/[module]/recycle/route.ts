import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectAccess } from "@/lib/permissions";

const kinds = ["tasks", "issues", "bom", "tests"] as const;
type Kind = (typeof kinds)[number];

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string; module: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, module } = await params;
  if (!kinds.includes(module as Kind))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await projectAccess(session.user.id, id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const where = { projectId: id, deletedAt: { not: null } };
  const records =
    module === "tasks"
      ? await prisma.task.findMany({
          where,
          select: { id: true, title: true, deletedAt: true, deletionBatchId: true },
          orderBy: { deletedAt: "desc" },
        })
      : module === "issues"
        ? await prisma.issue.findMany({
            where,
            select: {
              id: true,
              title: true,
              key: true,
              deletedAt: true,
              deletionBatchId: true,
            },
            orderBy: { deletedAt: "desc" },
          })
        : module === "bom"
          ? await prisma.bomItem.findMany({
              where,
              select: {
                id: true,
                name: true,
                partNumber: true,
                deletedAt: true,
                deletionBatchId: true,
              },
              orderBy: { deletedAt: "desc" },
            })
          : await prisma.testRecord.findMany({
              where,
              select: { id: true, title: true, deletedAt: true, deletionBatchId: true },
              orderBy: { deletedAt: "desc" },
            });
  return NextResponse.json(
    records.map((record) => ({
      ...record,
      title: "title" in record ? record.title : `${record.partNumber} · ${record.name}`,
    })),
  );
}
