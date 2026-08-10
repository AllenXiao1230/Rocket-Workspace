import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { attachmentBucket, HeadBucketCommand, objectStorage } from "@/lib/object-storage";

export const dynamic = "force-dynamic";

/** Minimal unauthenticated liveness/readiness check for Docker and reverse proxies. */
export async function GET() {
  try {
    await Promise.all([prisma.$queryRaw`SELECT 1`, objectStorage.send(new HeadBucketCommand({ Bucket: attachmentBucket }))]);
    return NextResponse.json({ status: "ok", checks: { database: "ok", objectStorage: "ok" } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "degraded", checks: { database: "or object storage unavailable" } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
