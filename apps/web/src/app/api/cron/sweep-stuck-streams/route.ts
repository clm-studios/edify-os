import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/cron/sweep-stuck-streams
 *
 * Periodic cleanup for assistant-message rows stuck in `status = 'streaming'`.
 *
 * PR #2 (migration 00036) wired the chat streaming route's try/catch/finally
 * to flip status → 'errored' on soft failures (abort/timeout). That does NOT
 * fire when Vercel hard-kills the function at the 60s ceiling — the Node
 * process is terminated and the finally block never runs, leaving the row
 * stuck at 'streaming' forever. The frontend then sees perpetual loading
 * dots on rehydrate and never surfaces the retry affordance from PR #2.
 *
 * This sweeper runs independently of the streaming hot path: every 5 min
 * (see vercel.json) it marks any row stuck past 90s (60s ceiling + buffer)
 * as 'errored', closing the gap. Idempotent — a no-op if nothing is stuck.
 *
 * Auth: CRON_SECRET bearer token. We do NOT use getAuthContext() here —
 * Vercel cron sends GET requests without a user session, so requiring one
 * would 401 every fire. See PR #75 SESSION-LOG for that lesson.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron/sweep-stuck-streams] CRON_SECRET env var is not set");
    return NextResponse.json(
      { error: "CRON_SECRET not configured on this deployment" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = createServiceRoleClient();
  if (!serviceClient) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // 90 seconds: past the 60s Vercel ceiling with buffer for clock skew and
  // the small window between a row being inserted and the stream actually
  // starting. Tightening below 60s would risk racing healthy in-flight streams.
  const cutoffIso = new Date(Date.now() - 90_000).toISOString();

  try {
    // The messages table has no updated_at column (see migration 00003),
    // so we only flip status. created_at remains the original turn start time.
    const { data, error } = await serviceClient
      .from("messages")
      .update({ status: "errored" })
      .eq("status", "streaming")
      .lt("created_at", cutoffIso)
      .select("id");

    if (error) {
      console.error("[cron/sweep-stuck-streams] Update failed:", error);
      return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
    }

    const sweptIds = (data ?? []).map((row) => row.id as string);
    return NextResponse.json({ sweptCount: sweptIds.length, sweptIds });
  } catch (err) {
    console.error("[cron/sweep-stuck-streams] Unexpected failure:", err);
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}
