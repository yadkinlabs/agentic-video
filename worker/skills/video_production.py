"""
Video production skill — assembles audio + video clips into a final MP4 using FFmpeg.

artifacts consumed:
  audio_r2_key    (str)
  motion_keys     (list[str]) — animated clips (preferred)
  footage_keys    (list[str]) — static images (fallback if no motion)
  layout          "long" | "short"
  captions_enabled (bool, optional)
  script_text     (str, optional) — used for caption generation

artifacts produced:
  video_r2_key    (str)
"""

import logging
import os
import re
import subprocess
import tempfile
import uuid

from skills.utils import download_from_r2, upload_to_r2

log = logging.getLogger(__name__)

SKILL_DEFINITION = {
    "id": "video_production",
    "label": "Video Production",
    "definition": {
        "id": "video_production",
        "label": "Video Production",
        "description": "Assembles audio and video clips into a final MP4 using FFmpeg.",
        "runner": "video_production",
        "output_schema": {"video_r2_key": "string"},
    },
}

_IMAGE_CUE_RE = re.compile(r"\[image\s+\d+:[^\]]+\]", re.IGNORECASE)

# Seconds per still image when no motion clips are available
STILL_DURATION = 8


def _strip_cues(text: str) -> str:
    return _IMAGE_CUE_RE.sub("", text).strip()


def _run(cmd: list[str]) -> None:
    log.debug("ffmpeg: %s", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg failed:\n{result.stderr[-2000:]}")


def run_task(task: dict, channel_config: dict, api_patch, notify, api_get=None, api_post=None, **kwargs) -> dict:
    task_id = task["id"]
    channel_id = task.get("channel_id")
    artifacts = task.get("artifacts") or {}
    brief = task.get("brief") or {}

    audio_r2_key: str | None = artifacts.get("audio_r2_key")
    motion_keys: list[str] = artifacts.get("motion_keys") or []
    footage_keys: list[str] = artifacts.get("footage_keys") or []
    layout: str = artifacts.get("layout") or brief.get("layout") or "long"
    captions_enabled: bool = bool(
        artifacts.get("captions_enabled") or brief.get("captions_enabled")
        or channel_config.get("captions_enabled")
    )

    if not audio_r2_key:
        raise ValueError("video_production: audio_r2_key not found in artifacts")

    video_clips = motion_keys or footage_keys
    if not video_clips:
        raise ValueError("video_production: no video clips or footage images found")

    notify(task_id, "video_production", "Assembling video…")

    with tempfile.TemporaryDirectory() as tmp:
        # Download audio
        audio_path = os.path.join(tmp, "audio.mp3")
        with open(audio_path, "wb") as f:
            f.write(download_from_r2(audio_r2_key, channel_config))

        # Get audio duration
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", audio_path],
            capture_output=True, text=True
        )
        audio_duration = float(probe.stdout.strip() or "0")

        # Download clips / images and create a concat list
        clip_paths = []
        if motion_keys:
            for i, key in enumerate(motion_keys):
                p = os.path.join(tmp, f"clip_{i:03d}.mp4")
                with open(p, "wb") as f:
                    f.write(download_from_r2(key, channel_config))
                clip_paths.append(p)
        else:
            # Convert stills to short clips
            per_image = audio_duration / len(footage_keys) if footage_keys else STILL_DURATION
            for i, key in enumerate(footage_keys):
                img_path = os.path.join(tmp, f"img_{i:03d}.jpg")
                clip_path = os.path.join(tmp, f"clip_{i:03d}.mp4")
                with open(img_path, "wb") as f:
                    f.write(download_from_r2(key, channel_config))
                if layout == "short":
                    vf = "scale=1080:1920:force_original_aspect_ratio=cover,crop=1080:1920"
                else:
                    vf = "scale=1920:1080:force_original_aspect_ratio=cover,crop=1920:1080"
                _run([
                    "ffmpeg", "-y", "-loop", "1", "-i", img_path,
                    "-vf", vf,
                    "-t", str(per_image), "-r", "24",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    clip_path,
                ])
                clip_paths.append(clip_path)

        # Concat all clips
        concat_list = os.path.join(tmp, "concat.txt")
        with open(concat_list, "w") as f:
            for p in clip_paths:
                f.write(f"file '{p}'\n")

        merged_video = os.path.join(tmp, "merged.mp4")
        _run([
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list,
            "-c", "copy", merged_video,
        ])

        # Mux audio + video, trim to audio length
        final_path = os.path.join(tmp, "final.mp4")
        _run([
            "ffmpeg", "-y",
            "-i", merged_video, "-i", audio_path,
            "-map", "0:v:0", "-map", "1:a:0",
            "-c:v", "libx264", "-c:a", "aac",
            "-shortest",
            final_path,
        ])

        with open(final_path, "rb") as f:
            video_data = f.read()

    r2_key = f"video/{channel_id}/{task_id}/{uuid.uuid4().hex[:8]}.mp4"
    upload_to_r2(video_data, r2_key, channel_config, content_type="video/mp4")

    notify(task_id, "video_production", f"Video ready — {len(video_data) // (1024*1024)}MB")
    return {"video_r2_key": r2_key}
