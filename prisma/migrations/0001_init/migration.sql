-- agentic-video initial schema

CREATE TYPE "SystemRole" AS ENUM ('super_admin', 'user');
CREATE TYPE "DefaultFormat" AS ENUM ('long', 'short');
CREATE TYPE "ChannelRole" AS ENUM ('viewer', 'editor', 'approver', 'admin');
CREATE TYPE "TaskStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'RUNNING', 'COMPLETE', 'FAILED', 'CANCELLED');

-- Users
CREATE TABLE "User" (
  "id"            SERIAL PRIMARY KEY,
  "email"         TEXT NOT NULL UNIQUE,
  "password_hash" TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "role"          "SystemRole" NOT NULL DEFAULT 'user',
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Channels
CREATE TABLE "Channel" (
  "id"               SERIAL PRIMARY KEY,
  "name"             TEXT NOT NULL,
  "slug"             TEXT NOT NULL UNIQUE,
  "default_format"   "DefaultFormat" NOT NULL DEFAULT 'long',
  "captions_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Channel membership
CREATE TABLE "ChannelMember" (
  "id"         SERIAL PRIMARY KEY,
  "channel_id" INTEGER NOT NULL REFERENCES "Channel"("id") ON DELETE CASCADE,
  "user_id"    INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "role"       "ChannelRole" NOT NULL DEFAULT 'viewer',
  UNIQUE ("channel_id", "user_id")
);

-- Objectives
CREATE TABLE "Objective" (
  "id"         SERIAL PRIMARY KEY,
  "channel_id" INTEGER NOT NULL REFERENCES "Channel"("id") ON DELETE CASCADE,
  "content"    TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Service config (encrypted secrets)
CREATE TABLE "ServiceConfig" (
  "id"              SERIAL PRIMARY KEY,
  "channel_id"      INTEGER NOT NULL REFERENCES "Channel"("id") ON DELETE CASCADE,
  "key"             TEXT NOT NULL,
  "encrypted_value" TEXT NOT NULL,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("channel_id", "key")
);

-- Skills (seeded metadata)
CREATE TABLE "Skill" (
  "id"         TEXT PRIMARY KEY,
  "label"      TEXT NOT NULL,
  "definition" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tasks
CREATE TABLE "Task" (
  "id"             TEXT PRIMARY KEY,
  "channel_id"     INTEGER NOT NULL REFERENCES "Channel"("id") ON DELETE CASCADE,
  "parent_task_id" TEXT REFERENCES "Task"("id"),
  "title"          TEXT NOT NULL,
  "skill"          TEXT NOT NULL,
  "status"         "TaskStatus" NOT NULL DEFAULT 'DRAFT',
  "current_step"   TEXT,
  "brief"          JSONB,
  "artifacts"      JSONB,
  "revision_notes" TEXT,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "claimed_at"     TIMESTAMPTZ,
  "completed_at"   TIMESTAMPTZ
);

CREATE INDEX "Task_channel_id_status_idx" ON "Task"("channel_id", "status");
CREATE INDEX "Task_parent_task_id_idx" ON "Task"("parent_task_id");

-- Task logs
CREATE TABLE "TaskLog" (
  "id"         SERIAL PRIMARY KEY,
  "task_id"    TEXT NOT NULL REFERENCES "Task"("id") ON DELETE CASCADE,
  "level"      TEXT NOT NULL DEFAULT 'info',
  "message"    TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "TaskLog_task_id_idx" ON "TaskLog"("task_id");

-- Footage items
CREATE TABLE "FootageItem" (
  "id"         SERIAL PRIMARY KEY,
  "channel_id" INTEGER NOT NULL REFERENCES "Channel"("id") ON DELETE CASCADE,
  "task_id"    TEXT REFERENCES "Task"("id") ON DELETE SET NULL,
  "r2_key"     TEXT NOT NULL,
  "prompt"     TEXT,
  "width"      INTEGER,
  "height"     INTEGER,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "FootageItem_channel_id_idx" ON "FootageItem"("channel_id");

-- Videos
CREATE TABLE "Video" (
  "id"               SERIAL PRIMARY KEY,
  "channel_id"       INTEGER NOT NULL REFERENCES "Channel"("id") ON DELETE CASCADE,
  "task_id"          TEXT UNIQUE REFERENCES "Task"("id") ON DELETE SET NULL,
  "title"            TEXT NOT NULL,
  "youtube_video_id" TEXT,
  "r2_thumbnail_key" TEXT,
  "published_at"     TIMESTAMPTZ,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "Video_channel_id_idx" ON "Video"("channel_id");

-- Token usage
CREATE TABLE "TokenUsage" (
  "id"            SERIAL PRIMARY KEY,
  "task_id"       TEXT REFERENCES "Task"("id") ON DELETE SET NULL,
  "channel_id"    INTEGER REFERENCES "Channel"("id") ON DELETE SET NULL,
  "user_id"       INTEGER REFERENCES "User"("id") ON DELETE SET NULL,
  "skill"         TEXT,
  "model"         TEXT NOT NULL,
  "provider"      TEXT NOT NULL,
  "input_tokens"  INTEGER NOT NULL,
  "output_tokens" INTEGER NOT NULL,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "TokenUsage_channel_id_idx" ON "TokenUsage"("channel_id");
CREATE INDEX "TokenUsage_task_id_idx" ON "TokenUsage"("task_id");
