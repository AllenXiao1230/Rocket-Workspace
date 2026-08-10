import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Process liveness only; readiness belongs to the parent health endpoint. */
export async function GET() {
  return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
