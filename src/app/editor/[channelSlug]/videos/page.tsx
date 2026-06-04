"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

interface Channel { id: number; slug: string }
interface Video {
  id: number;
  title: string;
  youtube_video_id: string | null;
  published_at: string | null;
  created_at: string;
}

export default function VideosPage() {
  const { channelSlug } = useParams<{ channelSlug: string }>();
  const { token } = useAuth();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  const authHeader = token ? `Bearer ${token}` : "";

  useEffect(() => {
    if (!token) return;
    fetch("/api/channels", { headers: { Authorization: authHeader } })
      .then((r) => r.json())
      .then((data: Channel[]) => setChannel(data.find((c) => c.slug === channelSlug) ?? null));
  }, [token, channelSlug]);

  useEffect(() => {
    if (!channel) return;
    fetch(`/api/videos?channel_id=${channel.id}`, { headers: { Authorization: authHeader } })
      .then((r) => r.json())
      .then((data: Video[]) => { setVideos(data); setLoading(false); });
  }, [channel]);

  if (loading) return <div className="p-8 text-slate-400 text-sm">Loading…</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-lg font-semibold text-slate-100">Videos</h1>
      {videos.length === 0 ? (
        <p className="text-sm text-slate-600">No videos yet.</p>
      ) : (
        <div className="space-y-2">
          {videos.map((v) => (
            <div key={v.id} className="flex items-center gap-4 bg-slate-900 border border-slate-800 rounded-lg px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-200 truncate">{v.title}</p>
                <p className="text-xs text-slate-600">
                  {v.published_at ? new Date(v.published_at).toLocaleDateString() : "Not published"}
                </p>
              </div>
              {v.youtube_video_id && (
                <a
                  href={`https://youtu.be/${v.youtube_video_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 shrink-0"
                >
                  YouTube →
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
