"""
Upload skill — uploads the final video to YouTube.

channel_config keys:
  youtube_client_id
  youtube_client_secret
  youtube_refresh_token

artifacts consumed:
  video_r2_key      (str)
  thumbnail_r2_key  (str, optional)
  title             (str, optional — falls back to task title)
  topic             (str, optional)
  layout            "long" | "short"

artifacts produced:
  youtube_video_id  (str)
  youtube_url       (str)
"""

import logging
import os
import tempfile
import uuid

import requests

from skills.utils import download_from_r2

log = logging.getLogger(__name__)

SKILL_DEFINITION = {
    "id": "upload",
    "label": "Upload",
    "definition": {
        "id": "upload",
        "label": "Upload",
        "description": "Uploads the final video and thumbnail to YouTube.",
        "runner": "upload",
        "output_schema": {"youtube_video_id": "string", "youtube_url": "string"},
    },
}

YOUTUBE_TOKEN_URL = "https://oauth2.googleapis.com/token"
YOUTUBE_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos"
YOUTUBE_THUMBNAIL_URL = "https://www.googleapis.com/upload/youtube/v3/thumbnails/set"


def _refresh_access_token(client_id: str, client_secret: str, refresh_token: str) -> str:
    resp = requests.post(YOUTUBE_TOKEN_URL, data={
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }, timeout=15)
    resp.raise_for_status()
    return resp.json()["access_token"]


def _upload_video(video_path: str, title: str, description: str, layout: str, access_token: str) -> str:
    category_id = "22"  # People & Blogs
    is_short = layout == "short"

    metadata = {
        "snippet": {
            "title": title,
            "description": description,
            "categoryId": category_id,
            "tags": ["#Shorts"] if is_short else [],
        },
        "status": {"privacyStatus": "private"},  # safe default; change to public when ready
    }

    # Resumable upload
    init_resp = requests.post(
        f"{YOUTUBE_UPLOAD_URL}?uploadType=resumable&part=snippet,status",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "X-Upload-Content-Type": "video/mp4",
        },
        json=metadata,
        timeout=30,
    )
    init_resp.raise_for_status()
    upload_url = init_resp.headers["Location"]

    file_size = os.path.getsize(video_path)
    with open(video_path, "rb") as f:
        upload_resp = requests.put(
            upload_url,
            headers={
                "Content-Length": str(file_size),
                "Content-Type": "video/mp4",
            },
            data=f,
            timeout=600,
        )
    upload_resp.raise_for_status()
    return upload_resp.json()["id"]


def _upload_thumbnail(video_id: str, thumbnail_path: str, access_token: str) -> None:
    with open(thumbnail_path, "rb") as f:
        resp = requests.post(
            f"{YOUTUBE_THUMBNAIL_URL}?videoId={video_id}",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "image/jpeg",
            },
            data=f,
            timeout=60,
        )
    if not resp.ok:
        log.warning("thumbnail upload failed: %s", resp.text)


def run_task(task: dict, channel_config: dict, api_patch, notify, api_get=None, api_post=None, **kwargs) -> dict:
    task_id = task["id"]
    channel_id = task.get("channel_id")
    artifacts = task.get("artifacts") or {}
    brief = task.get("brief") or {}

    video_r2_key: str | None = artifacts.get("video_r2_key")
    thumbnail_r2_key: str | None = artifacts.get("thumbnail_r2_key")
    title = artifacts.get("title") or brief.get("topic") or task.get("title") or "Untitled"
    topic = artifacts.get("topic") or brief.get("topic") or ""
    layout = artifacts.get("layout") or brief.get("layout") or "long"

    if not video_r2_key:
        raise ValueError("upload: video_r2_key not found in artifacts")

    client_id = channel_config.get("youtube_client_id")
    client_secret = channel_config.get("youtube_client_secret")
    refresh_token = channel_config.get("youtube_refresh_token")
    if not all([client_id, client_secret, refresh_token]):
        raise ValueError("upload: YouTube credentials not configured")

    notify(task_id, "upload", "Refreshing YouTube token…")
    access_token = _refresh_access_token(client_id, client_secret, refresh_token)

    with tempfile.TemporaryDirectory() as tmp:
        notify(task_id, "upload", "Downloading video from R2…")
        video_path = os.path.join(tmp, "video.mp4")
        with open(video_path, "wb") as f:
            f.write(download_from_r2(video_r2_key, channel_config))

        notify(task_id, "upload", "Uploading to YouTube…")
        video_id = _upload_video(video_path, title, topic, layout, access_token)

        if thumbnail_r2_key:
            notify(task_id, "upload", "Setting thumbnail…")
            thumb_path = os.path.join(tmp, "thumb.jpg")
            with open(thumb_path, "wb") as f:
                f.write(download_from_r2(thumbnail_r2_key, channel_config))
            _upload_thumbnail(video_id, thumb_path, access_token)

    youtube_url = f"https://youtu.be/{video_id}"

    # Write Video record
    if api_post:
        try:
            api_post("/api/videos", {
                "channel_id": channel_id,
                "task_id": task_id,
                "title": title,
                "youtube_video_id": video_id,
                "r2_thumbnail_key": thumbnail_r2_key,
            })
        except Exception as e:
            log.warning("upload: failed to write Video record: %s", e)

    notify(task_id, "upload", f"Uploaded: {youtube_url}")
    return {"youtube_video_id": video_id, "youtube_url": youtube_url}
