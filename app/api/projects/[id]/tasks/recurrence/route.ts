import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canWrite, projectAccess } from "@/lib/permissions";
import { runTaskAutomation } from "@/lib/task-automation";
import { prisma } from "@/lib/prisma";

// The manual action and scheduler share one recurrence implementation.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await projectAccess(session.user.id, id);
  if (!access || !canWrite(access.membership.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await runTaskAutomation({
    projectId: id,
    dueOnly: false,
    includeSlaAlerts: false,
  });
  await prisma.auditEvent.create({
    data: {
      userId: session.user.id,
      action: "task.recurrence_run",
      entity: "project",
      entityId: id,
      workspaceId: access.project.workspaceId,
      projectId: id,
      metadata: { created: result.recurrences, date: result.runDate },
    },
  });
  return NextResponse.json({ created: result.recurrences });
}
