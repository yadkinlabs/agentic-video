import { jwtVerify, SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./prisma";

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET!);

export async function signToken(payload: Record<string, unknown>) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, secret());
  return payload;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

// ---------------------------------------------------------------------------
// Auth helpers for API routes
// ---------------------------------------------------------------------------

function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

export async function requireAuth(req: NextRequest) {
  const token = extractToken(req);
  if (!token) throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: Awaited<ReturnType<typeof verifyToken>>;
  try {
    payload = await verifyToken(token);
  } catch {
    throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } });
  if (!user) throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return user;
}

export async function requireSuperAdmin(req: NextRequest) {
  const user = await requireAuth(req);
  if (user.role !== "super_admin") {
    throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return user;
}

// Role hierarchy for channel roles
const CHANNEL_ROLE_RANK: Record<string, number> = {
  viewer: 0,
  editor: 1,
  approver: 2,
  admin: 3,
};

export async function requireChannelRole(
  req: NextRequest,
  channelId: number,
  minRole: "viewer" | "editor" | "approver" | "admin"
) {
  const user = await requireAuth(req);

  // super_admin bypasses channel membership checks
  if (user.role === "super_admin") return { user, member: null };

  const member = await prisma.channelMember.findUnique({
    where: { channel_id_user_id: { channel_id: channelId, user_id: user.id } },
  });

  if (!member || CHANNEL_ROLE_RANK[member.role] < CHANNEL_ROLE_RANK[minRole]) {
    throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { user, member };
}

export function requireInternalKey(req: NextRequest) {
  const key = req.headers.get("x-internal-key");
  if (!key || key !== process.env.INTERNAL_API_KEY) {
    throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

// Allow either JWT (UI) or internal key (worker)
export async function requireAuthOrInternal(req: NextRequest) {
  const internalKey = req.headers.get("x-internal-key");
  if (internalKey) {
    requireInternalKey(req);
    return null; // no user object for worker calls
  }
  return requireAuth(req);
}
