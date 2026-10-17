import Link from "next/link";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { relTime } from "@/lib/filters";
import { EMAIL_QUALITY_LABEL, type EmailQuality } from "@/lib/contacts/email-quality";
import { EmptyState } from "@/components/neo/surface";
import { AnimatedPageHeader } from "@/components/reactbits/animated-header";
import { Badge, MarketBadge, StatusBadge } from "@/components/neo/badge";
import { Table, Td, Th, Tr } from "@/components/neo/table";
import { SearchBox } from "@/components/shell/search-box";
import { DiscoverPeopleButton } from "./people-actions";

export const metadata = { title: "People" };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  const { q, filter } = await searchParams;
  const s = await getSession();
  const supabase = await createClient();
  let query = supabase.from("contacts").select("id, full_name, market, verification_status, outreach_status, last_interaction_at, opted_out_at, is_demo, contact_organisations(title, buyer_relevance, organisations(id, trading_name)), contact_channels(channel, value, email_quality, verification_status)").eq("workspace_id", s.workspaceId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(300);
  if (q) query = query.ilike("full_name", `%${q}%`);
  const { data } = await query;
  type Ch = { channel: string; value: string; email_quality: EmailQuality | null; verification_status: string };
  let rows = data ?? [];
  if (filter === "unverified") rows = rows.filter((r) => (r.contact_channels as Ch[]).some((c) => c.channel === "email" && c.verification_status !== "verified"));
  if (filter === "generic") rows = rows.filter((r) => (r.contact_channels as Ch[]).some((c) => c.email_quality === "role_generic"));
  return (
    <>
      <AnimatedPageHeader title="People" description="Decision-makers and relationships. Named business emails rank above generic inboxes; unverified addresses need review before use." />
      <div className="mb-4 flex flex-wrap items-center gap-3"><SearchBox placeholder="Search people…" /><DiscoverPeopleButton />
        {filter && <Link href="/people" className="text-xs text-oxblood hover:underline">Clear filter: {filter}</Link>}</div>
      {!rows.length ? <EmptyState icon={<Users className="h-5 w-5" />} title="No people" body="Add people from an organisation dossier or import your workbook." /> : (
        <Table>
          <thead><tr><Th>Name</Th><Th>Role · organisation</Th><Th>Market</Th><Th>Best email</Th><Th>Phone</Th><Th>Verification</Th><Th>Outreach</Th><Th>Last interaction</Th></tr></thead>
          <tbody>{rows.map((r) => {
            const co = (r.contact_organisations as unknown as Array<{ title: string | null; buyer_relevance: number | null; organisations: { id: string; trading_name: string } }>)[0];
            const channels = r.contact_channels as Ch[];
            const email = channels.filter((c) => c.channel === "email").sort((a, b) => (a.email_quality === "personal_named" ? -1 : 0) - (b.email_quality === "personal_named" ? -1 : 0))[0];
            const phone = channels.find((c) => c.channel === "phone");
            return (
              <Tr key={r.id}>
                <Td><Link href={`/people/${r.id}`} className="font-medium text-ink hover:text-oxblood">{r.full_name}</Link>{r.is_demo && <Badge tone="muted" icon={false} className="ml-2">demo</Badge>}</Td>
                <Td className="text-xs">{co?.title ?? "—"}<span className="block text-ink-3">{co?.organisations?.trading_name}</span></Td>
                <Td><MarketBadge market={r.market} /></Td>
                <Td className="text-xs">{email ? <><span className="font-mono">{email.value}</span>{email.email_quality && <span className="block text-ink-3">{EMAIL_QUALITY_LABEL[email.email_quality]}</span>}</> : <span className="text-ink-3">missing</span>}</Td>
                <Td className="text-xs font-mono">{phone ? phone.value : <span className="text-ink-3">—</span>}</Td>
                <Td><StatusBadge status={r.verification_status} /></Td>
                <Td>{r.opted_out_at ? <Badge tone="critical">opted out</Badge> : <span className="text-xs capitalize">{r.outreach_status.replace(/_/g, " ")}</span>}</Td>
                <Td className="text-xs text-ink-3">{relTime(r.last_interaction_at)}</Td>
              </Tr>
            );
          })}</tbody>
        </Table>
      )}
    </>
  );
}
