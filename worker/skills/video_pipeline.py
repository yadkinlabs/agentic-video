"""
Video pipeline orchestrator — drives the full production pipeline.

Pipeline:
  [research] → script → review_script →
  voice + footage (parallel) → review_footage →
  [motion] → video_production → thumbnail → review_final →
  upload → complete

Review gates pause the parent task at PENDING_APPROVAL and wait for the
user to approve before continuing. Motion is optional (brief.use_motion).
Research is optional (brief.skip_research).

NOTE: The orchestrator blocks its worker thread while waiting for sub-tasks
and approval gates. Set WORKER_CONCURRENCY >= 8 to prevent deadlocks when
multiple pipelines run concurrently.
"""

import logging
import threading
import time

from skills.utils import wait_for_subtask, wait_for_approval

log = logging.getLogger(__name__)

SKILL_DEFINITION = {
    "id": "video_pipeline",
    "label": "Video Pipeline",
    "definition": {
        "id": "video_pipeline",
        "label": "Video Pipeline",
        "description": "Drives the full video production pipeline from research to upload.",
        "runner": "video_pipeline",
        "output_schema": {"youtube_video_id": "string", "youtube_url": "string"},
    },
}


def _create_subtask(
    channel_id: int,
    parent_task_id: str,
    skill: str,
    title: str,
    brief: dict,
    api_post,
) -> dict:
    return api_post("/api/tasks", {
        "channel_id": channel_id,
        "skill": skill,
        "title": title,
        "brief": brief,
        "parent_task_id": parent_task_id,
        "status": "APPROVED",
    })


def _merge_artifacts(task_id: str, new_artifacts: dict, api_patch) -> None:
    if new_artifacts:
        api_patch(f"/api/tasks/{task_id}", {
            "action": "patch_artifacts",
            "artifacts_patch": new_artifacts,
        })


def _set_step(task_id: str, step: str, api_patch) -> None:
    api_patch(f"/api/tasks/{task_id}", {"action": "set_step", "step": step})


def _set_pending_approval(task_id: str, step: str, artifacts_patch: dict, api_patch) -> None:
    api_patch(f"/api/tasks/{task_id}", {
        "action": "pending_approval",
        "step": step,
        "artifacts_patch": artifacts_patch,
    })


