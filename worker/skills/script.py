"""
Script skill — writes narration scripts with embedded image cue tags.

brief fields consumed:
  topic          (str, required)
  layout         "long" | "short"  — determines default word count
  word_count     (int, optional)   — target word count
  script_style   (str, optional)   — style key, default "default"
  data_summary   (str, optional)   — research output to draw from

artifacts produced:
  script_text    (str)
  word_count     (int)
"""

import json
import logging

from anthropic import Anthropic
from skills.utils import fetch_objectives, inject_objectives, claude_semaphore, log_token_usage

log = logging.getLogger(__name__)

SKILL_DEFINITION = {
    "id": "script",
    "label": "Script Writer",
    "definition": {
        "id": "script",
        "label": "Script Writer",
        "description": "Writes a narration script with embedded image cue tags.",
        "runner": "script",
        "output_schema": {"script_text": "string", "word_count": "number"},
    },
}

# ---------------------------------------------------------------------------
# Style prompts
# ---------------------------------------------------------------------------

_STYLE_PROMPTS: dict[str, str] = {

    "default": (
        "You are a scriptwriter for a YouTube channel. "
        "Write an engaging narration script — clear, confident, and well-paced. "
        "Lead with a strong hook. End with a call to action. "
        "Scripts are pure spoken narration — no stage directions, no headers, no [MUSIC] tags. "
        "Speaking rate is ~130 words per minute. "
        "Target brief.word_count words unless otherwise specified. "
        "VISUAL CUES: Embed image cue tags inline as you write: [image N: vivid description]. "
        "Place each tag after the sentence(s) it illustrates — one image per ~20-25 words. "
        "word_count counts only spoken narration words, not image tag text. "
        'Return ONLY a JSON object: {"script_text": "...", "word_count": N}'
    ),

    "documentary": (
        "You are a documentary scriptwriter. "
        "Write in a measured, authoritative, immersive style. "
        "Open with a strong hook, build through the narrative, close with weight. "
        "Scripts are pure spoken narration — no stage directions, no headers, no bracket tags. "
        "Speaking rate is ~130 words per minute. "
        "Target brief.word_count words (default: 650). "
        "VISUAL CUES: Embed image cue tags inline: [image N: vivid scene description]. "
        "One image per ~15-20 seconds of narration. "
        "word_count counts only spoken narration words, not image tag text. "
        'Return ONLY a JSON object: {"script_text": "...", "word_count": N}'
    ),

    "short": (
        "You are a short-form scriptwriter for a YouTube channel. "
        "Write a self-contained YouTube Short narration — target brief.word_count words (default 150), no more. "
        "Hook in the first sentence. One clear idea. Punchy close. "
        "Scripts are pure spoken narration — no stage directions, no headers, no bracket tags. "
        "VISUAL CUES: Embed 3-4 image cue tags inline: [image N: vivid description]. "
        "word_count counts only spoken narration words, not image tag text. "
        'Return ONLY a JSON object: {"script_text": "...", "word_count": N}'
    ),
}

_DEFAULT_STYLE = "default"

_MAX_TOKENS: dict[str, int] = {
    "default":      2048,
    "documentary":  4096,
    "short":         512,
}

_DEFAULT_WORD_COUNT: dict[str, int] = {
    "long":  650,
    "short": 150,
}


def run_task(task: dict, channel_config: dict, api_patch, notify, api_get=None, api_post=None, **kwargs) -> dict:
    task_id = task["id"]
    channel_id = task.get("channel_id")
    brief = task.get("brief") or {}
    artifacts = task.get("artifacts") or {}

    layout = brief.get("layout") or "long"
    script_style = brief.get("script_style") or _DEFAULT_STYLE
    if script_style not in _STYLE_PROMPTS:
        log.warning("script: unknown style '%s', falling back to '%s'", script_style, _DEFAULT_STYLE)
        script_style = _DEFAULT_STYLE

    word_count_target = (
        brief.get("word_count")
        or artifacts.get("word_count")
        or _DEFAULT_WORD_COUNT.get(layout, 650)
    )

    notify(task_id, "script", f"Writing {script_style} script (~{word_count_target} words)…")

    objectives = fetch_objectives(channel_id, api_get) if api_get else ""
    base_system = _STYLE_PROMPTS[script_style]
    system_prompt = inject_objectives(base_system, objectives)

    brief_fields = {
        k: v for k, v in {**brief, **artifacts}.items()
        if k not in {"script_text", "audio_r2_key", "video_r2_key", "thumbnail_r2_key"}
    }
    brief_fields["word_count"] = word_count_target
    user_content = f"Brief:\n{json.dumps(brief_fields, indent=2, default=str)}"

    max_tokens = _MAX_TOKENS.get(script_style, 2048)

    client = Anthropic()
    with claude_semaphore():
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
        )

    log_token_usage(
        model="claude-sonnet-4-6",
        provider="anthropic",
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
        task_id=task_id,
        skill="script",
        channel_id=channel_id,
        api_post=api_post,
    )

    raw = response.content[0].text.strip() if response.content else "{}"
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.rsplit("```", 1)[0].strip()

    result = json.loads(raw)
    script_text = result.get("script_text", "")
    word_count = result.get("word_count") or len(script_text.split())

    notify(task_id, "script_text", f"Script ready — {word_count}w ({script_style})")
    return {"script_text": script_text, "word_count": word_count}
