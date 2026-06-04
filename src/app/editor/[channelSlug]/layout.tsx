"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

interface Channel { id: number; slug: string; name: string; default_format: string }

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`block px-3 py-1.5 rounded text-sm ${
        active ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
      }`}
    >
      {label}
    </Link>
  );
}

export default function ChannelLayout({ children }: { children: React.ReactNode }) {
  const { channelSlug } = useParams<{ channelSlug: string }>();
  const pathname = usePathname();
  const { token, user, logout } = useAuth();
  const router = useRouter();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch("/api/channels", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data: Channel[]) => {
        setChannels(data);
        setCurrentChannel(data.find((c) => c.slug === channelSlug) ?? null);
      });
  }, [token, channelSlug]);

  const base = `/editor/${channelSlug}`;
  const is = (path: string) => pathname === `${base}${path}` || pathname.startsWith(`${base}${path}/`);

  return (
    <div className="flex min-h-screen">
      {/* Left nav */}
      <nav className="w-52 shrink-0 bg-slate-950 border-r border-slate-800 flex flex-col">
        {/* Channel switcher */}
        <div className="p-3 border-b border-slate-800">
          <select
            value={channelSlug}
            onChange={(e) => router.push(`/editor/${e.target.value}`)}
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none"
          >
            {channels.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Primary nav */}
        <div className="flex-1 p-2 space-y-0.5">
          <NavLink href={base} label="Tasks" active={pathname === base || is("/tasks")} />
          <NavLink href={`${base}/videos`} label="Videos" active={is("/videos")} />
          <NavLink href={`${base}/footage`} label="Footage" active={is("/footage")} />

          <div className="pt-4 pb-1 px-3">
            <span className="text-xs text-slate-600 uppercase tracking-wider">Admin</span>
          </div>
          <NavLink href={`${base}/objectives`} label="Objectives" active={is("/objectives")} />
          <NavLink href={`${base}/settings`} label="Settings" active={is("/settings")} />
          {user?.role === "super_admin" && (
            <NavLink href={`${base}/users`} label="Users" active={is("/users")} />
          )}
        </div>

        {/* User */}
        <div className="p-3 border-t border-slate-800">
          <div className="text-xs text-slate-500 truncate">{user?.name}</div>
          <button
            onClick={() => { logout(); router.push("/login"); }}
            className="text-xs text-slate-600 hover:text-slate-400 mt-0.5"
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {currentChannel ? children : (
          <div className="p-8 text-slate-500 text-sm">Loading…</div>
        )}
      </main>
    </div>
  );
}
