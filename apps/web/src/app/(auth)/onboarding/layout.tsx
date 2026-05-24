import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/supabase/server";
import type { ReactNode } from "react";

/**
 * Prevent browser and Vercel CDN from caching /onboarding responses.
 *
 * Smoke testing during PR #10 revealed that the browser served a stale
 * pre-deploy snapshot of /onboarding (missing autocomplete attrs) because
 * Next.js's default `Cache-Control: public, max-age=0, must-revalidate` allows
 * the Vercel edge and browser disk cache to serve stale HTML on same-URL navigations.
 *
 * `force-dynamic` sets `Cache-Control: no-store` so every navigation hits the
 * server where the guard below actually runs.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Server layout for /onboarding.
 *
 * Guards:
 * 1. Unauthenticated users → middleware already redirects to /login before this runs.
 * 2. Users who already have a member row → redirect to /dashboard (they've onboarded).
 *
 * Users with no member row pass through to the onboarding page client component.
 */
export default async function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, memberId } = await getAuthContext();

  // If Supabase is not configured (local dev / mock mode), let the page render.
  if (!user) {
    // Middleware should have caught this, but belt-and-suspenders.
    redirect("/login");
  }

  if (memberId) {
    // User already has an org — send them to the dashboard.
    redirect("/dashboard");
  }

  return <>{children}</>;
}
