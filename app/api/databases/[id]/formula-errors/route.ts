import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { databaseAccess } from "@/lib/permissions";

const pageSize = (value: string | null) =>
  Math.min(100, Math.max(1, Number(value) || 30));

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await databaseAccess(session.user.id, id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = new URL(request.url);
  const propertyId = url.searchParams.get("propertyId");
  if (
    propertyId &&
    !(await prisma.databaseProperty.findFirst({
      where: { id: propertyId, databaseId: id },
      select: { id: true },
    }))
  )
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const errors = await prisma.formulaEvaluationError.findMany({
    where: { databaseId: id, ...(propertyId ? { propertyId } : {}) },
    select: {
      id: true,
      rowId: true,
      propertyId: true,
      code: true,
      createdAt: true,
      property: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: pageSize(url.searchParams.get("take")),
  });
  return NextResponse.json({ errors });
}
