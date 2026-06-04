"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

interface Channel { id: number; slug: string }
interface Member {
  id: number;
  role: string;
  user: { id: number; email: string; name: string };
}
interface User { id: number; email: string; name: string }

const ROLES = ["viewer", "editor", "approver", "admin"];

export default function UsersPage() {
  const { channelSlug } = useParams<{ channelSlug: string }>();
  const { token, user: me } = useAuth();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState("editor");
  const [saving, setSaving] = useState(false);

  const authHeader = token ? `Bearer ${token}` : "";

  useEffect(() => {
    if (!token) return;
    fetch("/api/channels", { headers: { Authorization: authHeader } })
      .then((r) => r.json())
      .then((data: Channel[]) => {
        const ch = data.find((c) => c.slug === channelSlug) ?? null;
        setChannel(ch);
        if (ch) {
          fetch(`/api/channels/${ch.id}/members`, { headers: { Authorization: authHeader } })
            .then((r) => r.json()).then(setMembers);
        }
      });
    if (me?.role === "super_admin") {
      fetch("/api/users", { headers: { Authorization: authHeader } })
        .then((r) => r.json()).then(setAllUsers);
    }
  }, [token, channelSlug, me?.role]);

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    if (!channel || !addUserId) return;
    setSaving(true);
    const res = await fetch(`/api/channels/${channel.id}/members`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: Number(addUserId), role: addRole }),
    });
    if (res.ok) {
      const m = await res.json();
      setMembers((prev) => [...prev, m]);
      setAddUserId("");
    }
    setSaving(false);
  }

  async function changeRole(memberId: number, role: string) {
    if (!channel) return;
    await fetch(`/api/channels/${channel.id}/members/${memberId}`, {
      method: "PATCH",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)));
  }

  async function removeMember(memberId: number) {
    if (!channel) return;
    await fetch(`/api/channels/${channel.id}/members/${memberId}`, {
      method: "DELETE",
      headers: { Authorization: authHeader },
    });
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
  }

  return (
    <div className="max-w-xl mx-auto p-8 space-y-6">
      <h1 className="text-lg font-semibold text-slate-100">Users</h1>

      {/* Members list */}
      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-200">{m.user.name}</p>
              <p className="text-xs text-slate-600">{m.user.email}</p>
            </div>
            <select
              value={m.role}
              onChange={(e) => changeRole(m.id, e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none"
            >
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button
              onClick={() => removeMember(m.id)}
              className="text-xs text-slate-600 hover:text-red-400"
            >
              Remove
            </button>
          </div>
        ))}
        {members.length === 0 && <p className="text-xs text-slate-600">No members yet.</p>}
      </div>

      {/* Add member (super_admin only) */}
      {me?.role === "super_admin" && (
        <form onSubmit={addMember} className="space-y-3">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Add member</p>
          <div className="flex gap-2">
            <select
              value={addUserId}
              onChange={(e) => setAddUserId(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none"
            >
              <option value="">Select user…</option>
              {allUsers
                .filter((u) => !members.some((m) => m.user.id === u.id))
                .map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)
              }
            </select>
            <select
              value={addRole}
              onChange={(e) => setAddRole(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none"
            >
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button
              type="submit"
              disabled={saving || !addUserId}
              className="px-4 py-1.5 text-xs rounded border border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Adding…" : "Add"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
