"""
Motion skill — animates footage images using Runway Gen-4.

channel_config keys:
  runway_api_key

artifacts consumed:
  footage_keys  (list[str]) — R2 keys of source images

artifacts produced:
  motion_keys   (list[str]) — R2 keys of animated video clips (mp4)
"""

import logging
import time
import uuid

import requests

from skills.utils import download_from_r2, upload_to_r2

log = logging.getLogger(__name__)

SKILL_DEFINITION = {
    "id": "motion",
    "label": "Motion",
    "definition": {
        "id": "motion",
        "label": "Motion",
        "description": "Animates footage images using Runway Gen-4.",
        "runner": "motion",
        "output_schema": {"motion_keys": "array"},
    },
}

RUNWAY_API = "https://api.dev.runwayml.com/v1"
POLL_INTERVAL = 10
MAX_WAIT = 600  # 10 minutes per clip


def _animate_image(image_b64: str, prompt_text: str, api_key: str, duration: int = 5) -> bytes:
    """Submit an image-to-video task to Runway and poll until complete."""
    resp = requests.post(
        f"{RUNWAY_API}/image_to_video",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "X-Runway-Version": "2024-11-06",
        },
        json={
            "model": "gen4_turbo",
            "promptImage": f"data:image/png;base64,{image_b64}",
            "promptText": prompt_text,
            "duration": duration,
            "ratio": "1280:768",
        },
        timeout=30,
    )
    resp.raise_for_status()
    task_id = resp.json()["id"]

    deadline = time.time() + MAX_WAIT
    while time.time() < deadline:
        time.sleep(POLL_INTERVAL)
        status_resp = requests.get(
            f"{RUNWAY_API}/tasks/{task_id}",
            headers={"Authorization": f"Bearer {api_key}", "X-Runway-Version": "2024-11-06"},
            timeout=15,
        )
        status_resp.raise_for_status()
        data = status_resp.json()
        state = data.get("status")
        if state == "SUCCEEDED":
            video_url = data["output"][0]
            return requests.get(video_url, timeout=120).content
        if state in ("FAILED", "CANCELLED"):
            raise RuntimeError(f"Runway task {task_id} {state}: {data.get('failure', '')}")

    raise TimeoutError(f"Runway task {task_id} timed out after {MAX_WAIT}s")


def run_task(task: dict, channel_config: dict, api_patch, notify, api_get=None, api_post=None, **kwargs) -> dict:
    import base64

    task_id = task["id"]
    channel_id = task.get("channel_id")
    artifacts = task.get("artifacts") or {}
    brief = task.get("brief") or {}

    footage_keys: list[str] = artifacts.get("footage_keys") or []
    if not footage_keys:
        notify(task_id, "motion", "No footage keys — skipping motion")
        return {"motion_keys": []}

    api_key = channel_config.get("runway_api_key")
    if not api_key:
        raise ValueError("motion: runway_api_key not configured")

    motion_prompt = brief.get("motion_prompt") or "Cinematic camera movement, smooth and natural."

    notify(task_id, "motion", f"Animating {len(footage_keys)} clips…")

    motion_keys = []
    for i, r2_key in enumerate(footage_keys):
        notify(task_id, "motion", f"Animating clip {i + 1}/{len(footage_keys)}…")
        image_bytes = download_from_r2(r2_key, channel_config)
        image_b64 = base64.b64encode(image_bytes).decode()

        video_bytes = _animate_image(image_b64, motion_prompt, api_key)
        out_key = f"motion/{channel_id}/{task_id}/clip_{i:03d}_{uuid.uuid4().hex[:8]}.mp4"
        upload_to_r2(video_bytes, out_key, channel_config, content_type="video/mp4")
        motion_keys.append(out_key)

    notify(task_id, "motion", f"{len(motion_keys)} clips ready")
    return {"motion_keys": motion_keys}
