# Nishaan-a OS — Architecture Blueprint

> Operating philosophy: **AI researches and prepares. The human authorises and communicates.**
> Status: living document. Version 0.1 — 2026-10-14.

---

## A. Technical architecture

### A1. System overview

```text
                        ┌──────────────────────────────────────────────────┐
  Browser / PWA  ──────▶│ Next.js 15 (App Router, RSC, Server Actions)     │
  (no secrets)          │  ├─ UI (neomorphic design system)                │
                        │  ├─ Route handlers  /api/*  (Node runtime)       │
                        │  │    ├─ AI Provider Gateway  (server-only)      │
                        │  │    ├─ Execution Gateway    (deterministic)    │
                        │  │    ├─ Gmail adapter        (OAuth, server)    │
                        │  │    └─ Job worker endpoint  (cron-invoked)     │
                        │  └─ Supabase SSR client (user JWT → RLS)         │
                        └───────────────┬──────────────────────────────────┘
                                        │ PostgREST / SQL (RLS)  +  service role (server only)
                        ┌───────────────▼──────────────────────────────────┐
                        │ Supabase                                          │
                        │  ├─ Auth (email magic link / password, future SSO)│
                        │  ├─ Postgres 15 (single database, RLS everywhere) │
                        │  │    ├─ domain tables   ├─ jobs queue (SKIP LOCKED)
                        │  │    ├─ audit_logs      ├─ approval fingerprints │
                        │  │    └─ pgcrypto / Vault for credential secrets  │
                        │  ├─ Storage (imports, writing-sample attachments) │
                        │  ├─ pg_cron → pg_net → /api/jobs/tick             │
                        │  └─ Realtime (approvals queue, inbox badges)      │
                        └──────────────────────────────────────────────────┘
        External:  Anthropic Messages API · Gmail API · Companies House API ·
                   (future) OmniRoute gateway, MCA data vendor, news APIs
```

**Key decisions**

| Decision | Choice | Why |
|---|---|---|
| Server runtime for workflows | Next.js route handlers (Node) + Postgres job queue | Gmail OAuth refresh, Anthropic streaming and xlsx parsing need Node; Edge Functions' 150s wall clock is too tight for research jobs. Supabase stays the only database. Edge Functions are reserved for webhook ingress (Gmail Pub/Sub push) in Phase 2. |
| Queue | `jobs` table, `FOR UPDATE SKIP LOCKED`, idempotency key unique index | Durable, inspectable, no second datastore. pg_cron ticks the worker every minute. |
| Secrets | App-layer AES-256-GCM (`CREDENTIALS_ENCRYPTION_KEY` env, server only) for user-entered keys; OAuth tokens encrypted the same way; never selectable by `authenticated` role | Keys never reach the browser, prompts or logs. Supabase Vault is a drop-in alternative. |
| LLM | Anthropic only by default, via `@anthropic-ai/sdk`; per-agent model config; no cross-provider fallback unless an admin enables a provider **and** the agent's `allow_fallback` flag | Spec §2. |
| Determinism | Approval validity, suppression, dedupe, rate caps, state transitions enforced in SQL constraints/functions — not by the LLM | Spec §20. |

### A2. Module map

```text
src/
  app/
    (auth)/login              Supabase auth
    (app)/                    authenticated shell (nav, filters, copilot)
      overview  discovery  organisations/[id]  people/[id]  qualification
      outreach  approvals  inbox  pipeline  intelligence  analytics
      tasks  data  settings/*  onboarding/voice
    api/
      ai/test               provider connection test
      gmail/oauth/{start,callback}  gmail/sync
      execute/send          the ONLY path that sends externally
      jobs/tick             queue worker (cron, shared secret)
  lib/
    supabase/{server,client,admin}.ts
    crypto.ts               AES-GCM for credentials
    ai/gateway.ts           provider registry, model resolution, cost metering
    ai/agents/*.ts          Discovery, Governance, Analyst, VoiceDNA (prompts + zod schemas)
    scoring/                deterministic weighted model
    contacts/email-quality.ts  named-person vs role-inbox classification
    channels/registry.ts    capability declarations
    channels/gmail.ts       Gmail adapter
    execution/gateway.ts    approval + pre-flight checks + idempotent send
    import/                 xlsx/csv parse, mapping proposal, normalisation, entity resolution
  components/neo/*          design-system primitives
supabase/migrations/*.sql
```

