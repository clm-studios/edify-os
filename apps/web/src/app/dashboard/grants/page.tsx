"use client";

/**
 * /dashboard/grants — Grant pipeline list view (MVP).
 *
 * MVP scope per PRD phasing: list rows with click-to-drawer.
 * Kanban drag-to-move is v2.
 *
 * Design system constraints (PRD §F3):
 *   - Near-black surfaces, brand purple #9F4EF3 for active state/primary CTAs
 *   - 1px hairline borders, --bg-2 card backgrounds, --radius-lg
 *   - Days-to-deadline semantic colors: green >30d, amber 8-30d, coral <8d
 *   - Stagger card arrivals by 40ms (motion spec)
 */

import { useState, useEffect } from "react";
import { Plus, Clock, Search, Filter } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { GrantDetailDrawer } from "@/components/grants/GrantDetailDrawer";
import type { GrantPipelineRow, PipelineStatus } from "@/app/api/grants/pipeline/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function deadlineColorClass(days: number | null): string {
  if (days === null) return "text-[var(--fg-3)]";
  if (days > 30) return "text-green-600";
  if (days >= 8) return "text-amber-600";
  return "text-red-500";
}

function formatAmount(min: number | null, max: number | null): string {
  if (!min && !max) return "Amount TBD";
  const fmt = (n: number) => `$${n >= 1000 ? `${(n / 1000).toFixed(0)}K` : n}`;
  if (min && max && min !== max) return `${fmt(min)}–${fmt(max)}`;
  return fmt(min ?? max ?? 0);
}

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

const STATUS_COLORS: Record<PipelineStatus, string> = {
  discovered: "bg-[var(--bg-3)] text-[var(--fg-2)]",
  verification: "bg-amber-50 text-amber-700",
  drafting: "bg-blue-50 text-blue-700",
  internal_review: "bg-purple-50 text-purple-700",
  submitted: "bg-indigo-50 text-indigo-700",
  won: "bg-green-50 text-green-700",
  lost: "bg-[var(--bg-3)] text-[var(--fg-3)]",
  withdrawn: "bg-[var(--bg-3)] text-[var(--fg-3)]",
};

// Filter tabs
const STATUS_TABS: { label: string; filter: PipelineStatus[] | null }[] = [
  { label: "All active", filter: ["discovered", "verification", "drafting", "internal_review"] },
  { label: "Submitted", filter: ["submitted"] },
  { label: "Decided", filter: ["won", "lost", "withdrawn"] },
  { label: "All", filter: null },
];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function GrantsPage() {
  const [grants, setGrants] = useState<GrantPipelineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGrant, setSelectedGrant] = useState<GrantPipelineRow | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [search, setSearch] = useState("");

  const fetchGrants = () => {
    setLoading(true);
    setError(null);
    fetch("/api/grants/pipeline", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load grant pipeline");
        return res.json() as Promise<{ data: GrantPipelineRow[] }>;
      })
      .then(({ data }) => setGrants(data))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load pipeline"),
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchGrants();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update a single grant in state after drawer actions
  function handleNotesChange(id: string, notes: string) {
    setGrants((prev) => prev.map((g) => (g.id === id ? { ...g, notes } : g)));
    if (selectedGrant?.id === id) setSelectedGrant((prev) => prev ? { ...prev, notes } : prev);
  }

  function handleStatusChange(id: string, status: PipelineStatus) {
    setGrants((prev) => prev.map((g) => (g.id === id ? { ...g, status } : g)));
    if (selectedGrant?.id === id) setSelectedGrant((prev) => prev ? { ...prev, status } : prev);
  }

  // Filter by tab + search
  const tabFilter = STATUS_TABS[activeTab]?.filter;
  const filtered = grants.filter((g) => {
    if (tabFilter && !tabFilter.includes(g.status)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !g.funder_name.toLowerCase().includes(q) &&
        !g.opportunity_title.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  // Sort: by due_date (soonest first), then by updated_at
  const sorted = [...filtered].sort((a, b) => {
    const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
    const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
    if (da !== db) return da - db;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="heading-1">Grant pipeline</h1>
          <p className="mt-1 text-[var(--fg-3)]">
            Track grants from discovery through decision.
          </p>
        </div>
        <Link
          href="/dashboard/team/development_director"
          className="btn-primary inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Find grants
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Status tabs */}
        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map((tab, i) => (
            <button
              key={tab.label}
              onClick={() => setActiveTab(i)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                i === activeTab
                  ? "bg-[var(--brand-purple)] text-white shadow-sm"
                  : "bg-[var(--bg-3)] text-[var(--fg-2)] hover:bg-[var(--bg-2)]",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-xs w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-4)]" />
          <input
            type="text"
            placeholder="Search funders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-9 w-full"
          />
        </div>
      </div>

      {/* Grant list */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-[var(--bg-3)] animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-red-500">{error}</p>
          <button onClick={fetchGrants} className="btn-secondary mt-3">
            Retry
          </button>
        </div>
      ) : grants.length === 0 ? (
        <div className="card p-12 text-center">
          <Filter className="mx-auto h-10 w-10 text-[var(--fg-4)]" />
          <p className="mt-4 font-medium text-[var(--fg-1)]">No grants in your pipeline yet.</p>
          <p className="mt-1 text-sm text-[var(--fg-3)] max-w-sm mx-auto">
            Ask Dev Director to find grants, then say "Let&apos;s pursue this one" to add it to the pipeline.
          </p>
          <Link
            href="/dashboard/team/development_director"
            className="btn-primary mt-4 inline-flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Find grants
          </Link>
        </div>
      ) : sorted.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-[var(--fg-3)]">No grants match the current filter.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {sorted.map((grant, i) => {
            const days = daysUntil(grant.due_date);
            const isSelected = selectedGrant?.id === grant.id;

            return (
              <li
                key={grant.id}
                style={{ animationDelay: `${i * 40}ms` }}
                className="animate-fade-in"
              >
                <button
                  onClick={() => setSelectedGrant(isSelected ? null : grant)}
                  className={cn(
                    "w-full text-left rounded-xl border transition-all",
                    "bg-[var(--bg-2)] p-4",
                    "hover:bg-[var(--bg-3)] hover:shadow-md",
                    isSelected
                      ? "border-[var(--brand-purple)] shadow-[inset_0_2px_0_0_var(--brand-purple)]"
                      : "border-[var(--line-2)]",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[var(--fg-3)] truncate">
                        {grant.funder_name}
                      </p>
                      <p className="mt-0.5 font-semibold text-[var(--fg-1)] leading-snug">
                        {grant.opportunity_title}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                        STATUS_COLORS[grant.status],
                      )}
                    >
                      {STATUS_LABELS[grant.status]}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
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
                      <span className="text-[var(--fg-3)]">
                        {grant.org_fit_score}/100 fit
                      </span>
                    )}

                    {grant.drafts.length > 0 && (
                      <span className="text-[var(--fg-3)]">
                        {grant.drafts.length} draft{grant.drafts.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Detail drawer */}
      <GrantDetailDrawer
        grant={selectedGrant}
        onClose={() => setSelectedGrant(null)}
        onNotesChange={handleNotesChange}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
}
