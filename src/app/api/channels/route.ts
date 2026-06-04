import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireSuperAdmin } from "@/lib/auth";

// GET /api/channels — list channels the user belongs to (or all for super_admin)
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    if (user.role === "super_admin") {
      const channels = await prisma.channel.findMany({ orderBy: { name: "asc" } });
      return NextResponse.json(channels);
    }

    const memberships = await prisma.channelMember.findMany({
      where: { user_id: user.id },
      include: { channel: true },
      orderBy: { channel: { name: "asc" } },
    });
    return NextResponse.json(memberships.map((m) => ({ ...m.channel, role: m.role })));
  } catch (res) {
    return res as NextResponse;
  }
}

// POST /api/channels — create channel (super_admin only)
export async function POST(req: NextRequest) {
  try {
    await requireSuperAdmin(req);
    const { name, slug, default_format, captions_enabled } = await req.json();
    if (!name || !slug) {
      return NextResponse.json({ error: "name and slug are required" }, { status: 400 });
    }
    const channel = await prisma.channel.create({
      data: { name, slug, default_format: default_format ?? "long", captions_enabled: captions_enabled ?? false },
    });
    return NextResponse.json(channel, { status: 201 });
  } catch (res) {
    return res as NextResponse;
  }
}
