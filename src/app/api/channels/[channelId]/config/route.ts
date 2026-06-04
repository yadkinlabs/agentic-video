import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireChannelRole, requireInternalKey } from "@/lib/auth";
import { encryptValue, decryptValue, invalidateConfigCache, resolveAllServiceConfig } from "@/lib/config";

type Params = { params: Promise<{ channelId: string }> };

// GET — list keys (values masked for UI; decrypted for internal worker)
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { channelId } = await params;
    const id = Number(channelId);

    const isInternal = req.headers.get("x-internal-key") === process.env.INTERNAL_API_KEY;
    if (isInternal) {
      // Return fully decrypted config for worker
      const config = await resolveAllServiceConfig(id);
      return NextResponse.json(config);
    }

    await requireChannelRole(req, id, "admin");
    const rows = await prisma.serviceConfig.findMany({ where: { channel_id: id } });
    return NextResponse.json(rows.map((r) => ({ key: r.key, set: true })));
  } catch (res) {
    return res as NextResponse;
  }
}

// PUT /api/channels/:id/config — upsert a single key
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { channelId } = await params;
    const id = Number(channelId);
    await requireChannelRole(req, id, "admin");

    const { key, value } = await req.json();
    if (!key || value === undefined) {
      return NextResponse.json({ error: "key and value required" }, { status: 400 });
    }

    const encrypted_value = await encryptValue(String(value));
    await prisma.serviceConfig.upsert({
      where: { channel_id_key: { channel_id: id, key } },
      create: { channel_id: id, key, encrypted_value },
      update: { encrypted_value },
    });
    invalidateConfigCache(id, key);
    return NextResponse.json({ ok: true });
  } catch (res) {
    return res as NextResponse;
  }
}

// DELETE /api/channels/:id/config?key=foo
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { channelId } = await params;
    const id = Number(channelId);
    await requireChannelRole(req, id, "admin");

    const key = req.nextUrl.searchParams.get("key");
    if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });

    await prisma.serviceConfig.deleteMany({ where: { channel_id: id, key } });
    invalidateConfigCache(id, key);
    return NextResponse.json({ ok: true });
  } catch (res) {
    return res as NextResponse;
  }
}
