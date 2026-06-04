"""
Skill dispatch table. Add new skills here — one line per skill.
"""

from skills import (
    footage,
    motion,
    research,
    script,
    smart_fix,
    thumbnail,
    upload,
    video_pipeline,
    video_production,
    voice,
)

RUNNERS: dict[str, callable] = {
    "video_pipeline":  video_pipeline.run_task,
    "research":        research.run_task,
    "script":          script.run_task,
    "voice":           voice.run_task,
    "footage":         footage.run_task,
    "motion":          motion.run_task,
    "video_production": video_production.run_task,
    "thumbnail":       thumbnail.run_task,
    "upload":          upload.run_task,
    "smart_fix":       smart_fix.run_task,
}
