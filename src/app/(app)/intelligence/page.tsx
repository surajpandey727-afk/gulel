import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { relTime } from "@/lib/filters";
import type { AnalystOutput } from "@/lib/ai/agents/analyst";
import { EmptyState, PageHeader, Panel } from "@/components/neo/surface";
import { Badge } from "@/components/neo/badge";
import { TriggerList } from "./trigger-list";

export const metadata = { title: "Intelligence" };

export default async function IntelligencePage() {
  const s = await getSession();
  const supabase = await createClient();
  const [{ data: insights }, { data: risks }, { data: triggers }] = await Promise.all([
    supabase.from("insights").select("id, question, conclusion, body, status, created_at").eq("workspace_id", s.workspaceId).neq("status", "dismissed").order("created_at", { ascending: false }).limit(50),
    supabase.from("organisation_risk_flags").select("id, kind, severity, summary, organisation_id, organisations(trading_name)").eq("workspace_id", s.workspaceId).eq("status", "needs_review").limit(20),
    supabase.from("trigger_events").select("id, organisation_id, kind, materiality, summary, detected_at, organisations(trading_name)").eq("workspace_id", s.workspaceId).eq("status", "new").order("detected_at", { ascending: false }).limit(30),
  ]);
  return (
    <>
      <PageHeader title="Intelligence" description="Saved analyst insights and items needing judgement. Ask the analyst from the button at the bottom right on any screen." />
      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Insights" eyebrow="From the Intelligence Analyst" className="xl:col-span-2">
          {insights?.length ? (
            <ul className="flex flex-col gap-3">{insights.map((i) => {
              const b = i.body as AnalystOutput;
              return (
                <li key={i.id} className="rounded-neo neo-inset-sm p-4">
                  <div className="flex items-center justify-between gap-2 text-xs text-ink-3"><span>“{i.question}”</span><span className="flex items-center gap-2"><Badge tone={i.status === "saved" ? "positive" : "neutral"} icon={false}>{i.status}</Badge>{relTime(i.created_at)}</span></div>
                  <p className="mt-2 font-medium text-ink">{i.conclusion}</p>
                  {b.next_action && <p className="mt-1 text-sm text-ink-2"><span className="eyebrow mr-1">Next</span>{b.next_action}</p>}
                  {!!b.records?.length && <p className="mt-2 flex flex-wrap gap-2 text-xs">{b.records.map((r) => <Link key={r.id} href={r.type === "organisation" ? `/organisations/${r.id}` : r.type === "draft" ? `/outreach/${r.id}` : "#"} className="text-oxblood hover:underline">{r.label}</Link>)}</p>}
                </li>
              );
            })}</ul>
          ) : <EmptyState icon={<Lightbulb className="h-5 w-5" />} title="No insights yet" body="Ask: “Which five companies should I approach today?”" />}
        </Panel>
        <Panel title="Needs your judgement" eyebrow="Risk flags awaiting review">
          {risks?.length ? <ul className="flex flex-col gap-2 text-sm">{risks.map((r) => <li key={r.id}><Link href={`/organisations/${r.organisation_id}`} className="font-medium hover:text-oxblood">{(r.organisations as unknown as { trading_name: string }).trading_name}</Link><span className="block text-xs text-ink-3">{r.kind.replace(/_/g, " ")} · {r.summary}</span></li>)}</ul> : <p className="text-sm text-ink-3">Nothing flagged.</p>}
        </Panel>
        <Panel title="Triggers" eyebrow="Material changes at monitored organisations · re-checked weekly" className="xl:col-span-3"><TriggerList triggers={(triggers ?? []) as never} /></Panel>
      </div>
    </>
  );
}
