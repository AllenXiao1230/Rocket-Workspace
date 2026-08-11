import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createCalendarFeedToken, hashCalendarFeedToken } from "@/lib/calendar-feed";
import { prisma } from "@/lib/prisma";
import { projectAccess } from "@/lib/permissions";

async function manageAccess(projectId: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const access = await projectAccess(session.user.id, projectId);
  if (!access || !["OWNER", "ADMIN"].includes(access.membership.role)) return null;
  return { session, access };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await manageAccess(id);
  if (!result)
    return NextResponse.json(
      { error: "只有擁有者或管理員能管理日曆訂閱" },
      { status: 403 },
    );
  const feed = await prisma.calendarFeed.findUnique({
    where: { projectId: id },
    select: { createdAt: true, updatedAt: true },
  });
  return NextResponse.json({
    enabled: Boolean(feed),
    createdAt: feed?.createdAt || null,
    updatedAt: feed?.updatedAt || null,
  });
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await manageAccess(id);
  if (!result)
    return NextResponse.json(
      { error: "只有擁有者或管理員能管理日曆訂閱" },
      { status: 403 },
    );
  const token = createCalendarFeedToken();
  await prisma.$transaction([
    prisma.calendarFeed.upsert({
      where: { projectId: id },
      update: { tokenHash: hashCalendarFeedToken(token) },
      create: { projectId: id, tokenHash: hashCalendarFeedToken(token) },
    }),
    prisma.auditEvent.create({
      data: {
        userId: result.session.user.id,
        action: "calendar.feed_rotated",
        entity: "calendar_feed",
        entityId: id,
        workspaceId: result.access.project.workspaceId,
        projectId: id,
      },
    }),
  ]);
  return NextResponse.json(
    { token, relativeUrl: `/api/calendar/${token}.ics` },
    { status: 201 },
  );
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await manageAccess(id);
  if (!result)
    return NextResponse.json(
      { error: "只有擁有者或管理員能管理日曆訂閱" },
      { status: 403 },
    );
  await prisma.$transaction([
    prisma.calendarFeed.deleteMany({ where: { projectId: id } }),
    prisma.auditEvent.create({
      data: {
        userId: result.session.user.id,
        action: "calendar.feed_revoked",
        entity: "calendar_feed",
        entityId: id,
        workspaceId: result.access.project.workspaceId,
        projectId: id,
      },
    }),
  ]);
  return new NextResponse(null, { status: 204 });
}
