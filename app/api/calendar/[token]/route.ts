import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildProjectCalendarIcs, hashCalendarFeedToken } from "@/lib/calendar-feed";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{32,128}(?:\.ics)?$/.test(token))
    return new NextResponse("Not found", { status: 404 });
  const rawToken = token.endsWith(".ics") ? token.slice(0, -4) : token;
  const feed = await prisma.calendarFeed.findUnique({
    where: { tokenHash: hashCalendarFeedToken(rawToken) },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          tasks: {
            where: {
              deletedAt: null,
              OR: [{ startDate: { not: null } }, { dueDate: { not: null } }],
            },
            select: {
              id: true,
              title: true,
              status: true,
              startDate: true,
              dueDate: true,
              updatedAt: true,
            },
            orderBy: { updatedAt: "desc" },
          },
          testRecords: {
            where: { deletedAt: null, testDate: { not: null } },
            select: {
              id: true,
              title: true,
              outcome: true,
              testDate: true,
              notes: true,
              updatedAt: true,
            },
            orderBy: { updatedAt: "desc" },
          },
        },
      },
    },
  });
  if (!feed) return new NextResponse("Not found", { status: 404 });
  const body = buildProjectCalendarIcs({
    projectId: feed.project.id,
    projectName: feed.project.name,
    tasks: feed.project.tasks,
    testRecords: feed.project.testRecords,
  });
  const etag = `\"${createHash("sha256").update(body).digest("base64url")}\"`;
  if (request.headers.get("if-none-match") === etag)
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "private, max-age=300" },
    });
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename=rocket-workspace-${feed.project.id}.ics`,
      "Cache-Control": "private, max-age=300",
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
