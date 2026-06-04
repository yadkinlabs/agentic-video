import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireChannelRole } from "@/lib/auth";

type Params = { params: Promise<{ channelId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { channelId } = await params;
    const id = Number(channelId);
    await requireChannelRole(req, id, "admin");
    const members = await prisma.channelMember.findMany({
      where: { channel_id: id },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    return NextResponse.json(members);
  } catch (res) {
    return res as NextResponse;
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { channelId } = await params;
    const id = Number(channelId);
    await requireChannelRole(req, id, "admin");
    const { user_id, role } = await req.json();
    if (!user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });

    const member = await prisma.channelMember.create({
      data: { channel_id: id, user_id: Number(user_id), role: role ?? "viewer" },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    return NextResponse.json(member, { status: 201 });
  } catch (res) {
    return res as NextResponse;
  }
}
