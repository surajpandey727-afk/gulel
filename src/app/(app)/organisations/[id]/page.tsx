import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { fmtDate, money, relTime } from "@/lib/filters";
import { BAND_LABEL, DIMENSIONS } from "@/lib/scoring/model";
import { CLAIM_FIELDS, FACT_TYPE_LABEL } from "@/lib/orgs/constants";
import { EMAIL_QUALITY_LABEL, type EmailQuality } from "@/lib/contacts/email-quality";
import { DECISION_LABEL } from "@/lib/ai/agents/governance";
import { Badge, MarketBadge, StatusBadge } from "@/components/neo/badge";
import { Gauge, Meter } from "@/components/neo/gauge";
import { EmptyState, Panel } from "@/components/neo/surface";
import { Table, Td, Th, Tr } from "@/components/neo/table";
import { DossierTabs } from "./dossier-tabs";
import { DossierShell, DossierPanel } from "./dossier-shell";
import { CompaniesHouseEnrich } from "./ch-enrich";
import { NewsEnrich } from "./news-enrich";
import { companiesHouseConfigured } from "@/lib/discovery/companies-house";
import { EditContactButton, EditOrganisationButton, EvidenceStatusControl } from "./dossier-edit";
import { AddContactButton, AddEvidenceButton, FindPeopleButton, OverrideButton, PrepareOutreachButton, RediscoverButton, RiskReview, RunQualificationButton, SuppressButton } from "./dossier-actions";

type Ev = { id: string; claim_field: string; claim_text: string; fact_type: keyof typeof FACT_TYPE_LABEL; source_name: string; source_url: string | null; published_at: string | null; retrieved_at: string; excerpt: string | null; confidence: number; is_adverse: boolean; value_numeric: number | null; value_currency: string | null; value_as_of: string | null };

function Source({ e }: { e: Pick<Ev, "source_name" | "source_url" | "published_at" | "retrieved_at" | "confidence" | "fact_type"> }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem] text-ink-3">
      <Badge tone={e.fact_type === "reported_fact" || e.fact_type === "dated_filing" ? "neutral" : "warning"} icon={false}>{FACT_TYPE_LABEL[e.fact_type]}</Badge>
      {e.source_url ? <a href={e.source_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 underline-offset-2 hover:text-ink hover:underline">{e.source_name}<ExternalLink className="h-3 w-3" /></a> : <span>{e.source_name}</span>}
      <span>published {fmtDate(e.published_at)}</span>
      <span>retrieved {fmtDate(e.retrieved_at)}</span>
      <span className="tabular">confidence {Math.round(Number(e.confidence) * 100)}%</span>
    </span>
  );
}

