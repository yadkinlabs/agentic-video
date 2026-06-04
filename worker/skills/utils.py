"""
Shared utilities for all skill runners.
"""

import io
import logging
import os
import threading
import time
from contextlib import contextmanager

import boto3
import requests

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Claude concurrency semaphore — limit simultaneous Claude API calls
# ---------------------------------------------------------------------------

_CLAUDE_SEMAPHORE = threading.Semaphore(int(os.environ.get("CLAUDE_CONCURRENCY", "4")))


@contextmanager
def claude_semaphore():
    _CLAUDE_SEMAPHORE.acquire()
    try:
        yield
    finally:
        _CLAUDE_SEMAPHORE.release()


# ---------------------------------------------------------------------------
# Objectives — fetch and inject into skill prompts
# ---------------------------------------------------------------------------

def fetch_objectives(channel_id: int, api_get) -> str:
    """Return all channel objectives joined as a single string."""
    try:
        objectives = api_get(f"/api/channels/{channel_id}/objectives")
        if isinstance(objectives, list):
            return "\n".join(o["content"] for o in objectives if o.get("content"))
    except Exception as e:
        log.warning("fetch_objectives failed: %s", e)
    return ""


def inject_objectives(base_prompt: str, objectives: str) -> str:
    """Append objectives block to a system prompt if objectives are present."""
    if not objectives.strip():
        return base_prompt
    return (
        f"{base_prompt}\n\n"
        "--- Channel Objectives ---\n"
        f"{objectives}\n"
        "--- End Objectives ---"
    )


# ---------------------------------------------------------------------------
# Token usage logging
# ---------------------------------------------------------------------------

def log_token_usage(
    model: str,
    provider: str,
    input_tokens: int,
    output_tokens: int,
    task_id: str | None = None,
    skill: str | None = None,
    channel_id: int | None = None,
    api_post=None,
):
    if api_post is None:
        log.info(
            "tokens approximate — model=%s provider=%s in=%d out=%d skill=%s",
            model, provider, input_tokens, output_tokens, skill,
        )
        return
    try:
        api_post("/api/token-usage", {
            "task_id": task_id,
            "channel_id": channel_id,
            "skill": skill,
            "model": model,
            "provider": provider,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        })
    except Exception as e:
        log.warning("log_token_usage failed: %s", e)


# ---------------------------------------------------------------------------
# R2 / S3-compatible storage helpers
# ---------------------------------------------------------------------------

def _r2_client(channel_config: dict):
    return boto3.client(
        "s3",
        region_name="auto",
        endpoint_url=f"https://{channel_config['r2_account_id']}.r2.cloudflarestorage.com",
        aws_access_key_id=channel_config["r2_access_key"],
        aws_secret_access_key=channel_config["r2_secret_key"],
    )


def upload_to_r2(data: bytes, key: str, channel_config: dict, content_type: str = "application/octet-stream") -> str:
    """Upload bytes to R2 and return the R2 key."""
    client = _r2_client(channel_config)
    bucket = channel_config["r2_bucket"]
    client.put_object(Bucket=bucket, Key=key, Body=data, ContentType=content_type)
    log.info("uploaded %d bytes to r2://%s/%s", len(data), bucket, key)
    return key


def presign_r2(key: str, channel_config: dict, expires: int = 3600) -> str:
    """Generate a presigned URL for an R2 object."""
    client = _r2_client(channel_config)
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": channel_config["r2_bucket"], "Key": key},
        ExpiresIn=expires,
    )


def download_from_r2(key: str, channel_config: dict) -> bytes:
    """Download an R2 object and return its bytes."""
    client = _r2_client(channel_config)
    resp = client.get_object(Bucket=channel_config["r2_bucket"], Key=key)
    return resp["Body"].read()


# ---------------------------------------------------------------------------
# Sub-task polling helpers (used by orchestrator)
# ---------------------------------------------------------------------------

def wait_for_subtask(
    subtask_id: str,
    api_get,
    poll_interval: float = 5.0,
    timeout: float = 3600.0,
) -> dict:
    """Poll a sub-task until COMPLETE, then return its artifacts."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        task = api_get(f"/api/tasks/{subtask_id}")
        status = task.get("status")
        if status == "COMPLETE":
            return task.get("artifacts") or {}
        if status in ("FAILED", "CANCELLED"):
            reason = task.get("revision_notes") or status
            raise RuntimeError(f"Sub-task {subtask_id} {status}: {reason}")
        time.sleep(poll_interval)
    raise TimeoutError(f"Sub-task {subtask_id} did not complete within {timeout}s")


def wait_for_approval(
    task_id: str,
    api_get,
    poll_interval: float = 10.0,
    timeout: float = 86400.0,
) -> dict:
    """Poll a task until it transitions from PENDING_APPROVAL back to APPROVED."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        task = api_get(f"/api/tasks/{task_id}")
        status = task.get("status")
        if status == "APPROVED":
            return task
        if status in ("CANCELLED", "FAILED"):
            raise RuntimeError(f"Task {task_id} {status} during approval wait")
        time.sleep(poll_interval)
    raise TimeoutError(f"Task {task_id} not approved within {timeout}s")
