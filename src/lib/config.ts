import { prisma } from "./prisma";

// ---------------------------------------------------------------------------
// AES-256-GCM encryption for service config values
// CONFIG_ENCRYPTION_KEY must be a base64-encoded 32-byte key
// ---------------------------------------------------------------------------

function getKey(): Uint8Array {
  const raw = process.env.CONFIG_ENCRYPTION_KEY;
  if (!raw) throw new Error("CONFIG_ENCRYPTION_KEY is not set");
  return Buffer.from(raw, "base64");
}

export async function encryptValue(plaintext: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", getKey(), { name: "AES-GCM" }, false, ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.byteLength);
  return Buffer.from(combined).toString("base64");
}

export async function decryptValue(ciphertext: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", getKey(), { name: "AES-GCM" }, false, ["decrypt"]
  );
  const combined = Buffer.from(ciphertext, "base64");
  const iv = combined.subarray(0, 12);
  const encrypted = combined.subarray(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    encrypted
  );
  return new TextDecoder().decode(decrypted);
}

// ---------------------------------------------------------------------------
// Simple in-process cache (5-minute TTL)
// ---------------------------------------------------------------------------

const _cache = new Map<string, { value: string; expires: number }>();

export async function resolveServiceConfig(
  channelId: number,
  key: string
): Promise<string | null> {
  const cacheKey = `${channelId}:${key}`;
  const cached = _cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;

  const row = await prisma.serviceConfig.findUnique({
    where: { channel_id_key: { channel_id: channelId, key } },
  });
  if (!row) return null;

  const value = await decryptValue(row.encrypted_value);
  _cache.set(cacheKey, { value, expires: Date.now() + 5 * 60 * 1000 });
  return value;
}

export function invalidateConfigCache(channelId: number, key?: string) {
  if (key) {
    _cache.delete(`${channelId}:${key}`);
  } else {
    for (const k of _cache.keys()) {
      if (k.startsWith(`${channelId}:`)) _cache.delete(k);
    }
  }
}

// ---------------------------------------------------------------------------
// Resolve all config keys for a channel (for worker use)
// Returns a plain Record<string, string> with decrypted values
// ---------------------------------------------------------------------------

export async function resolveAllServiceConfig(
  channelId: number
): Promise<Record<string, string>> {
  const rows = await prisma.serviceConfig.findMany({ where: { channel_id: channelId } });
  const result: Record<string, string> = {};
  await Promise.all(
    rows.map(async (row) => {
      result[row.key] = await decryptValue(row.encrypted_value);
    })
  );
  return result;
}
