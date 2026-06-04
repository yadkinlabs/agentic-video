"""
Upserts all skill definitions into the database via the API.

Usage:
  cd worker
  python seed_skills.py
"""

import os
import sys

import requests
from dotenv import load_dotenv

load_dotenv(".env.worker")

from skills.footage import SKILL_DEFINITION as footage
from skills.motion import SKILL_DEFINITION as motion
from skills.research import SKILL_DEFINITION as research
from skills.script import SKILL_DEFINITION as script
from skills.smart_fix import SKILL_DEFINITION as smart_fix
from skills.thumbnail import SKILL_DEFINITION as thumbnail
from skills.upload import SKILL_DEFINITION as upload
from skills.video_pipeline import SKILL_DEFINITION as video_pipeline
from skills.video_production import SKILL_DEFINITION as video_production
from skills.voice import SKILL_DEFINITION as voice

SKILLS = [
    video_pipeline,
    research,
    script,
    voice,
    footage,
    motion,
    video_production,
    thumbnail,
    upload,
    smart_fix,
]

APP_URL = os.environ["APP_URL"].rstrip("/")
INTERNAL_API_KEY = os.environ["INTERNAL_API_KEY"]
HEADERS = {"x-internal-key": INTERNAL_API_KEY, "Content-Type": "application/json"}


def upsert_skill(skill: dict) -> None:
    skill_id = skill["id"]
    resp = requests.put(
        f"{APP_URL}/api/skills/{skill_id}",
        headers=HEADERS,
        json={"label": skill["label"], "definition": skill["definition"]},
        timeout=10,
    )
    if resp.ok:
        print(f"  ✓ {skill_id}")
    else:
        print(f"  ✗ {skill_id} — {resp.status_code} {resp.text[:120]}")


if __name__ == "__main__":
    print(f"Seeding {len(SKILLS)} skills → {APP_URL}")
    for skill in SKILLS:
        upsert_skill(skill)
    print("Done.")
