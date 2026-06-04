import Anthropic from "@anthropic-ai/sdk";

interface Channel {
  id: number;
  slug: string;
  name: string;
  default_format: "long" | "short";
}

interface RoutedTask {
  skill: string;
  title: string;
  brief: Record<string, unknown>;
}

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a task router for a video production pipeline.

Given a user's prompt and channel context, return a JSON object describing the task to create.

Available skills:
- "video_pipeline" — full video production pipeline (research → script → voice + footage → motion → video + thumbnail → upload)

Brief fields:
- topic (string, required) — the subject or title of the video
- layout (string) — "long" (landscape, YouTube video) or "short" (portrait, YouTube Short). Default to channel's default_format.
- word_count (number, optional) — target script word count. Default: long=650, short=150.
- script_style (string, optional) — style hint passed to the script skill.
- Any other relevant context extracted from the user's prompt.

Return ONLY a JSON object:
{
  "skill": "video_pipeline",
  "title": "Short descriptive title (max 80 chars)",
  "brief": { "topic": "...", "layout": "long" | "short", ... }
}`;

export async function routeTask(
  prompt: string,
  channel: Channel
): Promise<RoutedTask> {
  const userMessage = `Channel: ${channel.name} (default_format: ${channel.default_format})\n\nUser prompt: ${prompt}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const raw = (response.content[0] as { text: string }).text.trim();
  const cleaned = raw.startsWith("```")
    ? raw.split("```")[1].replace(/^json\n?/, "").trim()
    : raw;

  return JSON.parse(cleaned) as RoutedTask;
}
