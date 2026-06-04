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
  created_at: string;
}

interface Channel { id: number; slug: string; name: string }

const STATUSES = ["APPROVED", "RUNNING", "PENDING_APPROVAL", "COMPLETE", "FAILED"] as const;
const STATUS_LABEL: Record<string, string> = {
  APPROVED: "Queued",
  RUNNING: "Running",
  PENDING_APPROVAL: "Review",
  COMPLETE: "Done",
  FAILED: "Failed",
};
const STATUS_COLOR: Record<string, string> = {
  APPROVED: "text-blue-400",
  RUNNING: "text-yellow-400",
  PENDING_APPROVAL: "text-orange-400",
  COMPLETE: "text-green-400",
  FAILED: "text-red-400",
};

export default function TaskKanbanPage() {
  const { channelSlug } = useParams<{ channelSlug: string }>();
  const { token } = useAuth();
  const router = useRouter();

  const [channel, setChannel] = useState<Channel | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<string>("active");

  const authHeader = token ? `Bearer ${token}` : "";

  useEffect(() => {
    if (!token) return;
    fetch("/api/channels", { headers: { Authorization: authHeader } })
      .then((r) => r.json())
      .then((data: Channel[]) => setChannel(data.find((c) => c.slug === channelSlug) ?? null));
  }, [token, channelSlug]);

  const fetchTasks = useCallback(async () => {
    if (!channel) return;
    const res = await fetch(`/api/tasks?channel_id=${channel.id}&limit=100`, {
      headers: { Authorization: authHeader },
    });
    if (res.ok) setTasks(await res.json());
  }, [channel, authHeader]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Poll while active tasks exist
  useEffect(() => {
    const active = tasks.some((t) => ["APPROVED", "RUNNING"].includes(t.status));
    if (!active) return;
    const interval = setInterval(fetchTasks, 8000);
    return () => clearInterval(interval);
  }, [tasks, fetchTasks]);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || !channel) return;
    setCreating(true);
    await fetch("/api/tasks", {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ channel_id: channel.id, prompt }),
    });
    setPrompt("");
    setCreating(false);
    fetchTasks();
  }

  const visibleStatuses = filter === "active"
    ? ["APPROVED", "RUNNING", "PENDING_APPROVAL"]
    : ["COMPLETE", "FAILED", "CANCELLED"];

  const grouped = visibleStatuses.map((status) => ({
    status,
    tasks: tasks.filter((t) => t.status === status),
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">{channel?.name ?? "…"}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter("active")}
            className={`px-3 py-1 text-xs rounded border ${filter === "active" ? "border-slate-500 text-slate-200" : "border-slate-700 text-slate-500"}`}
          >
            Active
          </button>
          <button
            onClick={() => setFilter("done")}
            className={`px-3 py-1 text-xs rounded border ${filter === "done" ? "border-slate-500 text-slate-200" : "border-slate-700 text-slate-500"}`}
          >
            Done
          </button>
        </div>
      </div>

      {/* Task creation */}
      <form onSubmit={createTask} className="flex gap-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe a video to produce…"
          className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-slate-500"
        />
        <button
          type="submit"
          disabled={creating || !prompt.trim()}
          className="px-4 py-2 text-sm rounded border border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create"}
        </button>
      </form>

      {/* Kanban columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {grouped.map(({ status, tasks: col }) => (
          <div key={status} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium uppercase tracking-wide ${STATUS_COLOR[status] ?? "text-slate-400"}`}>
                {STATUS_LABEL[status] ?? status}
              </span>
              <span className="text-xs text-slate-600">{col.length}</span>
            </div>
            {col.map((task) => (
              <div
                key={task.id}
                onClick={() => router.push(`/editor/${channelSlug}/tasks/${task.id}`)}
                className="bg-slate-900 border border-slate-800 rounded-lg p-3 cursor-pointer hover:border-slate-700 space-y-1"
              >
                <p className="text-sm text-slate-200 leading-snug">{task.title}</p>
                {task.current_step && (
                  <p className="text-xs text-slate-500">{task.current_step}</p>
                )}
                {task.status === "PENDING_APPROVAL" && (
                  <p className="text-xs text-orange-400">Needs review</p>
                )}
              </div>
            ))}
            {col.length === 0 && (
              <p className="text-xs text-slate-700 px-1">Empty</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
