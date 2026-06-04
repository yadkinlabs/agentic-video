import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ skillId: string }> };

// Internal only — called by seed_skills.py
export async function PUT(req: NextRequest, { params }: Params) {
  const key = req.headers.get("x-internal-key");
  if (key !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { skillId } = await params;
  const { label, definition } = await req.json();

  const skill = await prisma.skill.upsert({
    where: { id: skillId },
    create: { id: skillId, label, definition },
    update: { label, definition },
  });

  return NextResponse.json(skill);
}

export async function GET(req: NextRequest, { params }: Params) {
  const { skillId } = await params;
  const skill = await prisma.skill.findUnique({ where: { id: skillId } });
  if (!skill) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(skill);
}
