import { NextResponse, type NextRequest } from "next/server";
import { isValidCronRequest, isValidSession, SESSION_COOKIE } from "@/lib/session";

/**
 * Tout le site est réservé à Victor : sans session valide, les pages renvoient vers /login et
 * les routes API répondent 401. Seule exception : /api/cron/* avec le secret CRON_SECRET.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();
  if (isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/cron/") && isValidCronRequest(request.headers.get("authorization"))) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Session expirée : reconnecte-toi." }, { status: 401 });
  }
  const url = new URL("/login", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
