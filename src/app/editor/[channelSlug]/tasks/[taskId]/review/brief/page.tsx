"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

interface Task {
  id: string;
  title: string;
  status: string;
  current_step: string | null;
  brief: Record<string, unknown> | null;
  artifacts: Record<string, unknown> | null;
}

export default function BriefReviewPage() {
  const { channelSlug, taskId } = useParams<{ channelSlug: string; taskId: string }>();
  const { token } = useAuth();
  const router = useRouter();

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [topic, setTopic] = useState("");
  const [layout, setLayout] = useState("long");
  const [wordCount, setWordCount] = useState(650);

  const authHeader = token ? `Bearer ${token}` : "";

  const fetchTask = useCallback(async () => {
    const res = await fetch(`/api/tasks/${taskId}`, { headers: { Authorization: authHeader } });
    if (res.ok) {
      const t: Task = await res.json();
      setTask(t);
      const brief = { ...(t.brief ?? {}), ...(t.artifacts ?? {}) };
      setTopic(String(brief.topic ?? ""));
      setLayout(String(brief.layout ?? "long"));
      setWordCount(Number(brief.word_count ?? 650));
    }
    setLoading(false);
  }, [taskId, authHeader]);

  useEffect(() => { fetchTask(); }, [fetchTask]);

  const isPending = task?.status === "PENDING_APPROVAL" && task?.current_step === "review_brief";

  async function doApprove() {
    setActionLoading(true);
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "approve",
        artifacts_patch: { topic, layout, word_count: wordCount },
      }),
    });
    router.push(`/editor/${channelSlug}/tasks/${taskId}`);
  }

  async function doCancel() {
    setActionLoading(true);
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    router.push(`/editor/${channelSlug}`);
  }

  if (loading) return <div className="p-8 text-slate-400 text-sm">Loading…</div>;
  if (!task) return <div className="p-8 text-red-400 text-sm">Task not found.</div>;

  const durationSec = Math.round(wordCount / (130 / 60));
  const durationLabel = `~${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, "0")} at 130 wpm`;

  return (
    <div className="max-w-xl mx-auto p-8 space-y-6">
      <a href={`/editor/${channelSlug}/tasks/${taskId}`} className="text-xs text-slate-500 hover:text-slate-300">← Back</a>

      <div>
        <h1 className="text-lg font-semibold text-slate-100">{task.title}</h1>
        <p className="text-xs text-slate-500 mt-0.5">Brief Review</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Topic</label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={!isPending}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 focus:outline-none focus:border-slate-500 disabled:opacity-60"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Format</label>
          <select
            value={layout}
            onChange={(e) => setLayout(e.target.value)}
            disabled={!isPending}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 focus:outline-none disabled:opacity-60"
          >
            <option value="long">Long-form (landscape)</option>
            <option value="short">Short (portrait)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Target word count</label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={wordCount}
              onChange={(e) => setWordCount(Number(e.target.value))}
              disabled={!isPending}
              min={50}
              max={2000}
              step={10}
              className="w-28 px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 focus:outline-none disabled:opacity-60"
            />
            <span className="text-xs text-slate-600">{durationLabel}</span>
          </div>
        </div>
      </div>

      {isPending && (
        <div className="flex gap-3">
          <button
            onClick={doApprove}
            disabled={actionLoading || !topic.trim()}
            className="px-5 py-2 text-sm rounded border border-green-700 text-green-400 hover:bg-green-900/30 disabled:opacity-50"
          >
            Approve — start production
          </button>
          <button
            onClick={doCancel}
            disabled={actionLoading}
            className="px-4 py-2 text-sm rounded border border-slate-700 text-slate-400 hover:bg-slate-800 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}

      {!isPending && (
        <p className="text-xs text-slate-500">Brief approved — pipeline running.</p>
      )}
    </div>
  );
}
