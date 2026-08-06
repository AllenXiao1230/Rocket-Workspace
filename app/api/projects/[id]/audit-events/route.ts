import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectAccess } from "@/lib/permissions";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const access = await projectAccess(session.user.id, id);
  if (!access || !["OWNER", "ADMIN"].includes(access.membership.role)) return NextResponse.json({ error: "只有擁有者或管理員能檢視操作紀錄" }, { status: 403 });
  const rawLimit = Number(request.nextUrl.searchParams.get("limit") || 50); const take = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;
  const cursor = request.nextUrl.searchParams.get("cursor") || undefined;
  const rows = await prisma.auditEvent.findMany({ where: { workspaceId: access.project.workspaceId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: take + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, action: true, entity: true, entityId: true, projectId: true, createdAt: true, user: { select: { name: true, email: true } } } });
  const hasMore = rows.length > take; const events = hasMore ? rows.slice(0, take) : rows;
  return NextResponse.json({ events, nextCursor: hasMore ? events.at(-1)?.id || null : null });
}
