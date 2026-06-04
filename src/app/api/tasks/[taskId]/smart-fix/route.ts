import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireChannelRole } from "@/lib/auth";

type Params = { params: Promise<{ taskId: string }> };

// POST /api/tasks/:id/smart-fix
// Creates a smart_fix sub-task targeting the failed parent task.
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { taskId } = await params;
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await requireChannelRole(req, task.channel_id, "editor");

    const { notes } = await req.json().catch(() => ({}));

    // Patch revision_notes onto the parent so smart_fix can read them
    if (notes) {
      await prisma.task.update({
        where: { id: taskId },
        data: { revision_notes: notes },
      });
    }

    const smartFixTask = await prisma.task.create({
      data: {
        id: crypto.randomUUID(),
        channel_id: task.channel_id,
        parent_task_id: taskId,
        skill: "smart_fix",
        title: `Smart Fix: ${task.title}`,
        brief: {
          ...(task.brief as object ?? {}),
          revision_notes: notes ?? task.revision_notes ?? "",
        },
        artifacts: task.artifacts,
        status: "APPROVED",
      },
    });

    return NextResponse.json(smartFixTask, { status: 201 });
  } catch (res) {
    return res as NextResponse;
  }
}
