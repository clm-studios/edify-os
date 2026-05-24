import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/supabase/server';
import { DashboardShell } from './dashboard-shell';

/**
 * Prevent browser and Vercel CDN from caching any /dashboard/* response.
 *
 * Without these, Next.js emits `Cache-Control: public, max-age=0, must-revalidate`
 * which allows the Vercel edge to serve a `X-Vercel-Cache: HIT` response — and the
 * browser can serve a stale "authorized" snapshot from disk cache (transferSize: 0,
 * navType: 'navigate') without ever reaching the server-side guard below.
 *
 * `force-dynamic` sets `Cache-Control: no-store` on every response in this subtree.
 * `revalidate = 0` is belt-and-suspenders for any ISR-adjacent path.
 *
 * These exports apply to the entire /dashboard/* subtree because Next.js propagates
 * layout-level dynamic config to all child pages.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * /dashboard/* layout — Server Component.
 *
 * Guard rules (evaluated server-side on every dashboard route):
 *   1. Demo mode (NEXT_PUBLIC_DEMO_MODE=true + edify_demo cookie) → bypass all
 *      DB checks. Demo users have no real Supabase session.
 *   2. Supabase not configured (dev/mock) → bypass guard; middleware handles
 *      auth for real deployments.
 *   3. !user → redirect /login
 *   4. user && !orgId → redirect /onboarding
 *
 * Closes two bugs with one fix:
 *   - F1 gap: org-less users with edify_briefing_done cookie could reach
 *     /dashboard directly, bypassing the middleware's cookie gate.
 *   - Logged-out users could render the shell when middleware's Edge session
 *     check misfired.
 *
 * The client-side org check in /dashboard/briefing/page.tsx is kept as
 * belt-and-suspenders against future regressions of this guard.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Demo-mode bypass — mirrors middleware.ts logic.
  // Must read cookies before getAuthContext to avoid an unnecessary DB call.
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    const cookieStore = await cookies();
    if (cookieStore.get('edify_demo')?.value === 'true') {
      return <DashboardShell>{children}</DashboardShell>;
    }
  }

  // getAuthContext returns { user: null, orgId: null } both when Supabase is
  // not configured (dev/mock) and when the user is genuinely unauthenticated.
  // Distinguish the two cases by checking whether SUPABASE_URL is set.
  const supabaseConfigured = Boolean(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  );

  if (!supabaseConfigured) {
    return <DashboardShell>{children}</DashboardShell>;
  }

  const { user, orgId } = await getAuthContext();

  if (!user) redirect('/login');
  if (!orgId) redirect('/onboarding');

  return <DashboardShell>{children}</DashboardShell>;
}
