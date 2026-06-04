"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

interface Channel { id: number; slug: string; name: string; default_format: string; captions_enabled: boolean }
interface ConfigKey { key: string; set: boolean }

const CONFIG_KEYS = [
  { key: "r2_account_id",          label: "R2 Account ID" },
  { key: "r2_access_key",          label: "R2 Access Key" },
  { key: "r2_secret_key",          label: "R2 Secret Key" },
  { key: "r2_bucket",              label: "R2 Bucket Name" },
  { key: "r2_public_url",          label: "R2 Public URL (optional)" },
  { key: "elevenlabs_api_key",     label: "ElevenLabs API Key" },
  { key: "elevenlabs_voice_id",    label: "ElevenLabs Voice ID" },
  { key: "youtube_client_id",      label: "YouTube Client ID" },
  { key: "youtube_client_secret",  label: "YouTube Client Secret" },
  { key: "youtube_refresh_token",  label: "YouTube Refresh Token" },
  { key: "runway_api_key",         label: "Runway API Key" },
  { key: "image_gen_provider",     label: "Image Gen Provider (openai | stability)" },
  { key: "image_gen_api_key",      label: "Image Gen API Key" },
  { key: "anthropic_api_key",      label: "Anthropic API Key (override)" },
];

export default function SettingsPage() {
  const { channelSlug } = useParams<{ channelSlug: string }>();
  const { token } = useAuth();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [configKeys, setConfigKeys] = useState<ConfigKey[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
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
          fetch(`/api/channels/${ch.id}/config`, { headers: { Authorization: authHeader } })
            .then((r) => r.json())
            .then(setConfigKeys);
        }
      });
  }, [token, channelSlug]);

  async function saveConfig(key: string, value: string) {
    if (!channel) return;
    setSaving(true);
    await fetch(`/api/channels/${channel.id}/config`, {
      method: "PUT",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    setConfigKeys((prev) =>
      prev.some((k) => k.key === key) ? prev.map((k) => (k.key === key ? { key, set: true } : k)) : [...prev, { key, set: true }]
    );
    setEditingKey(null);
    setSaving(false);
  }

  async function deleteConfig(key: string) {
    if (!channel) return;
    await fetch(`/api/channels/${channel.id}/config?key=${key}`, {
      method: "DELETE",
      headers: { Authorization: authHeader },
    });
    setConfigKeys((prev) => prev.filter((k) => k.key !== key));
  }

  const isSet = (key: string) => configKeys.some((k) => k.key === key && k.set);

  return (
    <div className="max-w-xl mx-auto p-8 space-y-6">
      <h1 className="text-lg font-semibold text-slate-100">Settings</h1>

      {/* Channel settings */}
      {channel && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-2">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Channel</p>
          <div className="flex gap-2 text-xs text-slate-500">
            <span>{channel.name}</span>
            <span>·</span>
            <span>{channel.default_format}</span>
            <span>·</span>
            <span>captions {channel.captions_enabled ? "on" : "off"}</span>
          </div>
        </div>
      )}

      {/* Service config */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Service Config</p>
        {CONFIG_KEYS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-300">{label}</p>
              <p className="text-xs text-slate-600">{key}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isSet(key) ? (
                <>
                  <span className="text-xs text-green-600">Set</span>
                  <button
                    onClick={() => { setEditingKey(key); setEditValue(""); }}
                    className="text-xs text-slate-500 hover:text-slate-300"
                  >
                    Update
                  </button>
                  <button
                    onClick={() => deleteConfig(key)}
                    className="text-xs text-slate-600 hover:text-red-400"
                  >
                    Remove
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { setEditingKey(key); setEditValue(""); }}
                  className="text-xs text-slate-500 hover:text-slate-300"
                >
                  Set
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Edit modal */}
      {editingKey && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md space-y-4">
            <p className="text-sm font-medium text-slate-200">{editingKey}</p>
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm text-slate-200 focus:outline-none font-mono"
            />
            <div className="flex gap-2">
              <button
                onClick={() => saveConfig(editingKey, editValue)}
                disabled={saving || !editValue.trim()}
                className="px-4 py-1.5 text-xs rounded border border-blue-700 text-blue-400 hover:bg-blue-900/20 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setEditingKey(null)}
                className="px-4 py-1.5 text-xs rounded border border-slate-600 text-slate-400 hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
