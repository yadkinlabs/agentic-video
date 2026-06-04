"""
Thumbnail skill — generates a YouTube thumbnail image.

artifacts consumed:
  topic          (str)
  footage_keys   (list[str]) — use first image as base (optional)
  layout         "long" | "short"

artifacts produced:
  thumbnail_r2_key  (str)
"""

import logging
import os
import uuid

import requests
from openai import OpenAI

from skills.utils import upload_to_r2

log = logging.getLogger(__name__)

SKILL_DEFINITION = {
    "id": "thumbnail",
    "label": "Thumbnail",
    "definition": {
        "id": "thumbnail",
        "label": "Thumbnail",
        "description": "Generates a YouTube thumbnail image using AI image generation.",
        "runner": "thumbnail",
        "output_schema": {"thumbnail_r2_key": "string"},
    },
}


def _thumbnail_prompt(topic: str) -> str:
    return (
        f"Eye-catching YouTube thumbnail for a video about: {topic}. "
        "Bold composition, high contrast, dramatic lighting. "
        "No text or words in the image. Photorealistic style."
    )


def run_task(task: dict, channel_config: dict, api_patch, notify, api_get=None, api_post=None, **kwargs) -> dict:
    task_id = task["id"]
    channel_id = task.get("channel_id")
    artifacts = task.get("artifacts") or {}
    brief = task.get("brief") or {}

    topic = artifacts.get("topic") or brief.get("topic") or "video thumbnail"

    provider = channel_config.get("image_gen_provider") or "openai"
    api_key = (
        channel_config.get("image_gen_api_key")
        or os.environ.get("OPENAI_API_KEY", "")
    )
    if not api_key:
        raise ValueError("thumbnail: image_gen_api_key not configured")

    notify(task_id, "thumbnail", "Generating thumbnail…")

    prompt = _thumbnail_prompt(topic)

    if provider == "stability":
        resp = requests.post(
            "https://api.stability.ai/v2beta/stable-image/generate/core",
            headers={"Authorization": f"Bearer {api_key}", "Accept": "image/*"},
            files={"none": ""},
            data={"prompt": prompt, "output_format": "jpeg", "width": 1344, "height": 768},
            timeout=90,
        )
        resp.raise_for_status()
        image_data = resp.content
        ext = "jpg"
    else:
        client = OpenAI(api_key=api_key)
        response = client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            size="1792x1024",
            quality="standard",
            n=1,
            response_format="url",
        )
        url = response.data[0].url
        image_data = requests.get(url, timeout=60).content
        ext = "png"

    r2_key = f"thumbnail/{channel_id}/{task_id}/{uuid.uuid4().hex[:8]}.{ext}"
    upload_to_r2(image_data, r2_key, channel_config, content_type=f"image/{ext}")

    notify(task_id, "thumbnail", "Thumbnail ready")
    return {"thumbnail_r2_key": r2_key}