---

## B. Agent responsibility matrix

| Agent | Trigger | Reads | Writes | Tools (enforced server-side) | Prohibited |
|---|---|---|---|---|---|
| **Discovery AI** | discovery run job | campaign config, source records | `discovery_signals`, `evidence_items`, `organisations` (via resolver), `contacts` (candidate only) | source adapters, web fetch (Phase 2), resolver | any write to drafts / messages; marking contacts verified |
| **Governance AI** | user "Prepare outreach" or post-qualification job | org dossier, evidence, qualification, contacts, prior conversations, suppression, Voice DNA | `outreach_strategies`, `outreach_drafts`, `draft_versions`, `approval_requests(pending)` | none that cause external effects | creating approvals in `approved` state; calling execution gateway |
| **Intelligence Analyst** | copilot question | read-only views (`v_kpis`, pipeline, conversations) | `insights` | SQL read views only | mutating financials, drafts or sending |
| **Voice DNA extractor** | onboarding submission / correction | `writing_samples` | `voice_profiles`, `voice_profile_versions` | none | — |
| **Execution Gateway** (deterministic, not an LLM) | user clicks *Send* on an approved item | approval, draft version, suppression, conversations | `send_jobs`, `send_attempts`, `outbound_messages`, `audit_logs` | Gmail API | any LLM call; sending without a valid fingerprint match |

Same Claude model may back several agents; separation is by system prompt, input scope and the tool/DB permission set the server grants.

---

## C. Integration feasibility matrix

| Integration | Phase | Feasible via API? | Notes / constraints |
|---|---|---|---|
| Anthropic Messages API | 1 | ✅ | Key provided is **org-level (not workspace-scoped)** → requires `anthropic-workspace-id` header. Gateway supports it; need the workspace ID or a workspace-scoped key. |
| Gmail (OAuth, drafts, send, threads, history sync) | 1 | ✅ | Scopes: `gmail.compose`, `gmail.readonly`, `gmail.send` (restricted scopes ⇒ Google verification for >100 users; fine for a single-founder "testing" app). Needs a Google Cloud OAuth client. |
| LinkedIn messaging | 1 | ⚠️ Manual handoff only | No public API for member messaging. We copy + open profile + manual confirm. Adapter slot for future partner access. No scraping. |
| Companies House (UK) | 2 | ✅ free API key | Company profile, officers, filing history, charges, insolvency. |
| MCA21 (India) | 2 | ⚠️ | No open API; licensed vendors (e.g. Tofler, Probe42) or manual entry. Adapter interface only until a licence is chosen. |
| News | 2 | ✅ (licensed) | Anthropic web search tool or a news API; store headline/link/date + our summary only. |
| Google Ads Transparency / Meta Ad Library | 2 | ⚠️ / ✅ | Meta Ad Library API requires identity verification; Google has no official API — manual URL capture. |
| Public tenders (Contracts Finder UK, GeM/CPPP India) | 2 | ✅ / ⚠️ | Contracts Finder has an API; Indian portals are mostly manual/RSS. |
| Email verification | 2 | ✅ (vendor) | SMTP-probe vendors (e.g. ZeroBounce). Never pattern-guess and mark verified. |
| OmniRoute gateway | 4 | ✅ | Stored as a provider connection, disabled by default. |

---

## D. End-to-end data flow

```text
Signal/Import ─▶ source_records ─▶ entity resolution ─▶ organisations (+aliases, market_profiles)
      │                                      │
      └──▶ evidence_items (claim, url, dates, confidence, licence, expiry) ◀──┘
                                             │
                         qualification engine (deterministic weights + AI-proposed dimension
                         scores, each citing evidence ids)  ─▶ lead_qualifications (versioned)
                                             │
                         Governance AI decision ─▶ outreach_strategies (decision enum)
                                             │ outreach_recommended
                                             ▼
                         outreach_drafts ─▶ draft_versions (immutable, sha256 fingerprint)
                                             │
                         approval_requests ── approve(fingerprint, recipient, channel, account)
                                             │
                         Execution Gateway pre-flight ─▶ send_jobs (idempotency key) ─▶ Gmail
                                             │
                         outbound_messages(provider_message_id, thread_id) ─▶ conversations
                                             │
                         Gmail sync ─▶ conversation_messages ─▶ reply classification (reviewable)
                                             │
                         analytics views (person-level & message-level, per market/currency)
```

