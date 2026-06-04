import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";

type Params = { params: Promise<{ userId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireSuperAdmin(req);
    const { userId } = await params;
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.name) data.name = body.name;
    if (body.role) data.role = body.role;
    if (body.password) data.password_hash = await hashPassword(body.password);

    const user = await prisma.user.update({
      where: { id: Number(userId) },
      data,
      select: { id: true, email: true, name: true, role: true },
    });
    return NextResponse.json(user);
  } catch (res) {
    return res as NextResponse;
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    await requireSuperAdmin(req);
    const { userId } = await params;
    await prisma.user.delete({ where: { id: Number(userId) } });
    return NextResponse.json({ ok: true });
  } catch (res) {
    return res as NextResponse;
  }
}
