# agentic-video

An open-source AI video production pipeline. Give it a topic — it researches, writes a script, generates voiceover and images, animates clips, assembles the video, and uploads to YouTube. Humans stay in the loop at key review gates.

```
topic → research → script ✋ → voice + footage ✋ → motion → video + thumbnail ✋ → upload
```

✋ = optional human review gate

## Stack

- **Frontend/API** — Next.js 15, TypeScript, Tailwind CSS 4, Prisma 7, Neon PostgreSQL
- **Worker** — Python 3, runs on any machine (Raspberry Pi, VPS, Mac Mini)
- **AI** — Claude (research, scripting, smart fix), DALL-E 3 / Stability AI (images), ElevenLabs (voice), Runway Gen-4 (motion)
- **Storage** — Cloudflare R2
- **Distribution** — YouTube Data API v3

## How it works

1. You describe a video in plain English. Claude routes it to the pipeline and builds the brief.
2. The Python worker picks up the task and drives it through each skill — research, script, voice, footage, motion, video assembly, thumbnail, upload.
3. At each review gate the pipeline pauses for your approval. You can edit the script, swap image prompts, or request a revision before continuing.
4. Approved? The worker resumes and the video goes to YouTube.

All channel secrets (API keys, YouTube tokens, R2 credentials) live encrypted in the database — managed through the UI, never in config files.

## Prerequisites

- Node.js 18+, npm
- Python 3.11+
- PostgreSQL database ([Neon](https://neon.tech) free tier works)
- Cloudflare R2 bucket
- API keys: Anthropic, ElevenLabs, OpenAI or Stability AI, Runway (optional), YouTube OAuth credentials

## Quick start

### 1. Database

```bash
# Apply the initial migration
npx prisma db execute --file prisma/migrations/0001_init/migration.sql --schema prisma/schema.prisma
npx prisma migrate resolve --applied 0001_init
npx prisma generate
```

### 2. Next.js app

```bash
cp .env.local.example .env.local
# Fill in DATABASE_URL, DIRECT_URL, JWT_SECRET, CONFIG_ENCRYPTION_KEY,
# ANTHROPIC_API_KEY, INTERNAL_API_KEY, NEXT_PUBLIC_APP_URL

npm install
npm run dev
```

### 3. Worker

```bash
cd worker
pip install -r requirements.txt
cp .env.worker.example .env.worker
# Fill in APP_URL, INTERNAL_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY

python seed_skills.py   # register skills in the database
python worker.py        # start the worker
```

### 4. First channel

1. Sign in at `http://localhost:3000`
2. Create a channel (super admin → any name and slug)
3. Go to **Settings** and add your R2, ElevenLabs, YouTube, and image gen credentials
4. Go to **Objectives** and describe the editorial tone and style for your channel
5. Type a video topic in the task bar and hit **Create**

## Configuration

### Generating a CONFIG_ENCRYPTION_KEY

```bash
openssl rand -base64 32
```

### Worker concurrency

Set `WORKER_CONCURRENCY=8` in `.env.worker`. The pipeline orchestrator blocks its thread while waiting for sub-tasks — if concurrency is too low you'll get deadlocks.

### Adding a skill

Create `worker/skills/my_skill.py` with a `SKILL_DEFINITION` dict and a `run_task` function, then add one line to `worker/dispatch.py`. Run `python seed_skills.py` to register it.

## Project structure

```
src/
  app/
    api/          API routes (auth, channels, tasks, footage, videos, users)
    editor/       Channel UI (kanban, task detail, review gates, footage, settings)
  lib/            Auth, config encryption, Prisma client, NLP task router
worker/
  worker.py       Polling loop
  dispatch.py     Skill dispatch table
  seed_skills.py  Upsert skill definitions
  skills/         Individual skill runners
prisma/
  schema.prisma
  migrations/
```

## Contributing

Issues and pull requests welcome. Please open an issue before starting significant work so we can discuss approach.

## Support

Built and maintained by [Yadkin Labs](mailto:opensource@yadkinlabs.com). If you need help deploying this, adapting it to your workflow, or building agentic systems for your business — reach out.

## License

MIT — see [LICENSE](LICENSE).
