"use client";

/**
 * GrantDetailDrawer — slide-in panel from the right for a single grant.
 *
 * Layout: W2 from PRD wireframes. Sections:
 *   - Header: funder name, title, amount, due date, fit score, status pill
 *   - Drafts timeline (append-only, version list)
 *   - Attachments checklist (stub — v2 populates via compile_application)
 *   - Notes textarea
 *   - Actions row: "Talk to Dev about this grant" + status advance + source link
 *
 * Design system constraints (PRD §F3):
 *   - Near-black surfaces, brand purple #9F4EF3 for active CTAs only
 *   - 1px hairline borders, --bg-2 card backgrounds, --radius-lg
 *   - Days-to-deadline semantic colors: green >30, amber 8-30, coral <8
 */

import { useEffect, useRef, useState } from "react";
import {
  X,
  ExternalLink,
  ChevronRight,
  FileText,
  CheckSquare,
  Square,
  MessageSquare,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { GrantPipelineRow, PipelineStatus } from "@/app/api/grants/pipeline/route";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GrantDetailDrawerProps {
  grant: GrantPipelineRow | null;
  onClose: () => void;
  onNotesChange?: (id: string, notes: string) => void;
  onStatusChange?: (id: string, status: PipelineStatus) => void;
}

// Default attachment checklist for MVP (stub — v2 generates from compile_application)
const DEFAULT_ATTACHMENTS = [
  { label: "Board list", checked: false },
  { label: "IRS 990 (most recent)", checked: false },
  { label: "IRS determination letter", checked: false },
  { label: "Audit (most recent fiscal year)", checked: false },
  { label: "Organizational budget", checked: false },
  { label: "Project budget", checked: false },
];

// Status flow — only forward-direction transitions shown in CTA
const STATUS_NEXT: Partial<Record<PipelineStatus, PipelineStatus>> = {
  discovered: "verification",
  verification: "drafting",
  drafting: "internal_review",
  internal_review: "submitted",
};

const STATUS_LABELS: Record<PipelineStatus, string> = {
  discovered: "Discovered",
  verification: "Verification",
  drafting: "Drafting",
  internal_review: "Internal Review",
  submitted: "Submitted",
  won: "Won",
  lost: "Lost",
  withdrawn: "Withdrawn",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const ms = due.getTime() - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function deadlineColorClass(days: number | null): string {
  if (days === null) return "text-[var(--fg-3)]";
  if (days > 30) return "text-green-600";
  if (days >= 8) return "text-amber-600";
  return "text-red-500";
}

function formatAmount(min: number | null, max: number | null): string {
  if (!min && !max) return "Amount TBD";
  const fmt = (n: number) => `$${(n >= 1000 ? `${(n / 1000).toFixed(0)}K` : n)}`;
  if (min && max && min !== max) return `${fmt(min)}–${fmt(max)}`;
  return fmt(min ?? max ?? 0);
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GrantDetailDrawer({
  grant,
  onClose,
  onNotesChange,
  onStatusChange,
}: GrantDetailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [notes, setNotes] = useState(grant?.notes ?? "");
  const [notesSaving, setNotesSaving] = useState(false);
  const notesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync notes when grant changes
  useEffect(() => {
    setNotes(grant?.notes ?? "");
  }, [grant?.id, grant?.notes]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!grant) return null;

  // Capture id locally so async closures have a stable non-null reference
  const grantId = grant.id;
  const days = daysUntil(grant.due_date);
  const nextStatus = STATUS_NEXT[grant.status];
  const isDecided = ["won", "lost", "withdrawn"].includes(grant.status);

  // Debounced notes save
  function handleNotesChange(value: string) {
    setNotes(value);
    if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current);
    notesDebounceRef.current = setTimeout(async () => {
      if (!onNotesChange) return;
      setNotesSaving(true);
      try {
        await fetch(`/api/grants/pipeline/${grantId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: value }),
        });
        onNotesChange(grantId, value);
      } finally {
        setNotesSaving(false);
      }
    }, 800);
  }

  async function handleStatusAdvance() {
    if (!nextStatus || !onStatusChange) return;
    try {
      await fetch(`/api/grants/pipeline/${grantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      onStatusChange(grantId, nextStatus);
    } catch (err) {
      console.error("[grant-drawer] Status advance error:", err);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        ref={drawerRef}
        className={cn(
          "fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto",
          "bg-[var(--bg-1)] shadow-2xl",
          "border-l border-[var(--line-2)]",
          "animate-slide-in-right",
        )}
        aria-label="Grant detail"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-[var(--line-2)] bg-[var(--bg-1)] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--fg-3)]">
                {grant.funder_name}
              </p>
              <h2 className="mt-0.5 text-base font-semibold text-[var(--fg-1)] leading-snug">
                {grant.opportunity_title}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="mt-0.5 shrink-0 rounded-lg p-1.5 text-[var(--fg-3)] hover:bg-[var(--bg-3)] hover:text-[var(--fg-1)]"
              aria-label="Close drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Meta row */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            <span className="font-medium text-[var(--fg-1)]">
              {formatAmount(grant.amount_min, grant.amount_max)}
            </span>

            {days !== null && (
              <span className={cn("flex items-center gap-1", deadlineColorClass(days))}>
                <Clock className="h-3.5 w-3.5" />
                {days > 0 ? `Due in ${days}d` : days === 0 ? "Due today" : `${Math.abs(days)}d overdue`}
              </span>
            )}

            {grant.org_fit_score !== null && (
              <span className="text-[var(--fg-2)]">
                {grant.org_fit_score}/100 fit
              </span>
            )}

            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium",
                grant.status === "won"
                  ? "bg-green-100 text-green-700"
                  : grant.status === "lost" || grant.status === "withdrawn"
                    ? "bg-[var(--bg-3)] text-[var(--fg-3)]"
                    : "bg-[var(--bg-2)] text-[var(--brand-purple)] shadow-[inset_0_0_0_1px_var(--line-purple)]",
              )}
            >
              {STATUS_LABELS[grant.status]}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-6 px-5 py-5">
          {/* Drafts timeline */}
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--fg-1)]">
              <FileText className="h-4 w-4 text-[var(--brand-purple)]" />
              Drafts
              {grant.drafts.length > 0 && (
                <span className="rounded-full bg-[var(--bg-3)] px-2 py-0.5 text-xs text-[var(--fg-3)]">
                  {grant.drafts.length}
                </span>
              )}
            </h3>

            {grant.drafts.length === 0 ? (
              <p className="text-sm text-[var(--fg-3)]">
                No drafts yet. Ask Dev Director to draft a section.
              </p>
            ) : (
              <ul className="space-y-2">
                {[...grant.drafts].reverse().map((draft, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--fg-1)]">
                        v{draft.version} · {draft.section.replace(/_/g, " ")}
                      </p>
                      <p className="text-xs text-[var(--fg-3)]">
                        {formatRelative(draft.drafted_at)} · {draft.drafted_by_tool}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[var(--fg-4)]" />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Attachments checklist */}
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--fg-1)]">
              <CheckSquare className="h-4 w-4 text-[var(--brand-purple)]" />
              Attachments checklist
            </h3>
            {/* MVP stub — v2 populates from compile_application */}
            <ul className="space-y-1.5">
              {DEFAULT_ATTACHMENTS.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center gap-2.5 text-sm text-[var(--fg-2)]"
                >
                  <Square className="h-4 w-4 shrink-0 text-[var(--fg-4)]" />
                  {item.label}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-[var(--fg-4)]">
              Compile application in v2 to auto-generate this checklist.
            </p>
          </section>

          {/* Notes */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-[var(--fg-1)]">Notes</h3>
            <textarea
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              rows={4}
              placeholder="Free notes — deadlines, contacts, special requirements..."
              className="input-field w-full resize-y text-sm"
            />
            {notesSaving && (
              <p className="mt-1 text-xs text-[var(--fg-4)]">Saving…</p>
            )}
          </section>

          {/* Actions */}
          <section className="space-y-2 border-t border-[var(--line-2)] pt-4">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--fg-3)]">
              Actions
            </h3>

            {/* Talk to Dev — primary CTA (PRD W2) */}
            <Link
              href={`/dashboard/team/development_director?grant_id=${encodeURIComponent(grant.id)}&funder=${encodeURIComponent(grant.funder_name)}`}
              className="btn-primary flex w-full items-center justify-center gap-2"
            >
              <MessageSquare className="h-4 w-4" />
              Talk to Dev about this grant
            </Link>

            {/* Status advance */}
            {nextStatus && !isDecided && (
              <button
                onClick={handleStatusAdvance}
                className="btn-secondary flex w-full items-center justify-center gap-2"
              >
                <ChevronRight className="h-4 w-4" />
                Move to {STATUS_LABELS[nextStatus]}
              </button>
            )}

            {/* Source link */}
            <a
              href={grant.citation_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary flex w-full items-center justify-center gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              View source funding page
            </a>
          </section>
        </div>
      </aside>
    </>
  );
}