---

## E. Workflow state machines

### E1. Draft / approval / send

```text
draft_versions are immutable rows. outreach_drafts.current_version_id points at the latest.

approval_requests.status:
  pending ──approve──▶ approved ──execute──▶ consumed
     │                    │
     │                    └──(new draft version | recipient/channel change)──▶ invalidated
     ├──reject──▶ rejected
     └──snooze──▶ snoozed ──(time)──▶ pending

Approval row stores: draft_version_id, content_fingerprint = sha256(channel|account|to|subject|body),
recipient_contact_channel_id, channel, sending_account_id, approved_by, approved_at.
A DB trigger invalidates approvals when outreach_drafts.current_version_id changes.

send_jobs.status: queued → sending → sent | failed(retryable) → dead
  unique(idempotency_key = approval_id)  ⇒ one send per approval, ever.
```

### E2. Conversation lifecycle

```text
not_contacted → drafted → awaiting_approval → approved → sent → awaiting_response → replied
 → qualified_conversation → meeting_requested → meeting_booked → opportunity → proposal
 → won | lost | nurture
side states: bounced, failed, deferred, opted_out, invalid_contact, do_not_contact
```
Transitions recorded in `conversation_events`; LinkedIn `sent` only after manual confirmation.

### E3. Jobs
`queued → running → succeeded | failed → (retry with backoff, max_attempts) → dead_letter`
Every job: `correlation_id`, `idempotency_key`, `attempts`, `run_after`, `locked_at`, `cost_cents`, `error`.

---

## F. Trust & permission boundaries

1. **Browser** — holds only the Supabase user session (httpOnly cookies). No provider keys, no OAuth tokens.
2. **Next.js server** — decrypts credentials in-memory per request; never logs them; redaction in logger.
3. **Postgres RLS** — every domain table has `workspace_id`; policy `is_workspace_member(workspace_id)`. Secret columns live in `*_secrets` tables with **no** policies for `authenticated` (service role only).
4. **LLM boundary** — external content is wrapped in `<untrusted_evidence>` blocks with an explicit instruction that it is data; agent outputs are zod-validated before insert; agents have no tools that cause external effects.
5. **Execution boundary** — the only code path that calls `gmail.users.messages.send` is `lib/execution/gateway.ts`, which requires a `consumed`-able approval whose fingerprint matches the current version.

---

## G. Infrastructure & deployment topology

- **Dev:** local Supabase (Docker) + `next dev`. Migrations in `supabase/migrations`.
- **Prod:** Vercel (or Render) for Next.js; Supabase cloud project `pseaaaltdzbzlpdlsjkv` (eu). pg_cron calls `/api/jobs/tick` with `JOBS_SECRET`.
- **Environments:** `.env.local` (never committed). See `docs/OPERATIONS.md`.

---

## H. Risks, constraints, alternatives

| Risk | Mitigation |
|---|---|
| LinkedIn automation is not permitted | Manual handoff; capability registry prevents UI from implying sends. |
| Gmail restricted scopes need Google verification at scale | Keep app in "testing" with founder as test user; plan verification before team rollout. |
| Indian company data access | Vendor adapter; manual entry with provenance meanwhile. |
| Font files sourced from a free font site (Fontsgeek readme) | Confirm a commercial ITC Avant Garde Gothic web licence from Monotype before public deployment. |
| Score credibility with little data | Bands labelled as operating thresholds; propensity flagged heuristic until n ≥ 200 outcomes. |
| PECR: individual subscribers (sole traders, partnerships) need consent for email marketing | Compliance check classifies recipient entity type; blocks individual-subscriber email without consent record. |
| Generic inboxes (info@, hello@) respond poorly | Email-quality classifier ranks named-person addresses first; generic inboxes only as flagged fallback. |
