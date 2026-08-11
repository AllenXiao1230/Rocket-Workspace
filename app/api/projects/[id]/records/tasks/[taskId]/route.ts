import { NextResponse } from "next/server";
import {
  PATCH as patchRecord,
  DELETE as deleteRecord,
} from "../../[module]/[recordId]/route";

type Context = { params: Promise<{ id: string; taskId: string }> };
const mapped = async (params: Context["params"]) => {
  const { id, taskId } = await params;
  return Promise.resolve({ id, module: "tasks", recordId: taskId });
};

export async function PATCH(request: Request, { params }: Context) {
  return patchRecord(request, { params: mapped(params) });
}
export async function DELETE(request: Request, { params }: Context) {
  return deleteRecord(request, { params: mapped(params) });
}
export function GET() {
  return NextResponse.json(
    { error: "Use the task collection endpoint" },
    { status: 405 },
  );
}
