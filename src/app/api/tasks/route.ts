import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireChannelRole } from "@/lib/auth";
import { routeTask } from "@/lib/task-router";

// GET /api/tasks — list tasks
// Query params: channel_id (required), status, skill, parent_task_id, limit
// Worker uses x-internal-key and polls for status=APPROVED
export async function GET(req: NextRequest) {
  try {
    const isInternal = req.headers.get("x-internal-key") === process.env.INTERNAL_API_KEY;
    if (!isInternal) await requireAuth(req);

    const sp = req.nextUrl.searchParams;
    const channel_id = sp.get("channel_id") ? Number(sp.get("channel_id")) : undefined;
    const status = sp.get("status") as string | null;
    const skill = sp.get("skill");
    const parent_task_id = sp.get("parent_task_id");
    const limit = sp.get("limit") ? Number(sp.get("limit")) : 50;

    const tasks = await prisma.task.findMany({
      where: {
        ...(channel_id ? { channel_id } : {}),
        ...(status ? { status: status as never } : {}),
        ...(skill ? { skill } : {}),
        ...(parent_task_id !== null ? { parent_task_id } : {}),
      },
      orderBy: { created_at: "desc" },
      take: limit,
    });
    return NextResponse.json(tasks);
  } catch (res) {
    return res as NextResponse;
  }
}

// POST /api/tasks — create a task
// UI sends: { channel_id, prompt } → NLP routed
// Worker sends: { channel_id, skill, title, brief, parent_task_id } with x-internal-key
export async function POST(req: NextRequest) {
  try {
    const isInternal = req.headers.get("x-internal-key") === process.env.INTERNAL_API_KEY;
    const body = await req.json();

    if (isInternal) {
      // Direct creation from worker (sub-tasks)
      const { channel_id, skill, title, brief, parent_task_id, status } = body;
      const task = await prisma.task.create({
        data: {
          id: crypto.randomUUID(),
          channel_id: Number(channel_id),
          skill,
          title,
          brief: (brief ?? {}) as Prisma.InputJsonValue,
          parent_task_id: parent_task_id ?? null,
          status: status ?? "APPROVED",
        },
      });
      return NextResponse.json(task, { status: 201 });
    }

    // UI path — NLP routing
    const user = await requireAuth(req);
    const { channel_id, prompt } = body;
    if (!channel_id || !prompt) {
      return NextResponse.json({ error: "channel_id and prompt required" }, { status: 400 });
    }
    await requireChannelRole(req, Number(channel_id), "editor");

    const channel = await prisma.channel.findUnique({ where: { id: Number(channel_id) } });
    if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

    const routed = await routeTask(prompt, channel);
    const task = await prisma.task.create({
      data: {
        id: crypto.randomUUID(),
        channel_id: Number(channel_id),
        skill: routed.skill,
        title: routed.title,
        brief: routed.brief as Prisma.InputJsonValue,
        status: "APPROVED", // go straight to pipeline; add review gate here if desired
      },
    });

    await prisma.taskLog.create({
      data: { task_id: task.id, level: "info", message: `Task created by ${user.name}` },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (res) {
    return res as NextResponse;
  }
}
