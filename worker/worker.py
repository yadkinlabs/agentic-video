"""
agentic-video worker — polls the API for APPROVED tasks and runs them.

Usage:
  cd worker
  python worker.py

Environment (.env.worker):
  APP_URL             Base URL of the Next.js app
  INTERNAL_API_KEY    Shared secret for worker↔API auth
  POLL_INTERVAL       Seconds between polls (default 10)
  WORKER_CONCURRENCY  Max concurrent tasks (default 8)

IMPORTANT: Set WORKER_CONCURRENCY >= 8. The video_pipeline orchestrator
blocks its thread while waiting for sub-tasks. If concurrency is too low,
sub-tasks will queue behind the blocked orchestrator and deadlock.
"""

import logging
import os
import signal
import sys
import time
from concurrent.futures import Future, ThreadPoolExecutor

import requests
from dotenv import load_dotenv

load_dotenv(".env.worker")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("worker")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

APP_URL = os.environ["APP_URL"].rstrip("/")
INTERNAL_API_KEY = os.environ["INTERNAL_API_KEY"]
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "10"))
CONCURRENCY = int(os.environ.get("WORKER_CONCURRENCY", "8"))

_HEADERS = {
    "x-internal-key": INTERNAL_API_KEY,
    "Content-Type": "application/json",
}

# ---------------------------------------------------------------------------
# API helpers (passed to skill runners)
# ---------------------------------------------------------------------------

def _api_get(path: str) -> dict | list:
    url = f"{APP_URL}{path}"
    resp = requests.get(url, headers=_HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.json()


def _api_post(path: str, data: dict) -> dict:
    url = f"{APP_URL}{path}"
    resp = requests.post(url, headers=_HEADERS, json=data, timeout=30)
    resp.raise_for_status()
    return resp.json()


def _api_patch(path: str, data: dict) -> dict:
    url = f"{APP_URL}{path}"
    resp = requests.patch(url, headers=_HEADERS, json=data, timeout=30)
    resp.raise_for_status()
    return resp.json()


def _notify(task_id: str, step: str, message: str) -> None:
    log.info("[%s] %s — %s", task_id[:8], step, message)
    try:
        _api_patch(f"/api/tasks/{task_id}", {
            "action": "notify",
            "level": "info",
            "message": message,
        })
    except Exception as e:
        log.warning("notify failed: %s", e)

# ---------------------------------------------------------------------------
# Task execution
# ---------------------------------------------------------------------------

def _run_task(task: dict) -> dict:
    """Resolve channel config, then dispatch to the skill runner."""
    from dispatch import RUNNERS

    task_id = task["id"]
    skill = task.get("skill")
    channel_id = task.get("channel_id")

    runner = RUNNERS.get(skill)
    if runner is None:
        raise ValueError(f"No runner registered for skill '{skill}'")

    # Fetch decrypted channel config
    channel_config: dict = {}
    try:
        channel_config = _api_get(f"/api/channels/{channel_id}/config")
    except Exception as e:
        log.warning("[%s] Could not fetch channel config: %s", task_id[:8], e)

    return runner(
        task=task,
        channel_config=channel_config,
        api_patch=_api_patch,
        notify=_notify,
        api_get=_api_get,
        api_post=_api_post,
    )


def _on_task_done(task_id: str, future: Future) -> None:
    _inflight.discard(task_id)
    try:
        result = future.result()
        log.info("[%s] COMPLETE — %s", task_id[:8], list(result.keys()))
        _api_patch(f"/api/tasks/{task_id}", {
            "action": "complete",
            "artifacts_patch": result,
        })
    except Exception as e:
        log.error("[%s] FAILED — %s", task_id[:8], e, exc_info=True)
        try:
            _api_patch(f"/api/tasks/{task_id}", {
                "action": "fail",
                "reason": str(e),
            })
        except Exception:
            pass

# ---------------------------------------------------------------------------
# Main polling loop
# ---------------------------------------------------------------------------

_inflight: set[str] = set()
_shutdown = False


def _handle_signal(sig, frame):
    global _shutdown
    log.info("Shutdown signal received — finishing in-flight tasks…")
    _shutdown = True


def main():
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    log.info("Worker starting — concurrency=%d poll=%ds", CONCURRENCY, POLL_INTERVAL)
    log.info("App URL: %s", APP_URL)

    executor = ThreadPoolExecutor(max_workers=CONCURRENCY)

    try:
        while not _shutdown:
            try:
                tasks = _api_get(f"/api/tasks?status=APPROVED&limit={CONCURRENCY * 2}")
                for task in tasks:
                    task_id = task["id"]
                    if task_id in _inflight:
                        continue
                    if len(_inflight) >= CONCURRENCY:
                        break

                    # Atomic claim
                    try:
                        claimed = _api_patch(f"/api/tasks/{task_id}", {"action": "claim"})
                    except Exception as e:
                        log.debug("Claim failed for %s (likely raced): %s", task_id[:8], e)
                        continue

                    if claimed.get("status") != "RUNNING":
                        continue

                    _inflight.add(task_id)
                    log.info("[%s] Claimed — skill=%s", task_id[:8], task.get("skill"))

                    future = executor.submit(_run_task, claimed)
                    future.add_done_callback(lambda f, tid=task_id: _on_task_done(tid, f))

            except Exception as e:
                log.error("Poll error: %s", e, exc_info=True)

            time.sleep(POLL_INTERVAL)

    finally:
        log.info("Waiting for in-flight tasks to finish…")
        executor.shutdown(wait=True)
        log.info("Worker stopped.")


if __name__ == "__main__":
    main()
