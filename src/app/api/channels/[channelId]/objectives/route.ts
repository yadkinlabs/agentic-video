import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireChannelRole } from "@/lib/auth";

type Params = { params: Promise<{ channelId: string }> };

// GET — list objectives (accessible to worker via internal key too)
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { channelId } = await params;
    const id = Number(channelId);

    const isInternal = req.headers.get("x-internal-key") === process.env.INTERNAL_API_KEY;
    if (!isInternal) await requireChannelRole(req, id, "viewer");

    const objectives = await prisma.objective.findMany({
      where: { channel_id: id },
      orderBy: { created_at: "asc" },
    });
    return NextResponse.json(objectives);
  } catch (res) {
    return res as NextResponse;
  }
}

// POST — add an objective
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { channelId } = await params;
    const id = Number(channelId);
    await requireChannelRole(req, id, "admin");

    const { content } = await req.json();
    if (!content?.trim()) {
      return NextResponse.json({ error: "content required" }, { status: 400 });
    }

    const objective = await prisma.objective.create({
      data: { channel_id: id, content: content.trim() },
    });
    return NextResponse.json(objective, { status: 201 });
  } catch (res) {
    return res as NextResponse;
  }
}

// DELETE /api/channels/:id/objectives?objectiveId=N
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { channelId } = await params;
    const id = Number(channelId);
    await requireChannelRole(req, id, "admin");

    const objectiveId = Number(req.nextUrl.searchParams.get("objectiveId"));
    if (!objectiveId) return NextResponse.json({ error: "objectiveId required" }, { status: 400 });

    await prisma.objective.deleteMany({ where: { id: objectiveId, channel_id: id } });
    return NextResponse.json({ ok: true });
  } catch (res) {
    return res as NextResponse;
  }
}
