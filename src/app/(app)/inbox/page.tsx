import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { PageHeader } from "@/components/neo/surface";
import { InboxView, type ConvRow, type Thread } from "./inbox-view";

export const metadata = { title: "Inbox" };

function base(supabase: Awaited<ReturnType<typeof createClient>>, ws: string) {
  return supabase.from("conversations").select("id, channel, status, subject, market, latest_classification, needs_review, last_outbound_at, last_inbound_at, updated_at, organisations(id, trading_name, primary_market), contacts(id, full_name)").eq("workspace_id", ws);
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const seg = sp.seg ?? "all";
  const ch = sp.ch ?? "all";
  const m = sp.m ?? "ALL";
  const s = await getSession();
  const supabase = await createClient();
  let q = base(supabase, s.workspaceId);
  if (ch !== "all") q = q.eq("channel", ch);
  if (m === "UK" || m === "IN") q = q.eq("market", m);
  const filters: Record<string, () => void> = {
    new: () => { q = q.eq("needs_review", true); },
    positive: () => { q = q.in("latest_classification", ["positive", "meeting_request"]); },
    neutral: () => { q = q.in("latest_classification", ["neutral", "question", "referral", "out_of_office"]); },
    negative: () => { q = q.in("latest_classification", ["negative", "not_now"]); },
    meetings: () => { q = q.in("status", ["meeting_requested", "meeting_booked"]); },
    awaiting: () => { q = q.eq("status", "awaiting_response"); },
    no_response: () => { q = q.eq("status", "awaiting_response").lt("last_outbound_at", new Date(Date.now() - 7 * 86400_000).toISOString()); },
    opted_out: () => { q = q.in("status", ["opted_out", "do_not_contact"]); },
    closed: () => { q = q.in("status", ["won", "lost", "archived"]); },
  };
  if (seg === "followup") {
    const { data: t } = await supabase.from("tasks").select("conversation_id").eq("workspace_id", s.workspaceId).eq("status", "open").eq("kind", "follow_up").lte("due_at", new Date().toISOString());
    q = q.in("id", (t ?? []).map((x) => x.conversation_id).filter(Boolean) as string[]);
  } else filters[seg]?.();
  if (seg !== "closed" && seg !== "opted_out") q = q.not("status", "in", "(archived)");
  const { data: convs } = await q.order("updated_at", { ascending: false }).limit(200);

  let thread: Thread | null = null;
  const selected = sp.c ?? convs?.[0]?.id;
  if (selected) {
    const [{ data: c }, { data: msgs }, { data: notes }, { data: events }] = await Promise.all([
      supabase.from("conversations").select("id, channel, status, subject, market, latest_classification, needs_review, organisations(id, trading_name, primary_market), contacts(id, full_name, linkedin_url, opted_out_at, contact_organisations(title))").eq("id", selected).eq("workspace_id", s.workspaceId).maybeSingle(),
      supabase.from("conversation_messages").select("id, direction, source, from_value, to_value, subject, body_text, snippet, occurred_at, outbound_message_id, conversation_classifications(id, proposed, final, confidence, rationale)").eq("conversation_id", selected).order("occurred_at"),
      supabase.from("notes").select("id, body, created_at").eq("conversation_id", selected).order("created_at", { ascending: false }),
      supabase.from("conversation_events").select("id, from_status, to_status, actor_type, created_at").eq("conversation_id", selected).order("created_at", { ascending: false }).limit(20),
    ]);
    if (c) {
      const { data: om } = await supabase.from("outbound_messages").select("id, body").in("id", (msgs ?? []).map((x) => x.outbound_message_id).filter(Boolean) as string[]);
      const omBody = new Map((om ?? []).map((o) => [o.id, o.body]));
      thread = { conv: c as unknown as Thread["conv"], messages: (msgs ?? []).map((x) => ({ ...x, body_text: x.body_text ?? (x.outbound_message_id ? omBody.get(x.outbound_message_id) ?? null : null) })) as unknown as Thread["messages"], notes: notes ?? [], events: events ?? [] };
    }
  }
  const { data: gmail } = await supabase.from("channel_accounts").select("status, last_sync_at").eq("workspace_id", s.workspaceId).eq("channel", "gmail").maybeSingle();

  return (
    <>
      <PageHeader title="Inbox" description="One commercial view of every conversation — showing only what each channel can genuinely sync." />
      <InboxView rows={(convs ?? []) as unknown as ConvRow[]} thread={thread} seg={seg} ch={ch} market={m} gmail={gmail ?? null} />
    </>
  );
}
