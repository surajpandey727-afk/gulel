# Phase 1 — Functional Outreach Foundation (implementation spec)

Goal: one complete, real, end-to-end workflow:
**Voice DNA → import/enter organisation → dossier + evidence → explainable qualification → Governance draft (in founder voice) → approval bound to exact content → deterministic Gmail send (once) → reply sync → classified → visible on Overview & timeline.** LinkedIn runs the same path with a manual handoff.

## 1. Scope

| # | Capability | Done when |
|---|---|---|
| 1 | Auth + single workspace | Founder signs in; a workspace and owner membership are created on first login; RLS isolates by workspace. |
| 2 | AI Provider Gateway | Add/rotate/deactivate Anthropic key (encrypted, masked), optional workspace-id header, test connection, per-agent model + monthly cost cap, every execution logged with provider/model/tokens/cost. OmniRoute connection can be stored but stays disabled. |
| 3 | Voice DNA onboarding | First visit redirects to `/onboarding/voice`; samples saved; Claude extracts a structured profile + compact prompt; versioned; edits can be saved as preferences; rollback. |
| 4 | Import (XLSX/CSV) | Upload → sheet pick → AI-free heuristic header mapping proposal → user confirms → normalise → entity resolution (domain, reg no., normalised name + market) → preview of create/merge/skip → commit as a batch → row-level errors → batch reversal. |
| 5 | Organisations & People | Canonical org + market profiles (UK/GBP, IN/INR), aliases, contacts with channels, verification status (verified/candidate/missing), **email quality (named person > role inbox)**. Manual entry forms. |
| 6 | Dossier | Tabs: Summary, Financials, Signals, News, People, Outreach, Timeline, Evidence. Every claim row shows source, dates, confidence, fact-type (reported / filing / estimate / inference / unknown). |
| 7 | Qualification | Configurable weights (sum 100), dimension scores 0–10 with evidence ids, coverage tracked separately (missing ≠ 0), evidence confidence, propensity (heuristic label), risk flags, band, why-company/why-now/why-Nishaan-a/who/what's-missing; versioned; override with mandatory reason. |
| 8 | Governance AI | Decision first (6 outcomes). Only `outreach_recommended` produces a draft. Draft fields per spec §8, factuality check against provided evidence, tone-match score against Voice DNA. |
| 9 | Outreach Studio | 3-column editor; channel switch keeps per-channel drafts; refine actions (shorten, more direct, …) create new versions; edit diff + "save as preference". |
| 10 | Approvals | Queue with warnings; approve binds sha256 fingerprint; any change invalidates (DB trigger); reject/snooze/request research; batch approve only eligible rows with exclusion reasons. |
| 11 | Gmail | OAuth connect/disconnect, token refresh, create/update Gmail draft, send via execution gateway, store provider ids, thread sync + reply detection. |
| 12 | LinkedIn handoff | Copy, open profile, "I sent it" confirmation → recorded as `manual_confirmed`; excluded from confirmed-delivery metrics. |
| 13 | Inbox + timeline | Threaded conversations, segment tabs, reply classification (AI-proposed, user-correctable). |
| 14 | Overview | KPI strip from SQL views with defined denominators, UK/India/Both selector, approvals pending, follow-ups due, recent replies, funnel. |
| 15 | Ops basics | Jobs table with retries/dead-letter, audit log, provider status. |

Out of Phase 1 (scaffolded nav, honest empty states): automated discovery sources, news fetching, trigger monitoring, advanced analytics, copilot tools beyond read views.

## 2. Execution gateway pre-flight (deterministic)

`POST /api/execute/send { approvalId }`:
1. Load approval `FOR UPDATE`; must be `approved`, not expired.
2. Recompute fingerprint from the current draft version + recipient + channel + account; must equal stored.
3. Recipient channel not in `suppression_entries` (email, domain, contact, org).
4. No prior `outbound_messages` for this approval (unique idempotency key = approval id).
5. No inbound message on the conversation newer than the approval.
6. Channel capability `can_send_api` and account connected.
7. Daily cap (`approval_policies.daily_send_cap`) not exceeded.
8. Compliance eligibility (`compliance_status = eligible`).
Then: insert `send_jobs` (unique), call Gmail, store `outbound_messages`, mark approval `consumed`, conversation → `sent/awaiting_response`, audit.

## 3. Email quality rule (founder instruction)

`lib/contacts/email-quality.ts` classifies each address:
- `personal_named` — local part resembles a person (contains first/last name of the contact, or `first.last` shape)
- `personal_unknown` — non-role local part, not matched to a name
- `role_generic` — `info, hello, contact, enquiries, sales, admin, office, team, support, mail, marketing, hr, careers, press, media, accounts, billing, help, general, reception, noreply`
- `free_mail` — gmail/yahoo/outlook etc. (flag: possible individual subscriber, PECR)

Recipient ranking: `personal_named(verified)` > `personal_named(candidate)` > `personal_unknown` > `role_generic` (fallback, warning shown). Governance AI is given the ranked list and must justify picking anything below the top.

## 4. Acceptance tests mapped
Scenarios 1, 2, 3, 4, 5, 6, 7, 8, 10, 11 are Phase 1. 9 (country analytics) is partial (KPI segmentation). 12 (mobile) — responsive views for dossier, draft, approve, inbox, KPIs.
See `docs/PROGRESS.md` for the live test register.
