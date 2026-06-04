"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

interface Task {
  id: string;
  title: string;
  status: string;
  current_step: string | null;
  skill: string;
  brief: Record<string, unknown> | null;
  artifacts: Record<string, unknown> | null;
  revision_notes: string | null;
  created_at: string;
}

interface Log { id: number; level: string; message: string; created_at: string }

const REVIEW_STEPS: Record<string, string> = {
  review_brief: "review/brief",
  review_script: "review/script",
  review_footage: "review/footage",
  review_final: "review/final",
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "text-slate-400",
  APPROVED: "text-blue-400",
  RUNNING: "text-yellow-400",
  PENDING_APPROVAL: "text-orange-400",
  COMPLETE: "text-green-400",
  FAILED: "text-red-400",
  CANCELLED: "text-slate-600",
};

export default function TaskDetailPage() {
  const { channelSlug, taskId } = useParams<{ channelSlug: string; taskId: string }>();
  const { token } = useAuth();
  const router = useRouter();

  const [task, setTask] = useState<Task | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showSmartFix, setShowSmartFix] = useState(false);
  const [smartFixNotes, setSmartFixNotes] = useState("");

  const authHeader = token ? `Bearer ${token}` : "";

  const fetchTask = useCallback(async () => {
    const [taskRes, logsRes] = await Promise.all([
      fetch(`/api/tasks/${taskId}`, { headers: { Authorization: authHeader } }),
      fetch(`/api/tasks/${taskId}/logs`, { headers: { Authorization: authHeader } }),
    ]);
    if (taskRes.ok) setTask(await taskRes.json());
    if (logsRes.ok) setLogs(await logsRes.json());
    setLoading(false);
  }, [taskId, authHeader]);

  useEffect(() => { fetchTask(); }, [fetchTask]);

  // Poll while running
  useEffect(() => {
    if (!task || !["APPROVED", "RUNNING"].includes(task.status)) return;
    const interval = setInterval(fetchTask, 5000);
    return () => clearInterval(interval);
  }, [task?.status, fetchTask]);

  async function doAction(action: string) {
    setActionLoading(true);
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setActionLoading(false);
    fetchTask();
  }

  if (loading) return <div className="p-8 text-slate-400 text-sm">Loading…</div>;
  if (!task) return <div className="p-8 text-red-400 text-sm">Task not found.</div>;

  const reviewPath = task.current_step ? REVIEW_STEPS[task.current_step] : null;
  const isPendingReview = task.status === "PENDING_APPROVAL" && reviewPath;

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <div>
        <a href={`/editor/${channelSlug}`} className="text-xs text-slate-500 hover:text-slate-300">← Tasks</a>
      </div>

      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-slate-100">{task.title}</h1>
        <div className="flex items-center gap-3 text-xs">
          <span className={STATUS_COLOR[task.status] ?? "text-slate-400"}>{task.status}</span>
          {task.current_step && <span className="text-slate-600">{task.current_step}</span>}
          <span className="text-slate-700">{task.skill}</span>
        </div>
      </div>

      {/* Review banner */}
      {isPendingReview && (
        <div className="bg-orange-950/40 border border-orange-800 rounded-lg p-4 flex items-center justify-between">
          <p className="text-sm text-orange-300">Needs your review: {task.current_step}</p>
          <button
            onClick={() => router.push(`/editor/${channelSlug}/tasks/${taskId}/${reviewPath}`)}
            className="px-4 py-1.5 text-xs rounded border border-orange-700 text-orange-300 hover:bg-orange-900/30"
          >
            Review →
          </button>
        </div>
      )}

      {/* Brief */}
      {task.brief && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wide">Brief</h2>
          <pre className="bg-slate-900 border border-slate-800 rounded p-3 text-xs text-slate-400 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(task.brief, null, 2)}
          </pre>
        </section>
      )}

      {/* Key artifacts */}
      {task.artifacts && Object.keys(task.artifacts).length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wide">Artifacts</h2>
          <div className="bg-slate-900 border border-slate-800 rounded p-3 space-y-1">
            {Object.entries(task.artifacts).map(([k, v]) => (
              <div key={k} className="flex gap-2 text-xs">
                <span className="text-slate-600 w-32 shrink-0">{k}</span>
                <span className="text-slate-400 break-all">
                  {typeof v === "string" && v.length > 120 ? v.slice(0, 120) + "…" : String(v)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Actions */}
      <section className="flex flex-wrap gap-2">
        {task.status === "PENDING_APPROVAL" && !reviewPath && (
          <button
            onClick={() => doAction("approve")}
            disabled={actionLoading}
            className="px-4 py-1.5 text-xs rounded border border-green-700 text-green-400 hover:bg-green-900/30 disabled:opacity-50"
          >
            Approve
          </button>
        )}
        {["APPROVED", "RUNNING"].includes(task.status) && (
          <button
            onClick={() => doAction("cancel")}
            disabled={actionLoading}
            className="px-4 py-1.5 text-xs rounded border border-slate-700 text-slate-400 hover:bg-slate-800 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        {task.status === "FAILED" && (
          <>
            <button
              onClick={() => doAction("request_revision")}
              disabled={actionLoading}
              className="px-4 py-1.5 text-xs rounded border border-slate-700 text-slate-400 hover:bg-slate-800 disabled:opacity-50"
            >
              Retry
            </button>
            <button
              onClick={() => setShowSmartFix(true)}
              disabled={actionLoading}
              className="px-4 py-1.5 text-xs rounded border border-blue-800 text-blue-400 hover:bg-blue-900/20 disabled:opacity-50"
            >
              Smart Fix
            </button>
          </>
        )}
        {showSmartFix && (
          <div className="w-full space-y-2 mt-1">
            <textarea
              value={smartFixNotes}
              onChange={(e) => setSmartFixNotes(e.target.value)}
              placeholder="Optional: describe what went wrong or what to change"
              rows={2}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 placeholder-slate-600 focus:outline-none resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setActionLoading(true);
                  await fetch(`/api/tasks/${taskId}/smart-fix`, {
                    method: "POST",
                    headers: { Authorization: authHeader, "Content-Type": "application/json" },
                    body: JSON.stringify({ notes: smartFixNotes }),
                  });
                  setShowSmartFix(false);
                  setActionLoading(false);
                  fetchTask();
                }}
                disabled={actionLoading}
                className="px-4 py-1.5 text-xs rounded border border-blue-700 text-blue-400 hover:bg-blue-900/20 disabled:opacity-50"
              >
                {actionLoading ? "Running…" : "Run Smart Fix"}
              </button>
              <button
                onClick={() => setShowSmartFix(false)}
                className="px-4 py-1.5 text-xs rounded border border-slate-600 text-slate-400 hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Logs */}
      {logs.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wide">Log</h2>
          <div className="space-y-1">
            {logs.map((log) => (
              <div key={log.id} className="flex gap-3 text-xs">
                <span className="text-slate-700 shrink-0 tabular-nums">
                  {new Date(log.created_at).toLocaleTimeString()}
                </span>
                <span className={log.level === "error" ? "text-red-400" : "text-slate-400"}>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