def run_task(task: dict, channel_config: dict, api_patch, notify, api_get=None, api_post=None, **kwargs) -> dict:
    task_id = task["id"]
    channel_id = task.get("channel_id")
    brief = task.get("brief") or {}
    artifacts: dict = dict(task.get("artifacts") or {})

    use_motion = bool(brief.get("use_motion", False))
    skip_research = bool(brief.get("skip_research", False))
    layout = brief.get("layout") or "long"

    def child_brief() -> dict:
        """Current brief merged with accumulated artifacts."""
        return {**brief, **artifacts}

    # ── Step 1: Research ──────────────────────────────────────────────────────
    if not skip_research:
        notify(task_id, "video_pipeline", "Starting research…")
        _set_step(task_id, "research", api_patch)
        research_task = _create_subtask(channel_id, task_id, "research", f"Research: {brief.get('topic', '')}", child_brief(), api_post)
        research_artifacts = wait_for_subtask(research_task["id"], api_get)
        artifacts.update(research_artifacts)
        _merge_artifacts(task_id, research_artifacts, api_patch)

    # ── Step 2: Script ────────────────────────────────────────────────────────
    notify(task_id, "video_pipeline", "Writing script…")
    _set_step(task_id, "script", api_patch)
    script_task = _create_subtask(channel_id, task_id, "script", f"Script: {brief.get('topic', '')}", child_brief(), api_post)
    script_artifacts = wait_for_subtask(script_task["id"], api_get)
    artifacts.update(script_artifacts)

    # ── Review gate: script ───────────────────────────────────────────────────
    notify(task_id, "video_pipeline", "Waiting for script approval…")
    _set_pending_approval(task_id, "review_script", script_artifacts, api_patch)
    updated_task = wait_for_approval(task_id, api_get)
    # Re-read artifacts in case user edited the script
    artifacts.update(updated_task.get("artifacts") or {})

    # ── Step 3: Voice + Footage (parallel) ───────────────────────────────────
    notify(task_id, "video_pipeline", "Starting voice and footage…")
    _set_step(task_id, "voice+footage", api_patch)

    voice_result: dict = {}
    footage_result: dict = {}
    errors: list[str] = []

    def run_voice():
        try:
            t = _create_subtask(channel_id, task_id, "voice", f"Voice: {brief.get('topic', '')}", child_brief(), api_post)
            voice_result.update(wait_for_subtask(t["id"], api_get))
        except Exception as e:
            errors.append(f"voice: {e}")

    def run_footage():
        try:
            t = _create_subtask(channel_id, task_id, "footage", f"Footage: {brief.get('topic', '')}", child_brief(), api_post)
            footage_result.update(wait_for_subtask(t["id"], api_get))
        except Exception as e:
            errors.append(f"footage: {e}")

    voice_thread = threading.Thread(target=run_voice)
    footage_thread = threading.Thread(target=run_footage)
    voice_thread.start()
    footage_thread.start()
    voice_thread.join()
    footage_thread.join()

    if errors:
        raise RuntimeError("; ".join(errors))

    artifacts.update(voice_result)
    artifacts.update(footage_result)

    # ── Review gate: footage ──────────────────────────────────────────────────
    notify(task_id, "video_pipeline", "Waiting for footage approval…")
    _set_pending_approval(task_id, "review_footage", {**voice_result, **footage_result}, api_patch)
    wait_for_approval(task_id, api_get)

    # ── Step 4: Motion (optional) ─────────────────────────────────────────────
    if use_motion:
        notify(task_id, "video_pipeline", "Starting motion…")
        _set_step(task_id, "motion", api_patch)
        motion_task = _create_subtask(channel_id, task_id, "motion", f"Motion: {brief.get('topic', '')}", child_brief(), api_post)
        motion_artifacts = wait_for_subtask(motion_task["id"], api_get)
        artifacts.update(motion_artifacts)
        _merge_artifacts(task_id, motion_artifacts, api_patch)

    # ── Step 5: Video production ──────────────────────────────────────────────
    notify(task_id, "video_pipeline", "Assembling video…")
    _set_step(task_id, "video_production", api_patch)
    video_task = _create_subtask(channel_id, task_id, "video_production", f"Video: {brief.get('topic', '')}", child_brief(), api_post)
    video_artifacts = wait_for_subtask(video_task["id"], api_get)
    artifacts.update(video_artifacts)
    _merge_artifacts(task_id, video_artifacts, api_patch)

    # ── Step 6: Thumbnail ─────────────────────────────────────────────────────
    notify(task_id, "video_pipeline", "Generating thumbnail…")
    _set_step(task_id, "thumbnail", api_patch)
    thumb_task = _create_subtask(channel_id, task_id, "thumbnail", f"Thumbnail: {brief.get('topic', '')}", child_brief(), api_post)
    thumb_artifacts = wait_for_subtask(thumb_task["id"], api_get)
    artifacts.update(thumb_artifacts)
    _merge_artifacts(task_id, thumb_artifacts, api_patch)

    # ── Review gate: final ────────────────────────────────────────────────────
    notify(task_id, "video_pipeline", "Waiting for final approval…")
    _set_pending_approval(task_id, "review_final", {**video_artifacts, **thumb_artifacts}, api_patch)
    wait_for_approval(task_id, api_get)

    # ── Step 7: Upload ────────────────────────────────────────────────────────
    notify(task_id, "video_pipeline", "Uploading to YouTube…")
    _set_step(task_id, "upload", api_patch)
    upload_task = _create_subtask(channel_id, task_id, "upload", f"Upload: {brief.get('topic', '')}", child_brief(), api_post)
    upload_artifacts = wait_for_subtask(upload_task["id"], api_get)
    artifacts.update(upload_artifacts)

    notify(task_id, "video_pipeline", f"Done: {upload_artifacts.get('youtube_url', '')}")
    return upload_artifacts
