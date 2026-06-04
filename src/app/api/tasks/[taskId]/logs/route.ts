import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireChannelRole } from "@/lib/auth";

type Params = { params: Promise<{ taskId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { taskId } = await params;
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isInternal = req.headers.get("x-internal-key") === process.env.INTERNAL_API_KEY;
    if (!isInternal) await requireChannelRole(req, task.channel_id, "viewer");

    const logs = await prisma.taskLog.findMany({
      where: { task_id: taskId },
      orderBy: { created_at: "asc" },
    });
    return NextResponse.json(logs);
  } catch (res) {
    return res as NextResponse;
  }
}
