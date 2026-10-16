import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { sessionFromToken, signSessionToken, type SessionUser } from "./session-token";

export { SESSION_COOKIE };
export type { SessionUser };

export async function createSession(user: SessionUser) {
  const token = await signSessionToken(user);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: 60 * 60 * 24 * 14,
  });
}
export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? sessionFromToken(prisma, token) : null;
}
export async function requireSession(options: { allowPasswordChange?: boolean } = {}): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword && !options.allowPasswordChange) redirect("/account");
  return session;
}
export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}
export async function requireWriter() {
  const user = await requireSession();
  if (user.role === "BOSS") redirect("/?error=read-only");
  return user;
}
