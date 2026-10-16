"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Activity, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle,
  Loader2, Clock, X, Play, RefreshCw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/components/neo/cn";

type JobRow = {
  id: string;
  type: string;
  status: "queued" | "running" | "succeeded" | "failed" | "dead_letter" | "cancelled";
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  queued: Clock,
  running: Loader2,
  succeeded: CheckCircle2,
  failed: AlertTriangle,
  dead_letter: AlertTriangle,
  cancelled: X,
};

const STATUS_COLOR: Record<string, string> = {
  queued: "text-ink-3",
  running: "text-oxblood animate-spin",
  succeeded: "text-positive",
  failed: "text-oxblood",
  dead_letter: "text-oxblood",
  cancelled: "text-ink-3",
};

const TYPE_LABEL: Record<string, string> = {
  gmail_sync: "Gmail sync",
  classify_reply: "Classify reply",
  followup_scan: "Follow-up scan",
  trigger_scan: "Trigger scan",
  discovery_run: "Discovery run",
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function ActivityDock({ workspaceId }: { workspaceId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef(createClient());

  const fetchJobs = useCallback(async () => {
    const { data } = await supabaseRef.current
      .from("jobs")
      .select("id, type, status, attempts, max_attempts, last_error, created_at, updated_at")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(15);
    if (data) setJobs(data as JobRow[]);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    fetchJobs();

    const channel = supabaseRef.current
      .channel("jobs-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jobs", filter: `workspace_id=eq.${workspaceId}` },
        () => fetchJobs(),
      )
      .subscribe();

    return () => { supabaseRef.current.removeChannel(channel); };
  }, [workspaceId, fetchJobs]);

  const activeCount = jobs.filter((j) => j.status === "running" || j.status === "queued").length;
  const failedCount = jobs.filter((j) => j.status === "failed" || j.status === "dead_letter").length;

  const handleRetry = async (id: string) => {
    await supabaseRef.current
      .from("jobs")
      .update({ status: "queued", run_after: new Date().toISOString(), attempts: 0, last_error: null })
      .eq("id", id)
      .eq("workspace_id", workspaceId);
    fetchJobs();
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 lg:bottom-6 lg:right-6">
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.33, 1, 0.68, 1] }}
            className="w-80 max-h-[420px] overflow-hidden rounded-neo-lg neo-raised-lg bg-surface"
          >
            <header className="flex items-center justify-between border-b border-rule px-4 py-3">
              <h3 className="text-sm font-semibold text-ink">Activity</h3>
              <div className="flex items-center gap-2">
                {activeCount > 0 && (
                  <span className="flex items-center gap-1 text-[0.65rem] font-medium text-oxblood">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {activeCount} active
                  </span>
                )}
                <button
                  onClick={() => setExpanded(false)}
                  className="grid h-6 w-6 place-items-center rounded-full hover:bg-sunken/60 transition-colors"
                  aria-label="Minimise"
                >
                  <ChevronDown className="h-3.5 w-3.5 text-ink-3" />
                </button>
              </div>
            </header>

            <div className="overflow-y-auto max-h-[360px] divide-y divide-rule/50">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-ink-3" />
                </div>
              ) : jobs.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-3">No recent jobs</p>
              ) : (
                jobs.map((job) => {
                  const Icon = STATUS_ICON[job.status] ?? Clock;
                  return (
                    <div key={job.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-sunken/30 transition-colors">
                      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", STATUS_COLOR[job.status])} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-medium text-ink">
                            {TYPE_LABEL[job.type] ?? job.type}
                          </span>
                          <span className="shrink-0 text-[0.6rem] text-ink-3">
                            {timeAgo(job.updated_at)}
                          </span>
                        </div>
                        {job.last_error && (
                          <p className="mt-0.5 truncate text-[0.65rem] text-oxblood" title={job.last_error}>
                            {job.last_error}
                          </p>
                        )}
                        {(job.status === "failed" || job.status === "dead_letter") && (
                          <button
                            onClick={() => handleRetry(job.id)}
                            className="mt-1 inline-flex items-center gap-1 text-[0.65rem] font-medium text-ink-2 hover:text-ink transition-colors"
                          >
                            <RefreshCw className="h-2.5 w-2.5" /> Retry
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pill trigger */}
      <motion.button
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          "flex items-center gap-2 rounded-full neo-raised px-4 py-2.5 text-sm font-medium text-ink transition-all hover:neo-raised-lg",
          activeCount > 0 && "ring-1 ring-oxblood/20",
        )}
        whileTap={{ scale: 0.97 }}
        aria-label={expanded ? "Minimise activity dock" : "Open activity dock"}
        aria-expanded={expanded}
      >
        {activeCount > 0 ? (
          <Loader2 className="h-4 w-4 animate-spin text-oxblood" />
        ) : failedCount > 0 ? (
          <AlertTriangle className="h-4 w-4 text-oxblood" />
        ) : (
          <Activity className="h-4 w-4 text-ink-2" />
        )}
        <span className="tabular">
          {activeCount > 0
            ? `${activeCount} running`
            : failedCount > 0
              ? `${failedCount} failed`
              : "Activity"}
        </span>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-ink-3" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5 text-ink-3" />
        )}
      </motion.button>
    </div>
  );
}
