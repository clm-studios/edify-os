import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/supabase/server';
import { DashboardShell } from './dashboard-shell';

/**
 * /dashboard/* layout — Server Component.
 *
 * Runs server-side auth + org-membership checks on every dashboard route,
 * including /dashboard itself (which previously had no guard).
 *
 * Guard rules:
 *   1. If demo mode is active (NEXT_PUBLIC_DEMO_MODE=true + edify_demo cookie),
 *      skip all DB checks and render the shell directly — demo users have no
 *      real Supabase session and must not be bounced to /login.
 *   2. If Supabase is not configured (dev/mock mode — getAuthContext returns
 *      null for user), skip guard and render — middleware already handles auth
 *      for configured environments, and unconfigured envs won't have real users.
 *   3. If user is null → redirect to /login (unauthenticated).
 *   4. If user is set but orgId is null → redirect to /onboarding (no org yet).
 *
 * This fixes two bugs at once:
 *   - Bug A (F1 gap): org-less authenticated users could reach /dashboard with
 *     the briefing-done cookie set, bypassing the middleware's cookie gate.
 *   - Bug B: logged-out users with no session cookies could render the shell
 *     in uncanny states where the middleware's Edge session check misfired.
 *
 * The client-side org check in /dashboard/briefing/page.tsx is kept as
 * belt-and-suspenders defense against future regressions of this guard.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Demo-mode bypass: check before any DB call.
  // Mirrors the same logic in middleware.ts (lines 41-56).
  const demoModeEnabled = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  if (demoModeEnabled) {
    const cookieStore = await cookies();
    const isDemoUser = cookieStore.get('edify_demo')?.value === 'true';
    if (isDemoUser) {
      // Demo user — skip auth/org check, render shell directly.
      return <DashboardShell>{children}</DashboardShell>;
    }
  }

  const { user, orgId } = await getAuthContext();

  // getAuthContext returns { user: null } when Supabase is not configured.
  // In that case skip the guard — middleware handles auth for real deployments,
  // and dev/mock envs intentionally operate without a DB.
  if (user === null && orgId === null) {
    // Check if this is because Supabase isn't configured (no env vars set).
    // If SUPABASE_URL is set, a null user means genuinely unauthenticated.
    const supabaseConfigured = Boolean(
      process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
    );
    if (supabaseConfigured) {
      // Supabase IS configured but user is null → unauthenticated. Redirect.
      redirect('/login');
    }
    // Supabase not configured → dev/mock mode, skip guard.
    return <DashboardShell>{children}</DashboardShell>;
  }

  if (!user) {
    redirect('/login');
  }

  if (!orgId) {
    redirect('/onboarding');
  }

  return <DashboardShell>{children}</DashboardShell>;
}
