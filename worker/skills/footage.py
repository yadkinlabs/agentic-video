"""
Footage skill — generates images for each [image N: description] cue in the script.

channel_config keys:
  image_gen_provider   "openai" (default) | "stability"
  image_gen_api_key    (optional, falls back to OPENAI_API_KEY env)

artifacts consumed:
  script_text   (str) — with embedded [image N: description] tags

artifacts produced:
  footage_keys  (list[str]) — R2 keys in cue order
"""

import logging
import os
import re
import uuid

import requests
from openai import OpenAI

from skills.utils import upload_to_r2, log_token_usage

log = logging.getLogger(__name__)

SKILL_DEFINITION = {
    "id": "footage",
    "label": "Footage",
    "definition": {
        "id": "footage",
        "label": "Footage",
        "description": "Generates an image for each visual cue embedded in the script.",
        "runner": "footage",
        "output_schema": {"footage_keys": "array"},
    },
}

_CUE_RE = re.compile(r"\[image\s+(\d+):\s*([^\]]+)\]", re.IGNORECASE)


def _parse_cues(script_text: str) -> list[tuple[int, str]]:
    seen = set()
    cues = []
    for m in _CUE_RE.finditer(script_text):
        idx, desc = int(m.group(1)), m.group(2).strip()
        if idx not in seen:
            cues.append((idx, desc))
            seen.add(idx)
    return sorted(cues, key=lambda c: c[0])


def _generate_openai(description: str, layout: str, api_key: str) -> bytes:
    client = OpenAI(api_key=api_key)
    size = "1792x1024" if layout == "long" else "1024x1792"
    response = client.images.generate(
        model="dall-e-3",
        prompt=description,
        size=size,
        quality="standard",
        n=1,
        response_format="url",
    )
    url = response.data[0].url
    return requests.get(url, timeout=60).content


def _generate_stability(description: str, layout: str, api_key: str) -> bytes:
    width, height = (1344, 768) if layout == "long" else (768, 1344)
    resp = requests.post(
        "https://api.stability.ai/v2beta/stable-image/generate/core",
        headers={"Authorization": f"Bearer {api_key}", "Accept": "image/*"},
        files={"none": ""},
        data={
            "prompt": description,
            "output_format": "jpeg",
            "width": width,
            "height": height,
        },
        timeout=90,
    )
    resp.raise_for_status()
    return resp.content


def run_task(task: dict, channel_config: dict, api_patch, notify, api_get=None, api_post=None, **kwargs) -> dict:
    task_id = task["id"]
    channel_id = task.get("channel_id")
    artifacts = task.get("artifacts") or {}
    brief = task.get("brief") or {}

    script_text = artifacts.get("script_text") or brief.get("script_text") or ""
    if not script_text:
        raise ValueError("footage: script_text not found in artifacts")

    layout = artifacts.get("layout") or brief.get("layout") or "long"
    cues = _parse_cues(script_text)
    if not cues:
        notify(task_id, "footage", "No image cues found — skipping footage")
        return {"footage_keys": []}

    provider = channel_config.get("image_gen_provider") or "openai"
    api_key = (
        channel_config.get("image_gen_api_key")
        or os.environ.get("OPENAI_API_KEY", "")
    )
    if not api_key:
        raise ValueError("footage: image_gen_api_key not configured")

    notify(task_id, "footage", f"Generating {len(cues)} images ({provider})…")

    footage_keys = []
    for i, (idx, description) in enumerate(cues):
        notify(task_id, "footage", f"Image {idx}/{len(cues)}: {description[:60]}…")

        if provider == "stability":
            image_data = _generate_stability(description, layout, api_key)
            ext = "jpg"
        else:
            image_data = _generate_openai(description, layout, api_key)
            ext = "png"

        r2_key = f"footage/{channel_id}/{task_id}/img_{idx:03d}_{uuid.uuid4().hex[:8]}.{ext}"
        upload_to_r2(image_data, r2_key, channel_config, content_type=f"image/{ext}")

        footage_keys.append(r2_key)

        # Register in FootageItem table
        if api_post:
            try:
                api_post("/api/footage", {
                    "channel_id": channel_id,
                    "task_id": task_id,
                    "r2_key": r2_key,
                    "prompt": description,
                    "width": 1792 if layout == "long" else 1024,
                    "height": 1024 if layout == "long" else 1792,
                })
            except Exception as e:
                log.warning("footage: failed to register FootageItem: %s", e)

    notify(task_id, "footage", f"{len(footage_keys)} images ready")
    return {"footage_keys": footage_keys}
