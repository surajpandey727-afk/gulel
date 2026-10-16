import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { runStructured } from "@/lib/ai/gateway";
import { NISHAANA_CONTEXT, UNTRUSTED_DATA_RULE } from "@/lib/ai/agents/shared";
import { normaliseUrlForCompare } from "./filters";
import { normaliseUrl } from "@/lib/import/normalise";

const NewsItemSchema = z.object({
  headline: z.string(),
  publisher: z.string(),
  published_at: z.string().describe("YYYY-MM-DD"),
  url: z.string(),
  is_press_release: z.boolean(),
  summary: z.string().describe("2-3 sentence summary of the article."),
  commercial_relevance: z.string().describe("Why this matters for a consulting/advisory firm targeting this organisation — one sentence."),
  advisory_implication: z.string().describe("What advisory service or intervention this news suggests — one sentence."),
  syndication_group: z.string().nullable().describe("If multiple articles cover the same event, a shared slug (e.g. 'acme-series-b-2026'). Null if unique."),
});

const NewsResultSchema = z.object({
  articles: z.array(NewsItemSchema),
  notes: z.string(),
});

const SYSTEM = `You are News Intelligence for Nishaan-a OS. ${NISHAANA_CONTEXT}
Search the web for recent, commercially relevant news about the given organisation.
Focus on signals that indicate advisory or consulting needs: funding rounds, acquisitions, leadership changes, market expansion, restructuring, regulatory challenges, product launches, strategic pivots.
Rules:
- Every article must be backed by a URL you actually retrieved in this session.
- Never fabricate headlines, dates, publishers or URLs.
- published_at must be a real date from the article, not today's date unless the article is from today.
- Prefer independent reporting and named publications over generic aggregators.
- is_press_release: true only for content clearly authored or distributed by the company itself.
- commercial_relevance: explain why a strategic advisory firm would care about this news.
- advisory_implication: name the specific type of advisory engagement this could lead to (e.g. "M&A integration support", "market entry strategy", "board effectiveness review").
- syndication_group: group articles covering the same underlying event under one slug. Null if unique.
- Prefer the last 12 months. Exclude job postings, routine product updates, and minor social media activity.
- You must not prepare or suggest any outreach message.
${UNTRUSTED_DATA_RULE}`;

export interface NewsEnrichmentResult {
  inserted: number;
  skipped: number;
  costUsd: number;
  executionId: string;
}

export async function enrichOrganisationNews(
  workspaceId: string,
  userId: string,
  organisationId: string,
  orgName: string,
  orgWebsite?: string | null,
  orgMarket?: string | null,
): Promise<NewsEnrichmentResult> {
  const res = await runStructured({
    workspaceId,
    agent: "taftish",
    system: SYSTEM,
    schema: NewsResultSchema,
    userId,
    maxTokens: 8000,
    webSearch: { maxUses: 5 },
    input: [
      `Today is ${new Date().toISOString().slice(0, 10)}.`,
      `Find recent news articles about: ${orgName}`,
      orgWebsite ? `Website: ${orgWebsite}` : "",
      orgMarket ? `Market: ${orgMarket === "UK" ? "United Kingdom" : "India"}` : "",
      "Return up to 10 articles, most commercially relevant first.",
    ].filter(Boolean).join("\n"),
  });

  const seen = new Set(res.searchedUrls.map(normaliseUrlForCompare));
  const verified = res.data.articles.filter((a) => seen.has(normaliseUrlForCompare(a.url)));

  const supabase = await createClient();

  let inserted = 0;
  for (const article of verified) {
    const url = normaliseUrl(article.url);
    if (!url) continue;

    const { data: ev } = await supabase.from("evidence_items").insert({
      workspace_id: workspaceId,
      organisation_id: organisationId,
      claim_field: article.is_press_release ? "news.press_release" : "news.article",
      claim_text: article.headline,
      fact_type: "reported_fact" as const,
      source_name: article.publisher,
      source_url: url,
      published_at: article.published_at,
      excerpt: article.summary,
      confidence: 0.7,
      created_by_type: "agent",
      created_by: userId,
    }).select("id").single();

    if (!ev) continue;

    const { error: newsErr } = await supabase.from("organisation_news").insert({
      workspace_id: workspaceId,
      organisation_id: organisationId,
      headline: article.headline,
      publisher: article.publisher,
      published_at: article.published_at.slice(0, 10),
      url,
      is_press_release: article.is_press_release,
      summary: article.summary,
      commercial_relevance: article.commercial_relevance,
      advisory_implication: article.advisory_implication,
      syndication_group: article.syndication_group,
      evidence_id: ev.id,
    });

    if (!newsErr) inserted++;
  }

  return {
    inserted,
    skipped: verified.length - inserted,
    costUsd: res.costUsd,
    executionId: res.executionId,
  };
}
