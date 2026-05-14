import { redirect } from "next/navigation";

// Stale `/dashboard/knowledge` URLs (old bookmarks, typed guesses based on the
// "Knowledge Base" sidebar label) land here and forward server-side to the
// real surface at /dashboard/memory — no client flash, no 404.
export default function KnowledgeRedirect() {
  redirect("/dashboard/memory");
}
