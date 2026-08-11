import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { attachmentBucket, HeadBucketCommand, objectStorage } from "@/lib/object-storage";
import { checkRedis } from "@/lib/redis-health";
import { checkCollaborationService } from "@/lib/collaboration-health";
import { checkSchedulerHeartbeat } from "@/lib/scheduler-heartbeat";

export const dynamic = "force-dynamic";

/** Minimal unauthenticated liveness/readiness check for Docker and reverse proxies. */
export async function GET() {
  try {
    const [, migrations] = await Promise.all([
      prisma.$queryRaw`SELECT 1`,
      prisma.$queryRaw<
        Array<{ migration_name: string }>
      >`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`,
      objectStorage.send(new HeadBucketCommand({ Bucket: attachmentBucket })),
      checkRedis(),
      checkCollaborationService(),
      checkSchedulerHeartbeat(),
    ]);
    if (!migrations[0]?.migration_name) throw new Error("No completed migration");
    return NextResponse.json(
      {
        status: "ok",
        checks: {
          database: "ok",
          objectStorage: "ok",
          redis: "ok",
          collaboration: "ok",
          scheduler: "ok",
          migration: migrations[0].migration_name,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        checks: {
          dependencies: "database, object storage, Redis, or collaboration unavailable",
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
