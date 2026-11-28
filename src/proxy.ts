// Edge gate (Next.js 16 "proxy", formerly middleware): no session cookie → sign-in page. The real check
// (session row, permissions) happens on the server for every page, action and PDF route.
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/unauthorized", "/_next", "/favicon.ico", "/icon", "/api/health"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some(p => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.get("wp_session")?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname + search)}` : "";
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "same-origin");
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
