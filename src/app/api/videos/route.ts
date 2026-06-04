import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireChannelRole } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const channel_id = Number(sp.get("channel_id"));
    if (!channel_id) return NextResponse.json({ error: "channel_id required" }, { status: 400 });

    await requireChannelRole(req, channel_id, "viewer");

    const videos = await prisma.video.findMany({
      where: { channel_id },
      orderBy: { created_at: "desc" },
      take: 100,
    });
    return NextResponse.json(videos);
  } catch (res) {
    return res as NextResponse;
  }
}

export async function POST(req: NextRequest) {
  try {
    const isInternal = req.headers.get("x-internal-key") === process.env.INTERNAL_API_KEY;
    if (!isInternal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { channel_id, task_id, title, youtube_video_id, r2_thumbnail_key, published_at } = await req.json();
    const video = await prisma.video.upsert({
      where: { task_id: task_id ?? "" },
      create: {
        channel_id: Number(channel_id),
        task_id: task_id ?? null,
        title,
        youtube_video_id: youtube_video_id ?? null,
        r2_thumbnail_key: r2_thumbnail_key ?? null,
        published_at: published_at ? new Date(published_at) : null,
      },
      update: {
        youtube_video_id: youtube_video_id ?? undefined,
        r2_thumbnail_key: r2_thumbnail_key ?? undefined,
        published_at: published_at ? new Date(published_at) : undefined,
      },
    });
    return NextResponse.json(video, { status: 201 });
  } catch (res) {
    return res as NextResponse;
  }
}
