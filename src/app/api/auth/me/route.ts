import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    return NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role });
  } catch (res) {
    return res as NextResponse;
  }
}
