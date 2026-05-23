import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Routes that require authentication (but do NOT require a member row).
// /onboarding is intentionally here — new users need to be signed in but
// haven't created an org yet, so they must not be bounced for lacking a
// member row.
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding"];

// Cookie name for caching the "has completed briefing" flag.
// Set client-side after a successful POST /api/onboarding/complete.
// Avoids a DB round-trip on every request (middleware runs in Edge runtime).
// TTL: 7 days. Same string is used in apps/web/src/app/dashboard/briefing/page.tsx.
const BRIEFING_DONE_COOKIE = "edify_briefing_done";

// Dashboard sub-paths exempt from the briefing gate.
// /dashboard/briefing must be exempt to avoid an infinite redirect loop.
const BRIEFING_EXEMPT_PREFIXES = ["/dashboard/briefing"];

// Auth routes that logged-in users should be redirected away from
const AUTH_PATHS = ["/login", "/signup"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isConfigured = Boolean(
    (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      (process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );

  if (!isConfigured) {
    return NextResponse.next();
  }

  const { response, session } = await updateSession(request);

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  // Gated by NEXT_PUBLIC_DEMO_MODE so only preview or explicitly-enabled
  // deploys expose the skip-to-dashboard flow. Production must leave it unset.
  const demoModeEnabled = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const isDemoMode =
    demoModeEnabled &&
    (request.cookies.get("edify_demo")?.value === "true" ||
      request.nextUrl.searchParams.get("demo") === "true");

  if (isDemoMode && isProtected) {
    if (request.nextUrl.searchParams.get("demo") === "true") {
      const resp = NextResponse.next();
      resp.cookies.set("edify_demo", "true", { path: "/", maxAge: 60 * 60 * 24 }); // 24h
      return resp;
    }
    return NextResponse.next();
  }

  // Redirect unauthenticated users away from protected routes.
  if (isProtected && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect logged-in users away from login/signup to the dashboard.
  if (session && AUTH_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // F1 + F5: Briefing gate.
  // Authenticated dashboard users without the briefing-done cookie are sent to
  // /dashboard/briefing. Demo mode is already handled above (early return), so
  // we don't re-check it here. The cookie is written client-side after a
  // successful POST /api/onboarding/complete — this avoids a DB hit in Edge
  // runtime. Existing localStorage-only users hit this gate on first post-deploy
  // login, land on /dashboard/briefing pre-populated from localStorage, submit,
  // and get the cookie set (F5 Option B silent backfill).
  if (
    session &&
    pathname.startsWith("/dashboard") &&
    !BRIEFING_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    const briefingDone = request.cookies.get(BRIEFING_DONE_COOKIE)?.value === "true";
    if (!briefingDone) {
      return NextResponse.redirect(new URL("/dashboard/briefing", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image  (image optimization)
     * - favicon.ico
     * - public assets (images, fonts, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
