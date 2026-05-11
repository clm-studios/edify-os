import { NextResponse } from "next/server";
import { createServiceRoleClient, getAuthContext } from "@/lib/supabase/server";
import { ARCHETYPE_SLUGS } from "@/lib/archetypes";

/**
 * GET /api/team/[slug]/messages?conversationId=<uuid>
 *
 * Fetch messages for a conversation from the database.
 * Used when the client has no local copy (e.g. new device, cleared cache).
 */
export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const { slug } = params;

  if (!(ARCHETYPE_SLUGS as readonly string[]).includes(slug)) {
    return NextResponse.json({ error: "Unknown team member" }, { status: 404 });
  }

  const { user, orgId } = await getAuthContext();
  if (!user || !orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId");

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }

  const serviceClient = createServiceRoleClient();
  if (!serviceClient) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Verify conversation belongs to this org
  const { data: conv } = await serviceClient
    .from("conversations")
    .select("id, org_id")
    .eq("id", conversationId)
    .eq("org_id", orgId)
    .single();

  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const { data: messages, error } = await serviceClient
    .from("messages")
    .select("id, role, content, created_at, status")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("[team/messages] DB error:", error);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }

  // Migration 00036 added messages.status; older rows have default 'complete'.
  // Surface it to the client so the chat UI can render a retry affordance
  // instead of perpetual loading dots when rehydrating an assistant turn that
  // died mid-stream.
  const shaped = (messages ?? []).map((m) => ({
    id: m.id as string,
    role: m.role as "user" | "assistant",
    content: m.content as string,
    timestamp: m.created_at as string,
    status: (m.status as "streaming" | "complete" | "errored" | null) ?? "complete",
    conversationId,
  }));

  return NextResponse.json(shaped);
}