function EvidenceList({ items, empty }: { items: Ev[]; empty: string }) {
  if (!items.length) return <EmptyState title={empty} body="Missing evidence is tracked as unknown — it never counts as a negative finding." />;
  return (
    <ul className="flex flex-col gap-3">
      {items.map((e) => (
        <li key={e.id} className="rounded-neo neo-inset-sm p-3.5">
          <p className="text-sm text-ink">{e.claim_text}{e.value_numeric != null && <span className="tabular ml-2 font-semibold">{e.value_currency ? money(Number(e.value_numeric), e.value_currency as "GBP") : e.value_numeric}</span>}</p>
          {e.excerpt && <blockquote className="mt-1.5 border-l-2 border-hairline pl-3 text-xs italic text-ink-3">“{e.excerpt}”</blockquote>}
          <div className="mt-2"><Source e={e} /></div>
        </li>
      ))}
    </ul>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("organisations").select("trading_name").eq("id", id).maybeSingle();
  return { title: data?.trading_name ?? "Organisation" };
}

export default async function DossierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const supabase = await createClient();
  const ws = session.workspaceId;

  const [{ data: org }, { data: quals }, { data: evidence }, { data: financials }, { data: news }, { data: people }, { data: risks }, { data: strategies }, { data: drafts }, { data: convs }, { data: audit }] = await Promise.all([
    supabase.from("organisations").select("*, organisation_market_profiles(market, currency, presence), organisation_aliases(alias, kind)").eq("id", id).eq("workspace_id", ws).maybeSingle(),
    supabase.from("lead_qualifications").select("*, qualification_dimensions(*)").eq("organisation_id", id).order("version_no", { ascending: false }).limit(10),
    supabase.from("evidence_items").select("*").eq("organisation_id", id).eq("status", "active").order("retrieved_at", { ascending: false }),
    supabase.from("organisation_financials").select("*").eq("organisation_id", id).order("period_end", { ascending: false }),
    supabase.from("organisation_news").select("*").eq("organisation_id", id).order("published_at", { ascending: false }).limit(10),
    supabase.from("contact_organisations").select("title, role_category, buyer_relevance, contacts!inner(id, full_name, market, lawful_basis, notes, verification_status, subscriber_type, outreach_status, opted_out_at, last_interaction_at, linkedin_url, contact_channels(id, channel, value, email_quality, verification_status, verification_method))").eq("organisation_id", id).order("buyer_relevance", { ascending: false }),
    supabase.from("organisation_risk_flags").select("*").eq("organisation_id", id).order("created_at", { ascending: false }),
    supabase.from("outreach_strategies").select("*").eq("organisation_id", id).order("created_at", { ascending: false }).limit(5),
    supabase.from("outreach_drafts").select("id, channel, kind, status, created_at, contacts(full_name), draft_versions!draft_versions_draft_id_fkey(subject, version_no)").eq("organisation_id", id).order("created_at", { ascending: false }),
    supabase.from("conversations").select("id, channel, status, last_outbound_at, last_inbound_at, latest_classification, contacts(full_name)").eq("organisation_id", id),
    supabase.from("audit_logs").select("id, action, actor_type, created_at, metadata").eq("entity_id", id).order("created_at", { ascending: false }).limit(30),
  ]);
  if (!org) notFound();

  const ev = (evidence ?? []) as Ev[];
  const cur = quals?.find((q) => q.is_current);
  const curScore = cur ? Number(cur.override_score ?? cur.score) : null;
  const expl = (cur?.explanation ?? {}) as { why_company?: string[]; why_now?: string; why_nishaan?: string; who_to_approach?: string; whats_missing?: string[]; engagement_signals?: string };
  const evById = new Map(ev.map((e) => [e.id, e]));
  const byGroup = (prefix: string) => ev.filter((e) => e.claim_field.startsWith(prefix));
  const label = (f: string) => CLAIM_FIELDS.find((c) => c.value === f)?.label ?? f;
  const currency = org.primary_market === "UK" ? "GBP" : "INR";
  const newsTop = (news ?? []).slice(0, 3);

  const tabs = [
    { value: "summary", label: "Summary" },
    { value: "financials", label: "Financials", count: (financials ?? []).length },
    { value: "brand", label: "Brand & commercial", count: byGroup("brand.").length + byGroup("commercial.").length },
    { value: "signals", label: "Signals", count: byGroup("signal.").length },
    { value: "news", label: "News", count: newsTop.length },
    { value: "people", label: "People", count: (people ?? []).length },
    { value: "outreach", label: "Outreach", count: (drafts ?? []).length },
    { value: "timeline", label: "Timeline" },
    { value: "evidence", label: "Evidence", count: ev.length },
  ];

  return (
    <DossierShell defaultTab="summary">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/organisations" className="text-xs text-ink-3 hover:text-ink">← Organisations</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{org.trading_name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-3">
            <MarketBadge market={org.primary_market} />
            {(org.organisation_market_profiles as Array<{ market: string }>).filter((m) => m.market !== org.primary_market).map((m) => <MarketBadge key={m.market} market={m.market} />)}
            {org.sector && <span>{org.sector}</span>}
            {org.website && <a href={org.website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-ink">{org.primary_domain}<ExternalLink className="h-3 w-3" /></a>}
            <Badge tone={org.relationship_status === "do_not_contact" ? "critical" : "neutral"} icon={org.relationship_status === "do_not_contact"}>{org.relationship_status.replace(/_/g, " ")}</Badge>
            {org.is_demo && <Badge tone="muted" icon={false}>demo data</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EditOrganisationButton org={{ id, trading_name: org.trading_name, legal_name: org.legal_name, website: org.website, registration_number: org.registration_number, primary_market: org.primary_market, sector: org.sector, sub_sector: org.sub_sector, headquarters: org.headquarters, incorporation_date: org.incorporation_date, operating_status: org.operating_status, employee_count: org.employee_count, employee_count_source: org.employee_count_source, relationship_status: org.relationship_status, description: org.description, markets: (org.organisation_market_profiles as Array<{ market: string }>).map((m) => m.market) }} />
          <RediscoverButton organisationId={id} />
          <AddEvidenceButton organisationId={id} currency={currency} />
          <RunQualificationButton organisationId={id} hasQualification={!!cur} />
          <PrepareOutreachButton organisationId={id} disabled={org.relationship_status === "do_not_contact"} />
        </div>
      </header>

      <DossierTabs tabs={tabs} />

      <div className="mt-5">
        <DossierPanel name="summary">
          <div className="grid gap-6 xl:grid-cols-3">
            <Panel title="Qualification" eyebrow={cur ? `v${cur.version_no} · ${relTime(cur.created_at)}` : "Not yet qualified"} className="xl:col-span-1"
              actions={cur ? <OverrideButton organisationId={id} qualificationId={cur.id} current={curScore!} /> : null}>
              <div className="flex flex-wrap justify-around gap-4 py-2">
                <Gauge value={curScore} label="Qualification" sublabel={cur ? BAND_LABEL[cur.band] : "unknown"} />
                <Gauge value={cur ? Number(cur.coverage) * 100 : null} label="Evidence coverage" size={92} muted />
                <Gauge value={cur ? Number(cur.evidence_confidence) * 100 : null} label="Confidence" size={92} muted />
              </div>
              {cur?.override_score != null && <p className="mt-3 rounded-neo neo-inset-sm p-3 text-xs text-ink-2">Human override from {Math.round(Number(cur.score))} → {Math.round(Number(cur.override_score))}: “{cur.override_reason}”</p>}
              {cur && (
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-neo neo-inset-sm p-3"><dt className="text-ink-3">Engagement propensity</dt><dd className="mt-0.5 font-medium capitalize">{cur.engagement_propensity}</dd><dd className="text-[0.65rem] text-ink-3">heuristic · not calibrated</dd></div>
                  <div className="rounded-neo neo-inset-sm p-3"><dt className="text-ink-3">Advisory affordability</dt><dd className="mt-0.5 font-medium capitalize">{cur.affordability}</dd><dd className="text-[0.65rem] text-ink-3">{(cur.affordability_reasons as string[])[0] ?? ""}</dd></div>
                </dl>
              )}
            </Panel>

            <Panel title="Why this, why now" eyebrow="Explanation" className="xl:col-span-2">
              {cur ? (
                <div className="grid gap-5 md:grid-cols-2">
                  <div><p className="eyebrow mb-2">Why this company?</p><ol className="list-decimal space-y-1.5 pl-4 text-sm text-ink-2">{(expl.why_company ?? []).map((w, i) => <li key={i}>{w}</li>)}</ol></div>
                  <div className="space-y-4 text-sm text-ink-2">
                    <div><p className="eyebrow mb-1">Why now?</p><p>{expl.why_now}</p></div>
                    <div><p className="eyebrow mb-1">Why Nishaan-a?</p><p>{expl.why_nishaan}</p></div>
                    <div><p className="eyebrow mb-1">Who should we approach?</p><p>{expl.who_to_approach}</p></div>
                  </div>
                  <div className="md:col-span-2"><p className="eyebrow mb-2">What is missing?</p>
                    <ul className="flex flex-wrap gap-2">{(expl.whats_missing ?? []).map((m, i) => <li key={i}><Badge tone="warning">{m}</Badge></li>)}</ul></div>
                </div>
              ) : (
                <EmptyState title="Run qualification once you have evidence" body={`${ev.length} evidence item(s) and ${(people ?? []).length} contact(s) on file. The score is computed from cited evidence; unknown dimensions reduce coverage rather than scoring zero.`} />
              )}
            </Panel>

            {cur && (
              <Panel title="Score contribution by dimension" eyebrow="Explainable model" className="xl:col-span-2">
                <ul className="flex flex-col gap-3">
                  {DIMENSIONS.map((d) => {
                    const row = (cur.qualification_dimensions as Array<{ dimension: string; weight: number; raw_score: number | null; freshness_factor: number; contribution: number | null; rationale: string | null; evidence_ids: string[] }>).find((x) => x.dimension === d.key);
                    return (
                      <li key={d.key} className="grid gap-2 md:grid-cols-[220px_1fr_110px] md:items-center">
                        <span className="text-sm text-ink-2">{d.label} <span className="tabular text-xs text-ink-3">· w{row?.weight ?? d.defaultWeight}</span></span>
                        <div>
                          <Meter value={row?.raw_score == null ? null : Number(row.raw_score) * 10} label={row?.raw_score == null ? "Unknown — no supporting evidence" : row.rationale ?? ""} showValue={false} />
                          {row?.evidence_ids?.length ? <p className="mt-1 text-[0.7rem] text-ink-3">Sources: {row.evidence_ids.map((eid) => evById.get(eid)?.source_name ?? "removed").join(", ")}{Number(row.freshness_factor) < 0.95 ? ` · freshness ×${Number(row.freshness_factor).toFixed(2)}` : ""}</p> : null}
                        </div>
                        <span className="tabular text-right text-sm">{row?.raw_score == null ? <span className="text-ink-3">unknown</span> : `${Number(row.raw_score).toFixed(1)}/10`}</span>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            )}

            <Panel title="Risk & diligence" eyebrow="Flags need human review" className="xl:col-span-1">
              {(risks ?? []).length ? <RiskReview organisationId={id} flags={(risks ?? []).map((r) => ({ id: r.id, kind: r.kind, severity: r.severity, summary: r.summary, status: r.status, evidence: r.evidence_id ? evById.get(r.evidence_id)?.source_name ?? null : null }))} />
                : <EmptyState title="No flags" body="A missing record is never treated as an adverse finding." />}
              <div className="mt-4 flex flex-wrap gap-2"><SuppressButton kind="organisation" value={id} label="Mark do-not-contact" path={`/organisations/${id}`} /></div>
            </Panel>

            <Panel title="Corporate identity" eyebrow="Identity" className="xl:col-span-3">
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Legal name", org.legal_name], ["Registration", org.registration_number ? `${org.registration_jurisdiction} · ${org.registration_number}` : null],
                  ["Status", org.operating_status], ["Incorporated", org.incorporation_date ? fmtDate(org.incorporation_date) : null],
                  ["Headquarters", org.headquarters], ["Employees", org.employee_count ? `${org.employee_count} (${org.employee_count_source ?? "source?"}, ${fmtDate(org.employee_count_as_of)})` : null],
                  ["Aliases", (org.organisation_aliases as Array<{ alias: string }>).map((a) => a.alias).join(", ") || null], ["Needs", (org.needs as string[]).map((n) => n.replace(/_/g, " ")).join(", ") || null],
                ].map(([k, v]) => <div key={k as string}><dt className="text-xs text-ink-3">{k}</dt><dd className="mt-0.5 text-ink-2">{v ?? <span className="text-ink-3">Unknown</span>}</dd></div>)}
              </dl>
              {org.primary_market === "UK" && <div className="mt-4"><CompaniesHouseEnrich organisationId={id} configured={companiesHouseConfigured()} /></div>}
              <div className="mt-4"><EvidenceList items={byGroup("identity.").concat(byGroup("diligence."))} empty="No identity evidence yet" /></div>
            </Panel>
          </div>
        </DossierPanel>

        <DossierPanel name="financials">
          <Panel title="Financial standing" eyebrow={`Values in original currency · ${currency} market`}>
            {(financials ?? []).length ? (
              <Table>
                <thead><tr><Th>Metric</Th><Th>Period</Th><Th className="text-right">Amount</Th><Th>Fact type</Th><Th>Source</Th></tr></thead>
                <tbody>{(financials ?? []).map((f) => { const e = f.evidence_id ? evById.get(f.evidence_id) : null; return (
                  <Tr key={f.id}><Td className="capitalize">{f.metric.replace(/_/g, " ")}</Td><Td>{fmtDate(f.period_end)}</Td><Td className="tabular text-right font-medium text-ink">{f.currency ? money(Number(f.amount), f.currency) : f.amount}</Td>
                    <Td><Badge tone={f.fact_type === "reported_fact" || f.fact_type === "dated_filing" ? "neutral" : "warning"} icon={false}>{FACT_TYPE_LABEL[f.fact_type as keyof typeof FACT_TYPE_LABEL]}</Badge></Td>
                    <Td className="text-xs">{e ? (e.source_url ? <a className="underline-offset-2 hover:underline" href={e.source_url} target="_blank" rel="noreferrer">{e.source_name}</a> : e.source_name) : "—"}</Td></Tr>); })}</tbody>
              </Table>
            ) : <EmptyState title="No financial evidence" body="Estimates are stored as third-party estimates and never shown as verified facts. Companies House and MCA adapters arrive in Phase 2." />}
          </Panel>
        </DossierPanel>

        <DossierPanel name="brand"><Panel title="Brand & commercial analysis"><EvidenceList items={byGroup("brand.").concat(byGroup("commercial."))} empty="No brand or commercial observations yet" /></Panel></DossierPanel>
        <DossierPanel name="signals"><Panel title="Buying signals" eyebrow="Signals carry strength and uncertainty — not proof of buying"><EvidenceList items={byGroup("signal.")} empty="No signals recorded" /></Panel></DossierPanel>

        <DossierPanel name="news">
          <Panel title="Latest relevant news" eyebrow={`${newsTop.length} of up to 3 · independent sources prioritised`} actions={<NewsEnrich organisationId={id} orgName={org.trading_name} orgWebsite={org.website} orgMarket={org.primary_market} />}>
            {newsTop.length ? (
              <ul className="grid gap-4 md:grid-cols-3">{newsTop.map((n) => (
                <li key={n.id} className="flex flex-col gap-2 rounded-neo neo-inset-sm p-4">
                  <Badge tone={n.is_press_release ? "warning" : "neutral"} icon={false} className="self-start">{n.is_press_release ? "Company press release" : "Third-party reporting"}</Badge>
                  <a href={n.url} target="_blank" rel="noreferrer noopener" className="font-medium text-ink hover:text-oxblood">{n.headline}</a>
                  <span className="text-xs text-ink-3">{n.publisher} · {fmtDate(n.published_at)}</span>
                  {n.summary && <p className="text-sm text-ink-2">{n.summary}</p>}
                  {n.commercial_relevance && <p className="text-xs text-ink-2"><span className="eyebrow mr-1">Why it matters</span>{n.commercial_relevance}</p>}
                  {n.advisory_implication && <p className="text-xs text-ink-2"><span className="eyebrow mr-1">Advisory angle</span>{n.advisory_implication}</p>}
                </li>))}</ul>
            ) : <EmptyState title="No articles recorded" body="Add news as evidence (type “News”). Fewer than three is shown as the actual number found — no articles are invented." />}
          </Panel>
        </DossierPanel>

        <DossierPanel name="people">
          <Panel title="People & decision-makers" eyebrow="Named people ranked above generic inboxes" actions={<span className="flex items-center gap-2"><FindPeopleButton organisationId={id} /><AddContactButton organisationId={id} market={org.primary_market} /></span>}>
            {(people ?? []).length ? (
              <ul className="flex flex-col gap-3">
                {(people ?? []).map((p) => {
                  const c = p.contacts as unknown as { id: string; full_name: string; market: string | null; lawful_basis: string; notes: string | null; verification_status: string; subscriber_type: string; outreach_status: string; opted_out_at: string | null; linkedin_url: string | null; contact_channels: Array<{ id: string; channel: string; value: string; email_quality: EmailQuality | null; verification_status: string; verification_method: string | null }> };
                  return (
                    <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 rounded-neo neo-inset-sm p-4">
                      <div className="min-w-0">
                        <Link href={`/people/${c.id}`} className="font-medium text-ink hover:text-oxblood">{c.full_name}</Link>
                        <p className="text-xs text-ink-3">{p.title ?? "Title unknown"} · buyer relevance <span className="tabular">{p.buyer_relevance ?? "—"}</span></p>
                        <ul className="mt-2 flex flex-col gap-1">
                          {c.contact_channels.map((ch) => (
                            <li key={ch.id} className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-mono text-ink-2">{ch.value}</span>
                              <StatusBadge status={ch.verification_status} />
                              {ch.email_quality && <Badge tone={ch.email_quality === "personal_named" ? "positive" : ch.email_quality === "role_generic" ? "warning" : "neutral"}>{EMAIL_QUALITY_LABEL[ch.email_quality]}</Badge>}
                            </li>
                          ))}
                          {!c.contact_channels.length && <li className="text-xs text-ink-3">No contact channel — missing contact</li>}
                        </ul>
                      </div>
                      <div className="flex items-center gap-2">
                        {c.opted_out_at ? <Badge tone="critical">opted out</Badge> : <SuppressButton kind="contact" value={c.id} label="Opt out" path={`/organisations/${id}`} small />}
                        <Badge tone="neutral" icon={false}>{c.subscriber_type} subscriber</Badge>
                        <EditContactButton organisationId={id} contact={{ id: c.id, full_name: c.full_name, title: p.title, market: c.market, subscriber_type: c.subscriber_type, lawful_basis: c.lawful_basis, notes: c.notes, channels: c.contact_channels.map((ch) => ({ id: ch.id, channel: ch.channel, value: ch.value, verification_status: ch.verification_status })) }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : <EmptyState title="No people yet" body="Add the relevant buyer — founder, CMO, CCO, brand or strategy lead — rather than generic seniority." />}
          </Panel>
        </DossierPanel>

        <DossierPanel name="outreach">
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Governance decisions" eyebrow="Is outreach justified?">
              {(strategies ?? []).length ? (
                <ul className="flex flex-col gap-3">{(strategies ?? []).map((s) => (
                  <li key={s.id} className="rounded-neo neo-inset-sm p-3.5 text-sm">
                    <div className="flex items-center justify-between gap-2"><Badge tone={s.decision === "outreach_recommended" ? "positive" : "warning"}>{DECISION_LABEL[s.decision as keyof typeof DECISION_LABEL]}</Badge><span className="text-xs text-ink-3">{relTime(s.created_at)}</span></div>
                    <p className="mt-2 text-ink-2">{(s.reasoning as { decision_rationale?: string }).decision_rationale ?? s.strategic_problem}</p>
                  </li>))}</ul>
              ) : <EmptyState title="No governance review yet" body="“Prepare outreach” asks Governance AI whether an approach is commercially justified before drafting." />}
            </Panel>
            <Panel title="Drafts">
              {(drafts ?? []).length ? (
                <ul className="flex flex-col gap-2">{(drafts ?? []).map((d) => {
                  const vs = d.draft_versions as unknown as Array<{ subject: string | null; version_no: number }>;
                  const latest = vs.sort((a, b) => b.version_no - a.version_no)[0];
                  return (
                    <li key={d.id}><Link href={`/outreach/${d.id}`} className="flex items-center justify-between gap-3 rounded-neo px-2 py-2 hover:bg-raised/70">
                      <span className="min-w-0"><span className="block truncate text-sm font-medium">{latest?.subject ?? (d.channel === "linkedin" ? "LinkedIn message" : "(no subject)")}</span><span className="text-xs text-ink-3">{(d.contacts as unknown as { full_name: string } | null)?.full_name ?? "—"} · {d.channel} · v{latest?.version_no}</span></span>
                      <StatusBadge status={d.status === "awaiting_approval" ? "pending" : d.status} label={d.status.replace(/_/g, " ")} />
                    </Link></li>);
                })}</ul>
              ) : <EmptyState title="No drafts" />}
            </Panel>
          </div>
        </DossierPanel>

        <DossierPanel name="timeline">
          <Panel title="Timeline" eyebrow="Research, outreach and relationship events">
            <ol className="relative flex flex-col gap-4 border-l border-hairline pl-5">
              {[
                { at: org.created_at, text: "Organisation record created", kind: "record" },
                ...ev.map((e) => ({ at: e.retrieved_at, text: `Evidence added: ${label(e.claim_field)} — ${e.claim_text.slice(0, 90)}`, kind: "evidence" })),
                ...(quals ?? []).map((q) => ({ at: q.created_at, text: `Qualified v${q.version_no}: ${Math.round(Number(q.score))} (${BAND_LABEL[q.band]})`, kind: "qualification" })),
                ...(strategies ?? []).map((s) => ({ at: s.created_at, text: `Governance: ${DECISION_LABEL[s.decision as keyof typeof DECISION_LABEL]}`, kind: "governance" })),
                ...(convs ?? []).flatMap((c) => [c.last_outbound_at && { at: c.last_outbound_at, text: `Message sent via ${c.channel} to ${(c.contacts as unknown as { full_name: string } | null)?.full_name ?? "contact"}`, kind: "outreach" }, c.last_inbound_at && { at: c.last_inbound_at, text: `Reply received${c.latest_classification ? ` (${c.latest_classification.replace(/_/g, " ")})` : ""}`, kind: "reply" }].filter(Boolean) as Array<{ at: string; text: string; kind: string }>),
                ...(audit ?? []).filter((a) => a.action !== "organisation.created").map((a) => ({ at: a.created_at, text: a.action.replace(/[._]/g, " "), kind: "audit" })),
              ].sort((a, b) => +new Date(b.at) - +new Date(a.at)).map((t, i) => (
                <li key={i} className="relative text-sm"><span className="absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full bg-oxblood ring-4 ring-canvas" aria-hidden />
                  <span className="text-ink-2">{t.text}</span><span className="block text-xs text-ink-3">{fmtDate(t.at)} · {t.kind}</span></li>
              ))}
            </ol>
          </Panel>
        </DossierPanel>

        <DossierPanel name="evidence">
          <Panel title="All evidence" eyebrow="Every substantive claim with provenance" actions={<AddEvidenceButton organisationId={id} currency={currency} small />}>
            {ev.length ? (
              <Table>
                <thead><tr><Th>Field</Th><Th>Claim</Th><Th>Type</Th><Th>Source</Th><Th>Published</Th><Th className="text-right">Conf.</Th><Th>Status</Th></tr></thead>
                <tbody>{ev.map((e) => (
                  <Tr key={e.id}><Td className="whitespace-nowrap text-xs">{label(e.claim_field)}</Td><Td className="max-w-md text-ink">{e.claim_text}</Td>
                    <Td><Badge tone={e.fact_type === "reported_fact" || e.fact_type === "dated_filing" ? "neutral" : "warning"} icon={false}>{FACT_TYPE_LABEL[e.fact_type]}</Badge></Td>
                    <Td className="text-xs">{e.source_url ? <a href={e.source_url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">{e.source_name}</a> : e.source_name}</Td>
                    <Td className="whitespace-nowrap text-xs">{fmtDate(e.published_at)}</Td><Td className="tabular text-right">{Math.round(Number(e.confidence) * 100)}%</Td><Td><EvidenceStatusControl evidenceId={e.id} organisationId={id} /></Td></Tr>
                ))}</tbody>
              </Table>
            ) : <EmptyState title="No evidence yet" body="Add sourced claims. Inferences are allowed but labelled as such." />}
          </Panel>
        </DossierPanel>
      </div>
    </DossierShell>
  );
}
