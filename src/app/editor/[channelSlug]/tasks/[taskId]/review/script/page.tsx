"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

interface Task {
  id: string;
  title: string;
  status: string;
  current_step: string | null;
  artifacts: Record<string, unknown> | null;
}

// Extract [image N: description] tags from script text
function parseImageCues(text: string): { index: number; description: string }[] {
  const cues: { index: number; description: string }[] = [];
  const re = /\[image\s+(\d+):\s*([^\]]+)\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    cues.push({ index: Number(m[1]), description: m[2].trim() });
  }
  return cues;
}

function stripImageCues(text: string) {
  return text.replace(/\[image\s+\d+:[^\]]+\]/gi, "").replace(/\n{3,}/g, "\n\n").trim();
}

export default function ScriptReviewPage() {
  const { channelSlug, taskId } = useParams<{ channelSlug: string; taskId: string }>();
  const { token } = useAuth();
  const router = useRouter();

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [editedScript, setEditedScript] = useState("");
  const [editedCues, setEditedCues] = useState<{ index: number; description: string }[]>([]);
  const [showRevision, setShowRevision] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");

  const authHeader = token ? `Bearer ${token}` : "";

  const fetchTask = useCallback(async () => {
    const res = await fetch(`/api/tasks/${taskId}`, { headers: { Authorization: authHeader } });
    if (res.ok) setTask(await res.json());
    setLoading(false);
  }, [taskId, authHeader]);

  useEffect(() => { fetchTask(); }, [fetchTask]);

  useEffect(() => {
    if (!task) return;
    const raw = typeof task.artifacts?.script_text === "string" ? task.artifacts.script_text : "";
    setEditedScript(stripImageCues(raw));
    setEditedCues(parseImageCues(raw));
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reassemble script with updated cues
  function buildFinalScript() {
    let result = editedScript;
    // Re-inject cues after the last sentence they belong to (best-effort: append at end)
    const cueText = editedCues.map((c) => `[image ${c.index}: ${c.description}]`).join("\n");
    return cueText ? `${result}\n\n${cueText}` : result;
  }

  const isPending = task?.status === "PENDING_APPROVAL" && task?.current_step === "review_script";
  const wordCount = task?.artifacts?.word_count as number | undefined;

  async function doApprove() {
    setActionLoading(true);
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "approve",
        artifacts_patch: { script_text: buildFinalScript() },
      }),
    });
    router.push(`/editor/${channelSlug}/tasks/${taskId}`);
  }

  async function doRevision() {
    if (!revisionNote.trim()) return;
    setActionLoading(true);
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request_revision", revision_notes: revisionNote }),
    });
    router.push(`/editor/${channelSlug}/tasks/${taskId}`);
  }

  if (loading) return <div className="p-8 text-slate-400 text-sm">Loading…</div>;
  if (!task) return <div className="p-8 text-red-400 text-sm">Task not found.</div>;

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <a href={`/editor/${channelSlug}/tasks/${taskId}`} className="text-xs text-slate-500 hover:text-slate-300">← Back</a>

      <div>
        <h1 className="text-lg font-semibold text-slate-100">{task.title}</h1>
        <p className="text-xs text-slate-500 mt-0.5">Script Review</p>
      </div>

      {/* Script */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Script</span>
          {wordCount && <span className="text-xs text-slate-600">{wordCount} words</span>}
        </div>
        {isPending ? (
          <textarea
            value={editedScript}
            onChange={(e) => setEditedScript(e.target.value)}
            rows={20}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-slate-200 leading-relaxed focus:outline-none focus:border-slate-400 resize-y font-mono"
          />
        ) : (
          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{editedScript}</p>
        )}
      </div>

      {/* Image cues */}
      {editedCues.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Image Cues</span>
          {editedCues.map((cue, i) => (
            <div key={cue.index} className="flex gap-2 items-start">
              <span className="text-xs text-slate-600 w-16 shrink-0 pt-1.5">#{cue.index}</span>
              {isPending ? (
                <textarea
                  value={cue.description}
                  onChange={(e) => {
                    const updated = [...editedCues];
                    updated[i] = { ...cue, description: e.target.value };
                    setEditedCues(updated);
                  }}
                  rows={2}
                  className="flex-1 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-300 focus:outline-none focus:border-slate-500 resize-none"
                />
              ) : (
                <p className="text-xs text-slate-400">{cue.description}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {isPending && (
        <div className="space-y-3">
          <div className="flex gap-3">
            <button
              onClick={doApprove}
              disabled={actionLoading}
              className="px-5 py-2 text-sm rounded border border-green-700 text-green-400 hover:bg-green-900/30 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              onClick={() => setShowRevision(true)}
              disabled={actionLoading}
              className="px-4 py-2 text-sm rounded border border-orange-800 text-orange-400 hover:bg-orange-900/20 disabled:opacity-50"
            >
              Request revision
            </button>
          </div>
          {showRevision && (
            <div className="space-y-2">
              <textarea
                value={revisionNote}
                onChange={(e) => setRevisionNote(e.target.value)}
                placeholder="What needs to change?"
                rows={3}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-600 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={doRevision}
                  disabled={actionLoading || !revisionNote.trim()}
                  className="px-4 py-1.5 text-xs rounded border border-orange-700 text-orange-400 hover:bg-orange-900/30 disabled:opacity-50"
                >
                  Send revision
                </button>
                <button
                  onClick={() => setShowRevision(false)}
                  className="px-4 py-1.5 text-xs rounded border border-slate-600 text-slate-400 hover:bg-slate-700/40"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
