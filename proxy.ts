import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { sessionFromToken } from "@/lib/session-token";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await sessionFromToken(prisma, token) : null;
  if (request.nextUrl.pathname === "/login") {
    if (user) return NextResponse.redirect(new URL(user.mustChangePassword ? "/account" : "/", request.url));
    const response = NextResponse.next();
    if (token) response.cookies.delete(SESSION_COOKIE);
    return response;
  }
  if (!user) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    if (token) response.cookies.delete(SESSION_COOKIE);
    return response;
  }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
