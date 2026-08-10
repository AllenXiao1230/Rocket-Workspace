import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { attachmentBucket, HeadBucketCommand, objectStorage } from "@/lib/object-storage";
import { checkRedis } from "@/lib/redis-health";
import { checkCollaborationService } from "@/lib/collaboration-health";

export const dynamic = "force-dynamic";

/** Minimal unauthenticated liveness/readiness check for Docker and reverse proxies. */
export async function GET() {
  try {
    await Promise.all([prisma.$queryRaw`SELECT 1`, objectStorage.send(new HeadBucketCommand({ Bucket: attachmentBucket })), checkRedis(), checkCollaborationService()]);
    return NextResponse.json({ status: "ok", checks: { database: "ok", objectStorage: "ok", redis: "ok", collaboration: "ok" } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "degraded", checks: { dependencies: "database, object storage, Redis, or collaboration unavailable" } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
