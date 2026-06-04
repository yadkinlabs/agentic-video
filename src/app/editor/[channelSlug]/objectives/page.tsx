"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

interface Channel { id: number; slug: string }
interface Objective { id: number; content: string; created_at: string }

export default function ObjectivesPage() {
  const { channelSlug } = useParams<{ channelSlug: string }>();
  const { token } = useAuth();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const authHeader = token ? `Bearer ${token}` : "";

  useEffect(() => {
    if (!token) return;
    fetch("/api/channels", { headers: { Authorization: authHeader } })
      .then((r) => r.json())
      .then((data: Channel[]) => setChannel(data.find((c) => c.slug === channelSlug) ?? null));
  }, [token, channelSlug]);

  useEffect(() => {
    if (!channel) return;
    fetch(`/api/channels/${channel.id}/objectives`, { headers: { Authorization: authHeader } })
      .then((r) => r.json())
      .then(setObjectives);
  }, [channel]);

  async function addObjective(e: React.FormEvent) {
    e.preventDefault();
    if (!channel || !draft.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/channels/${channel.id}/objectives`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ content: draft }),
    });
    if (res.ok) {
      const obj = await res.json();
      setObjectives((prev) => [...prev, obj]);
      setDraft("");
    }
    setSaving(false);
  }

  async function deleteObjective(id: number) {
    if (!channel) return;
    await fetch(`/api/channels/${channel.id}/objectives?objectiveId=${id}`, {
      method: "DELETE",
      headers: { Authorization: authHeader },
    });
    setObjectives((prev) => prev.filter((o) => o.id !== id));
  }

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <h1 className="text-lg font-semibold text-slate-100">Objectives</h1>
      <p className="text-xs text-slate-500">
        Editorial guidance injected into every skill prompt. Describe tone, style, CTA, what to avoid, etc.
      </p>

      <form onSubmit={addObjective} className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Always end with a call to action. Keep scripts under 60 seconds. Use a warm, conversational tone."
          rows={3}
          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-slate-500 resize-none"
        />
        <button
          type="submit"
          disabled={saving || !draft.trim()}
          className="px-4 py-1.5 text-xs rounded border border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add objective"}
        </button>
      </form>

      <div className="space-y-2">
        {objectives.map((obj) => (
          <div key={obj.id} className="flex gap-3 bg-slate-900 border border-slate-800 rounded-lg p-3">
            <p className="flex-1 text-sm text-slate-300 leading-relaxed">{obj.content}</p>
            <button
              onClick={() => deleteObjective(obj.id)}
              className="text-xs text-slate-600 hover:text-red-400 shrink-0"
            >
              Remove
            </button>
          </div>
        ))}
        {objectives.length === 0 && (
          <p className="text-xs text-slate-600">No objectives yet.</p>
        )}
      </div>
    </div>
  );
}
