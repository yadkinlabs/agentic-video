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

interface FootageItem { id: number; r2_key: string; prompt: string | null }

export default function FootageReviewPage() {
  const { channelSlug, taskId } = useParams<{ channelSlug: string; taskId: string }>();
  const { token } = useAuth();
  const router = useRouter();

  const [task, setTask] = useState<Task | null>(null);
  const [footage, setFootage] = useState<FootageItem[]>([]);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const authHeader = token ? `Bearer ${token}` : "";

  const fetchTask = useCallback(async () => {
    const res = await fetch(`/api/tasks/${taskId}`, { headers: { Authorization: authHeader } });
    if (res.ok) setTask(await res.json());
    setLoading(false);
  }, [taskId, authHeader]);

  const fetchFootage = useCallback(async (channelId: number) => {
    const res = await fetch(`/api/footage?channel_id=${channelId}&task_id=${taskId}`, {
      headers: { Authorization: authHeader },
    });
    if (res.ok) {
      const items: FootageItem[] = await res.json();
      setFootage(items);
      // Presign all keys
      const urlMap: Record<number, string> = {};
      await Promise.all(
        items.map(async (item) => {
          const r = await fetch(
            `/api/channels/${channelId}/media/presign?key=${encodeURIComponent(item.r2_key)}`,
            { headers: { Authorization: authHeader } }
          );
          if (r.ok) urlMap[item.id] = (await r.json()).url;
        })
      );
      setUrls(urlMap);
    }
  }, [taskId, authHeader]);

  useEffect(() => { fetchTask(); }, [fetchTask]);
  useEffect(() => { if (task) fetchFootage(task.channel_id); }, [task?.channel_id, fetchFootage]);

  const isPending = task?.status === "PENDING_APPROVAL" && task?.current_step === "review_footage";

  async function doApprove() {
    setActionLoading(true);
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    router.push(`/editor/${channelSlug}/tasks/${taskId}`);
  }

  async function doRevision(note: string) {
    setActionLoading(true);
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request_revision", revision_notes: note }),
    });
    router.push(`/editor/${channelSlug}/tasks/${taskId}`);
  }

  async function regenerateImage() {
    if (!editingId || !task) return;
    setEditLoading(true);
    // Ask worker to regenerate by patching artifacts with new prompt override
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "patch_artifacts",
        artifacts_patch: { [`image_override_${editingId}`]: editPrompt },
      }),
    });
    setEditLoading(false);
    setEditingId(null);
    fetchFootage(task.channel_id);
  }

  if (loading) return <div className="p-8 text-slate-400 text-sm">Loading…</div>;
  if (!task) return <div className="p-8 text-red-400 text-sm">Task not found.</div>;

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-6">
      {editLoading && (
        <div className="fixed inset-0 bg-slate-950/90 flex items-center justify-center z-50">
          <div className="text-center space-y-3">
            <div className="w-6 h-6 border-2 border-slate-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-slate-300">Regenerating image…</p>
            <p className="text-xs text-slate-600">Do not close this page.</p>
          </div>
        </div>
      )}

      <a href={`/editor/${channelSlug}/tasks/${taskId}`} className="text-xs text-slate-500 hover:text-slate-300">← Back</a>

      <div>
        <h1 className="text-lg font-semibold text-slate-100">{task.title}</h1>
        <p className="text-xs text-slate-500 mt-0.5">Footage Review</p>
      </div>

      {/* Footage grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {footage.map((item) => (
          <div key={item.id} className="space-y-1">
            {urls[item.id] ? (
              <img
                src={urls[item.id]}
                alt={item.prompt ?? "footage"}
                className="w-full rounded border border-slate-800 object-cover aspect-video"
              />
            ) : (
              <div className="w-full aspect-video bg-slate-900 rounded border border-slate-800 flex items-center justify-center">
                <span className="text-xs text-slate-700">Loading…</span>
              </div>
            )}
            {item.prompt && (
              <p className="text-xs text-slate-600 line-clamp-2">{item.prompt}</p>
            )}
            {isPending && (
              <button
                onClick={() => { setEditingId(item.id); setEditPrompt(item.prompt ?? ""); }}
                className="text-xs text-slate-500 hover:text-slate-300"
              >
                Edit prompt
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Edit modal */}
      {editingId !== null && !editLoading && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-40">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-sm font-medium text-slate-200">Edit image prompt</h2>
            <textarea
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-slate-200 focus:outline-none resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={regenerateImage}
                className="px-4 py-1.5 text-xs rounded border border-blue-700 text-blue-400 hover:bg-blue-900/20"
              >
                Regenerate
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="px-4 py-1.5 text-xs rounded border border-slate-600 text-slate-400 hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      {isPending && (
        <div className="flex gap-3">
          <button
            onClick={doApprove}
            disabled={actionLoading}
            className="px-5 py-2 text-sm rounded border border-green-700 text-green-400 hover:bg-green-900/30 disabled:opacity-50"
          >
            Approve footage
          </button>
          <button
            onClick={() => doRevision("Regenerate footage")}
            disabled={actionLoading}
            className="px-4 py-2 text-sm rounded border border-orange-800 text-orange-400 hover:bg-orange-900/20 disabled:opacity-50"
          >
            Regenerate all
          </button>
        </div>
      )}
    </div>
  );
}
