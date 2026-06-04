import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireChannelRole } from "@/lib/auth";

type Params = { params: Promise<{ channelId: string; memberId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { channelId, memberId } = await params;
    const id = Number(channelId);
    await requireChannelRole(req, id, "admin");
    const { role } = await req.json();
    const member = await prisma.channelMember.update({
      where: { id: Number(memberId) },
      data: { role },
    });
    return NextResponse.json(member);
  } catch (res) {
    return res as NextResponse;
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { channelId, memberId } = await params;
    const id = Number(channelId);
    await requireChannelRole(req, id, "admin");
    await prisma.channelMember.delete({ where: { id: Number(memberId) } });
    return NextResponse.json({ ok: true });
  } catch (res) {
    return res as NextResponse;
  }
}
