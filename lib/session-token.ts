import { jwtVerify, SignJWT, type JWTPayload } from "jose";
import type { PrismaClient, Role } from "@prisma/client";

export type SessionUser = {
  id: string; name: string; email: string; role: Role;
  mustChangePassword?: boolean;
  passwordChangedAt?: Date | null;
};
function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("缺少 AUTH_SECRET，请复制 .env.example 为 .env 后再启动");
  return new TextEncoder().encode(secret);
}
export function sessionIsCurrent(payload: Pick<JWTPayload, "iat"> & { passwordRevision?: unknown }, user: { disabledAt: Date | null; passwordChangedAt: Date | null }) {
  if (user.disabledAt || typeof payload.iat !== "number" || !Number.isFinite(payload.iat)) return false;
  if (!user.passwordChangedAt) return true;
  // JWT uses seconds. Preserve fractional seconds rather than truncating the DB
  // timestamp, which would let an older token survive a same-second reset.
  return payload.iat >= user.passwordChangedAt.getTime() / 1000
    && payload.passwordRevision === user.passwordChangedAt.getTime();
}
export async function signSessionToken(user: SessionUser) {
  return new SignJWT({ id: user.id, name: user.name, email: user.email, role: user.role,
    passwordRevision: user.passwordChangedAt?.getTime() ?? null })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Math.max(Date.now(), user.passwordChangedAt?.getTime() ?? 0) / 1000)
    .setExpirationTime("14d").sign(secretKey());
}
// Shared by getSession and proxy so stale cookies cannot create /login ↔ / loops.
export async function sessionFromToken(db: PrismaClient, token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.id !== "string") return null;
    const user = await db.user.findUnique({ where: { id: payload.id }, select: {
      id: true, name: true, email: true, role: true, disabledAt: true, passwordChangedAt: true, mustChangePassword: true,
    } });
    if (!user || !sessionIsCurrent(payload, user)) return null;
    const { disabledAt: _disabledAt, ...session } = user;
    void _disabledAt;
    return session;
  } catch { return null; }
}
