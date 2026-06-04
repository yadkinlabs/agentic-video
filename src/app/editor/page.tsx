"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

interface Channel { id: number; slug: string; name: string }

export default function EditorIndexPage() {
  const { token } = useAuth();
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    if (!token) return;
    fetch("/api/channels", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data: Channel[]) => {
        if (data.length > 0) {
          router.replace(`/editor/${data[0].slug}`);
        } else {
          setChannels([]);
        }
      });
  }, [token, router]);

  if (channels.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
        No channels found. Ask a super admin to create one.
      </div>
    );
  }
  return null;
}
