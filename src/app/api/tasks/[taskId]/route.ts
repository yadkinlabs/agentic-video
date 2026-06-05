import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireChannelRole } from "@/lib/auth";

type Params = { params: Promise<{ taskId: string }> };

async function getTask(taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw NextResponse.json({ error: "Not found" }, { status: 404 });
  return task;
}

function isInternal(req: NextRequest) {
  return req.headers.get("x-internal-key") === process.env.INTERNAL_API_KEY;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { taskId } = await params;
    const task = await getTask(taskId);
    if (!isInternal(req)) await requireChannelRole(req, task.channel_id, "viewer");
    return NextResponse.json(task);
  } catch (res) {
    return res as NextResponse;
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { taskId } = await params;
    const task = await getTask(taskId);
    const internal = isInternal(req);
    if (!internal) await requireChannelRole(req, task.channel_id, "editor");

    const body = await req.json();
    const { action } = body;

    switch (action) {
      // ── Worker actions ─────────────────────────────────────────────────────
      case "claim": {
        const updated = await prisma.task.update({
          where: { id: taskId, status: "APPROVED" }, // atomic guard
          data: { status: "RUNNING", claimed_at: new Date() },
        });
        return NextResponse.json(updated);
      }

      case "complete": {
        const artifacts = body.artifacts_patch
          ? { ...(task.artifacts as object ?? {}), ...body.artifacts_patch }
          : task.artifacts;
        const updated = await prisma.task.update({
          where: { id: taskId },
          data: { status: "COMPLETE", artifacts, completed_at: new Date() },
        });
        return NextResponse.json(updated);
      }

      case "fail": {
        const updated = await prisma.task.update({
          where: { id: taskId },
          data: { status: "FAILED", revision_notes: body.reason ?? null, completed_at: new Date() },
        });
        return NextResponse.json(updated);
      }

      case "set_step": {
        const updated = await prisma.task.update({
          where: { id: taskId },
          data: { current_step: body.step },
        });
        return NextResponse.json(updated);
      }

      case "notify": {
        await prisma.taskLog.create({
          data: { task_id: taskId, level: body.level ?? "info", message: body.message },
        });
        return NextResponse.json({ ok: true });
      }

      case "patch_artifacts": {
        const merged = { ...(task.artifacts as object ?? {}), ...body.artifacts_patch } as Prisma.InputJsonValue;
        const updated = await prisma.task.update({
          where: { id: taskId },
          data: { artifacts: merged },
        });
        return NextResponse.json(updated);
      }

      case "pending_approval": {
        const updated = await prisma.task.update({
          where: { id: taskId },
          data: {
            status: "PENDING_APPROVAL",
            current_step: body.step ?? null,
            artifacts: body.artifacts_patch
              ? { ...(task.artifacts as object ?? {}), ...body.artifacts_patch } as Prisma.InputJsonValue
              : task.artifacts ?? Prisma.JsonNull,
          },
        });
        return NextResponse.json(updated);
      }

      // ── UI actions ──────────────────────────────────────────────────────────
      case "approve": {
        const artifacts = body.artifacts_patch
          ? { ...(task.artifacts as object ?? {}), ...body.artifacts_patch } as Prisma.InputJsonValue
          : task.artifacts ?? Prisma.JsonNull;
        const updated = await prisma.task.update({
          where: { id: taskId },
          data: { status: "APPROVED", artifacts },
        });
        return NextResponse.json(updated);
      }

      case "cancel": {
        const updated = await prisma.task.update({
          where: { id: taskId },
          data: { status: "CANCELLED", completed_at: new Date() },
        });
        return NextResponse.json(updated);
      }

      case "request_revision": {
        const updated = await prisma.task.update({
          where: { id: taskId },
          data: {
            status: "APPROVED",
            current_step: null,
            revision_notes: body.revision_notes ?? null,
            artifacts: body.artifacts_patch
              ? { ...(task.artifacts as object ?? {}), ...body.artifacts_patch } as Prisma.InputJsonValue
              : task.artifacts ?? Prisma.JsonNull,
          },
        });
        await prisma.taskLog.create({
          data: { task_id: taskId, level: "info", message: `Revision requested: ${body.revision_notes ?? ""}` },
        });
        return NextResponse.json(updated);
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (res) {
    return res as NextResponse;
  }
}
