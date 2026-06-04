"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

interface Task {
  id: string;
  title: string;
  channel_id: number;
  status: string;
  current_step: string | null;
  artifacts: Record<string, unknown> | null;
}

export default function FinalReviewPage() {
  const { channelSlug, taskId } = useParams<{ channelSlug: string; taskId: string }>();
  const { token } = useAuth();
  const router = useRouter();

  const [task, setTask] = useState<Task | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showRevision, setShowRevision] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");

  const authHeader = token ? `Bearer ${token}` : "";

  const fetchTask = useCallback(async () => {
    const res = await fetch(`/api/tasks/${taskId}`, { headers: { Authorization: authHeader } });
    if (res.ok) {
      const t: Task = await res.json();
      setTask(t);

      // Presign video and thumbnail
      if (t.artifacts?.video_r2_key) {
        const r = await fetch(
          `/api/channels/${t.channel_id}/media/presign?key=${encodeURIComponent(String(t.artifacts.video_r2_key))}`,
          { headers: { Authorization: authHeader } }
        );
        if (r.ok) setVideoUrl((await r.json()).url);
      }
      if (t.artifacts?.thumbnail_r2_key) {
        const r = await fetch(
          `/api/channels/${t.channel_id}/media/presign?key=${encodeURIComponent(String(t.artifacts.thumbnail_r2_key))}`,
          { headers: { Authorization: authHeader } }
        );
        if (r.ok) setThumbnailUrl((await r.json()).url);
      }
    }
    setLoading(false);
  }, [taskId, authHeader]);

  useEffect(() => { fetchTask(); }, [fetchTask]);

  const isPending = task?.status === "PENDING_APPROVAL" && task?.current_step === "review_final";

  async function doApprove() {
    setActionLoading(true);
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
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
        <p className="text-xs text-slate-500 mt-0.5">Final Review — approve to upload</p>
      </div>

      {/* Video */}
      {videoUrl ? (
        <div className="space-y-2">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Video</span>
          <video
            src={videoUrl}
            controls
            className="w-full rounded-lg border border-slate-800"
          />
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center text-xs text-slate-600">
          Video not yet available
        </div>
      )}

      {/* Thumbnail */}
      {thumbnailUrl && (
        <div className="space-y-2">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Thumbnail</span>
          <img src={thumbnailUrl} alt="thumbnail" className="w-64 rounded border border-slate-800" />
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
              Approve — upload to YouTube
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
                  className="px-4 py-1.5 text-xs rounded border border-slate-600 text-slate-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!isPending && (
        <p className="text-xs text-slate-500">
          {task.status === "COMPLETE" ? "Uploaded." : `Status: ${task.status}`}
        </p>
      )}
    </div>
  );
}
