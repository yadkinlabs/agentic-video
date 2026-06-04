import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireChannelRole } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const channel_id = Number(sp.get("channel_id"));
    if (!channel_id) return NextResponse.json({ error: "channel_id required" }, { status: 400 });

    const isInternal = req.headers.get("x-internal-key") === process.env.INTERNAL_API_KEY;
    if (!isInternal) await requireChannelRole(req, channel_id, "viewer");

    const task_id = sp.get("task_id");
    const limit = sp.get("limit") ? Number(sp.get("limit")) : 100;

    const items = await prisma.footageItem.findMany({
      where: { channel_id, ...(task_id ? { task_id } : {}) },
      orderBy: { created_at: "desc" },
      take: limit,
    });
    return NextResponse.json(items);
  } catch (res) {
    return res as NextResponse;
  }
}

export async function POST(req: NextRequest) {
  try {
    const isInternal = req.headers.get("x-internal-key") === process.env.INTERNAL_API_KEY;
    if (!isInternal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { channel_id, task_id, r2_key, prompt, width, height } = await req.json();
    const item = await prisma.footageItem.create({
      data: { channel_id: Number(channel_id), task_id: task_id ?? null, r2_key, prompt, width, height },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (res) {
    return res as NextResponse;
  }
}
