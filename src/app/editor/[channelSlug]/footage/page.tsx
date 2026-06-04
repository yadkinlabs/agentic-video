"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

interface Channel { id: number; slug: string; name: string }
interface FootageItem { id: number; r2_key: string; prompt: string | null; created_at: string }

export default function FootageLibraryPage() {
  const { channelSlug } = useParams<{ channelSlug: string }>();
  const { token } = useAuth();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [footage, setFootage] = useState<FootageItem[]>([]);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);

  const authHeader = token ? `Bearer ${token}` : "";

  useEffect(() => {
    if (!token) return;
    fetch("/api/channels", { headers: { Authorization: authHeader } })
      .then((r) => r.json())
      .then((data: Channel[]) => setChannel(data.find((c) => c.slug === channelSlug) ?? null));
  }, [token, channelSlug]);

  const fetchFootage = useCallback(async () => {
    if (!channel) return;
    const res = await fetch(`/api/footage?channel_id=${channel.id}&limit=200`, {
      headers: { Authorization: authHeader },
    });
    if (res.ok) {
      const items: FootageItem[] = await res.json();
      setFootage(items);
      setLoading(false);
      // Presign in batches of 10
      const batches = [];
      for (let i = 0; i < items.length; i += 10) batches.push(items.slice(i, i + 10));
      for (const batch of batches) {
        await Promise.all(
          batch.map(async (item) => {
            const r = await fetch(
              `/api/channels/${channel.id}/media/presign?key=${encodeURIComponent(item.r2_key)}`,
              { headers: { Authorization: authHeader } }
            );
            if (r.ok) {
              const { url } = await r.json();
              setUrls((prev) => ({ ...prev, [item.id]: url }));
            }
          })
        );
      }
    }
  }, [channel, authHeader]);

  useEffect(() => { fetchFootage(); }, [fetchFootage]);

  if (loading) return <div className="p-8 text-slate-400 text-sm">Loading…</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-lg font-semibold text-slate-100">Footage Library</h1>
      {footage.length === 0 ? (
        <p className="text-sm text-slate-600">No footage yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {footage.map((item) => (
            <div key={item.id} className="space-y-1 group">
              {urls[item.id] ? (
                <a href={urls[item.id]} download target="_blank" rel="noopener noreferrer">
                  <img
                    src={urls[item.id]}
                    alt={item.prompt ?? ""}
                    className="w-full aspect-video object-cover rounded border border-slate-800 group-hover:border-slate-600"
                  />
                </a>
              ) : (
                <div className="w-full aspect-video bg-slate-900 rounded border border-slate-800" />
              )}
              {item.prompt && (
                <p className="text-xs text-slate-600 line-clamp-1">{item.prompt}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
