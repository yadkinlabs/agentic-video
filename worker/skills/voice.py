"""
Voice skill — converts script_text to audio via ElevenLabs, uploads to R2.

channel_config keys:
  elevenlabs_api_key
  elevenlabs_voice_id

artifacts consumed:
  script_text   (str)

artifacts produced:
  audio_r2_key  (str) — R2 key of the uploaded mp3
"""

import logging
import re
import uuid

import requests

from skills.utils import upload_to_r2, log_token_usage

log = logging.getLogger(__name__)

SKILL_DEFINITION = {
    "id": "voice",
    "label": "Voice",
    "definition": {
        "id": "voice",
        "label": "Voice",
        "description": "Converts the script to audio using ElevenLabs TTS.",
        "runner": "voice",
        "output_schema": {"audio_r2_key": "string"},
    },
}

_IMAGE_CUE_RE = re.compile(r"\[image\s+\d+:[^\]]+\]", re.IGNORECASE)

ELEVENLABS_API = "https://api.elevenlabs.io/v1"


def _strip_image_cues(text: str) -> str:
    return _IMAGE_CUE_RE.sub("", text).strip()


def run_task(task: dict, channel_config: dict, api_patch, notify, api_get=None, api_post=None, **kwargs) -> dict:
    task_id = task["id"]
    channel_id = task.get("channel_id")
    artifacts = task.get("artifacts") or {}

    script_text = artifacts.get("script_text") or (task.get("brief") or {}).get("script_text") or ""
    if not script_text:
        raise ValueError("voice: script_text not found in artifacts")

    api_key = channel_config.get("elevenlabs_api_key")
    voice_id = channel_config.get("elevenlabs_voice_id")
    if not api_key or not voice_id:
        raise ValueError("voice: elevenlabs_api_key and elevenlabs_voice_id are required in service config")

    clean_script = _strip_image_cues(script_text)
    notify(task_id, "voice", f"Generating audio ({len(clean_script.split())} words)…")

    resp = requests.post(
        f"{ELEVENLABS_API}/text-to-speech/{voice_id}",
        headers={
            "xi-api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
        json={
            "text": clean_script,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        },
        timeout=120,
    )
    resp.raise_for_status()

    audio_data = resp.content
    r2_key = f"audio/{channel_id}/{task_id}/{uuid.uuid4().hex}.mp3"
    upload_to_r2(audio_data, r2_key, channel_config, content_type="audio/mpeg")

    notify(task_id, "voice", f"Audio ready — {len(audio_data) // 1024}KB")
    return {"audio_r2_key": r2_key}
