import { compare } from "bcryptjs";
import type { PrismaClient } from "@prisma/client";

// Keep existing login semantics: NFKC, zero-width removal and edge whitespace only
// for passwords; accounts additionally remove all whitespace and ignore case.
export function compact(raw: string) {
  return raw.normalize("NFKC").replace(/[\u200b-\u200d\ufeff]/g, "").trim();
}
export function normalizeLogin(raw: string) {
  const value = compact(raw).replace(/\s+/g, "").toLowerCase();
  return !value || value.includes("@") ? value : `${value}@okr.local`;
}
export async function authenticateCredentials(db: PrismaClient, login: string, password: string) {
  const user = await db.user.findUnique({ where: { email: normalizeLogin(login) } });
  if (!user || user.disabledAt || !await compare(compact(password), user.passwordHash)) return null;
  return user;
}
