import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireChannelRole } from "@/lib/auth";

type Params = { params: Promise<{ channelId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { channelId } = await params;
    const id = Number(channelId);
    await requireChannelRole(req, id, "viewer");
    const channel = await prisma.channel.findUnique({ where: { id } });
    if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(channel);
  } catch (res) {
    return res as NextResponse;
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { channelId } = await params;
    const id = Number(channelId);
    await requireChannelRole(req, id, "admin");
    const body = await req.json();
    const allowed = ["name", "default_format", "captions_enabled"] as const;
    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) data[key] = body[key];
    }
    const channel = await prisma.channel.update({ where: { id }, data });
    return NextResponse.json(channel);
  } catch (res) {
    return res as NextResponse;
  }
}
