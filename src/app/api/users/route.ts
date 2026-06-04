import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, created_at: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(users);
  } catch (res) {
    return res as NextResponse;
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireSuperAdmin(req);
    const { email, password, name, role } = await req.json();
    if (!email || !password || !name) {
      return NextResponse.json({ error: "email, password, and name required" }, { status: 400 });
    }
    const password_hash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, password_hash, name, role: role ?? "user" },
      select: { id: true, email: true, name: true, role: true, created_at: true },
    });
    return NextResponse.json(user, { status: 201 });
  } catch (res) {
    return res as NextResponse;
  }
}
