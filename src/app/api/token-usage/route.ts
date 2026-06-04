import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Internal-only — worker posts token usage here after each skill run
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-internal-key");
  if (key !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { task_id, channel_id, skill, model, provider, input_tokens, output_tokens } =
    await req.json();

  await prisma.tokenUsage.create({
    data: {
      task_id: task_id ?? null,
      channel_id: channel_id ? Number(channel_id) : null,
      skill: skill ?? null,
      model,
      provider,
      input_tokens: Number(input_tokens),
      output_tokens: Number(output_tokens),
    },
  });

  return NextResponse.json({ ok: true });
}
