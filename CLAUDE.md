# agentic-video

Open-source AI video production pipeline. Next.js (App Router) frontend/API, Python worker, PostgreSQL on Neon.

## Stack

- **Frontend/API**: Next.js 15 (App Router, TypeScript), Tailwind CSS 4
- **ORM**: Prisma 7 with `@prisma/adapter-pg` (required — Prisma v7 needs an adapter)
- **Database**: Neon PostgreSQL — pooled URL for app queries, direct URL for migrations
- **Auth**: jose (JWT HS256), bcryptjs
- **AI**: `@anthropic-ai/sdk` (Claude), `openai`
- **Worker**: Python 3, runs anywhere (Pi, VPS, Mac Mini)

## Key Commands

```bash
npm run dev                   # dev server
npm run build                 # prisma generate + next build

cd worker
python worker.py              # start worker (foreground)
python seed_skills.py         # upsert skill definitions into DB
pip install -r requirements.txt
```

## Migrations

Never use `prisma migrate dev`. The pattern is:

1. Write raw SQL in `prisma/migrations/<timestamp_name>/migration.sql`
2. Run it: `npx prisma db execute --file prisma/migrations/<name>/migration.sql --schema prisma/schema.prisma`
3. Mark applied: `npx prisma migrate resolve --applied <name>`
4. Regenerate client: `npx prisma generate`

Always include data migration in the SQL file.

## Auth

- `requireAuth(req)` — validates JWT, throws 401
- `requireChannelRole(req, channelId, minRole)` — validates JWT + checks channel role ≥ minimum
- `requireSuperAdmin(req)` — super_admin only
- `requireInternalKey(req)` — validates x-internal-key header (worker calls)
- Role hierarchy: `viewer < editor < approver < admin < super_admin`
- Worker uses `x-internal-key` header instead of JWT

## Architecture

### Task flow

```
DRAFT → PENDING_APPROVAL → APPROVED → RUNNING → COMPLETE | FAILED | CANCELLED
```

UI creates tasks via `POST /api/tasks` (NLP-routed via `routeTask()` using Claude Haiku).
Worker polls `GET /api/tasks?status=APPROVED`, claims atomically, dispatches to skill runner.
Sub-tasks created with `status: APPROVED` and `parent_task_id` set.

### Pipeline

`video_pipeline` orchestrator drives:
```
[research] → script → review_script →
voice + footage (parallel) → review_footage →
[motion] → video_production → thumbnail → review_final →
upload → complete
```

Review gates: orchestrator sets parent to `PENDING_APPROVAL`, waits for it to return to `APPROVED`.

### Worker

`worker/worker.py` — polling loop, `ThreadPoolExecutor` (default 8 workers).
**Set WORKER_CONCURRENCY >= 8** — orchestrators block their thread waiting for sub-tasks.
Skill runners in `worker/skills/`. Dispatch table in `worker/dispatch.py`.

### Skill runner contract

```python
def run_task(task, channel_config, api_patch, notify, api_get=None, api_post=None, **kwargs) -> dict:
    return {"artifact_key": value}
```

Add a skill: create `worker/skills/my_skill.py` with `SKILL_DEFINITION + run_task`, add one line to `worker/dispatch.py`.

### Service config

Channel-level secrets (R2, ElevenLabs, YouTube, Runway, image gen) live in `ServiceConfig` in the DB.
Worker calls `GET /api/channels/:id/config` (with x-internal-key) to get all decrypted values.
UI manages config via `PUT /api/channels/:id/config` (key + value, stored AES-256-GCM encrypted).

### Objectives

Channel editorial guidance (tone, CTA, style) lives in `Objective` rows.
`fetch_objectives(channel_id, api_get)` in `skills/utils.py` fetches and joins them.
`inject_objectives(base_prompt, objectives)` appends them to skill system prompts.
All skills that call Claude should use these.

## Environment Variables

**Frontend (`.env.local`):**
```
DATABASE_URL          # Neon pooled
DIRECT_URL            # Neon direct (migrations)
JWT_SECRET
CONFIG_ENCRYPTION_KEY # base64 32-byte AES key
ANTHROPIC_API_KEY     # task routing NLP + smart_fix
INTERNAL_API_KEY      # shared secret for worker↔API
NEXT_PUBLIC_APP_URL
```

**Worker (`worker/.env.worker`):**
```
APP_URL
INTERNAL_API_KEY
ANTHROPIC_API_KEY
OPENAI_API_KEY        # fallback image gen
POLL_INTERVAL         # default 10
WORKER_CONCURRENCY    # default 8
```

## File Layout

```
src/
  app/
    api/              # API routes
    editor/           # Channel UI
    login/            # Login page
  lib/
    auth.ts           # JWT + role helpers
    auth-context.tsx  # Client-side auth provider
    config.ts         # ServiceConfig encryption + resolution
    prisma.ts         # Prisma singleton
    task-router.ts    # NLP task routing via Claude Haiku
worker/
  worker.py           # Main polling loop
  dispatch.py         # Skill dispatch table
  seed_skills.py      # Upsert skill definitions into DB
  skills/             # Skill runners
    utils.py          # Shared helpers
    video_pipeline.py # Orchestrator
    script.py
    voice.py
    footage.py
    motion.py
    video_production.py
    thumbnail.py
    upload.py
    research.py
    smart_fix.py
prisma/
  schema.prisma
  migrations/
```

## Design Principles

- **No sub-channels** — one channel, one pipeline
- **Objectives over hardcoded prompts** — editorial direction lives in the DB, not in skill code
- **Service config in DB** — all secrets managed through UI, never in env files per-channel
- **Single orchestrator** — `video_pipeline` handles both long and short format via `brief.layout`
- **Extensible by convention** — add a skill with `SKILL_DEFINITION + run_task`, register in dispatch.py
