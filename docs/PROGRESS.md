# Progress & test register

Last updated 2026-10-14. ✅ verified · 🟡 built, blocked on external setup · ⬜ not started (later phase)

## Automated tests

| Suite | Command | Result |
|---|---|---|
| Unit (email quality, scoring, normalisation, mapping, entity resolution, Companies House mapping, discovery exclusions, compliance) | `npm test` | ✅ 34/34 |
| SQL integration: approval integrity, invalidation on edit, gateway-only claim, idempotent send, suppression, org pacing, immutable versions, KPI denominators | `npm run test:sql` | ✅ all assertions |
| Type-check / lint | `npm run typecheck` · `npx eslint src` | ✅ clean |

## Acceptance scenarios (spec §26)

| # | Scenario | Status | Evidence / notes |
|---|---|---|---|
| 1 | Writing style persists across drafts | 🟡 | Onboarding, sample storage, versioning, preferences, rollback built and exercised in the browser. Extraction call is reached and fails cleanly: the Anthropic key is org-level and needs a **workspace ID**. Samples persist; nothing needs re-pasting. |
| 2 | Excel import with UK/India, partial contacts, duplicates | ✅ | Test workbook `tests/fixtures/TEST-workbook-uk-india.xlsx`: 7 rows → 4 orgs (same company in two spellings merged), 3 UK / 3 IN, `hello@` kept as an org-level flagged inbox, invalid email and orphan row reported, client relationship preserved, aliases recorded, batch reversible. |
| 3 | Explainable qualification | 🟡 | Deterministic scoring with coverage, confidence, freshness and unknown-not-zero is unit-tested; the dossier UI renders every element. The AI assessment step is blocked on the workspace ID. |
| 4 | Governance draft from verified evidence + Gmail draft | 🟡 | Decision-first pipeline with recipient/citation/compliance validation built. Needs the Anthropic workspace ID and Google OAuth client. |
| 5 | No send without approval; edit revokes approval | ✅ | SQL test, and in the browser: approved v1 → edited → “previous approval was revoked” → re-approval required. |
| 6 | Approved Gmail sends exactly once | 🟡 | Gateway + `preflight_send`/`complete_send` proven idempotent in SQL (second claim refused, one outbound row). Live Gmail send needs the OAuth client. |
| 7 | Reply synced, classified, reflected in analytics | 🟡 | Gmail history sync + classification jobs built. Verified with a manually logged LinkedIn reply: conversation → replied, Inbox badge, KPIs (reply rate 1/1, small-sample warning). |
| 8 | LinkedIn prepare → approve → copy/open → manual confirm; no false send | ✅ | Browser: approve → 3-step handoff → “I sent it” → `manual_confirmed`, shown as “0 Gmail · 1 LinkedIn (manual)”, excluded from Messages sent. |
| 9 | UK vs India segmentation & currencies | ✅ | Global UK/India/Both filter on every module; `kpi_summary` per market; GBP and INR never combined. |
| 10 | Model management without exposing secrets | ✅ | Encrypted key storage (AES-256-GCM), masked hint, test/rotate/revoke/disable, per-agent model/effort/budget, OmniRoute stored but not executable, audit log. Key bootstrapped server-side (never typed into the UI). |
| 11 | Failures don't corrupt or double-send | ✅ | Unique approval→send job, definite-rejection-only retry, unknown outcomes marked dead (never retried), `sent_but_record_failed` surfaced, jobs with backoff + dead letter. |
| 12 | Mobile review/edit/approve/inbox/KPIs | ✅ | 375 px: no horizontal scroll, bottom nav plus “More” sheet, card lists instead of tables, full-width editor. |

## Phase status

- **Phase 0** ✅ architecture, design system, schema + RLS, auth, AI gateway, credential handling, navigation.
- **Phase 1** ✅ built end to end; 🟡 live AI and Gmail steps await credentials (see `OPERATIONS.md` §2).
- **Phase 2** 🟡 built: discovery campaigns, versioned ICPs, runs with per-source outcomes, signal review (promote / merge / dismiss, browser-verified), scheduled daily/weekly runs, Companies House search and enrichment (mock-tested; needs `COMPANIES_HOUSE_API_KEY`), AI web research with citation verification (needs Anthropic workspace ID). Still to come: MCA vendor, news API, tenders.
- **Also added:** editing for organisations, contacts, channel verification and evidence status; approval-gated follow-up and reply drafts; meeting-prep briefs and proposal status; Ctrl/⌘ K global search.
- **Phase 3** ⬜ trigger monitoring, messaging-performance analytics, calibrated propensity, win/loss learning.

## Known gaps / deliberate limits

- Gmail delivery is “accepted by Gmail”, not inbox-delivered; open tracking deliberately off.
- Reply classification is a proposal until you accept or correct it. A proposed opt-out is applied immediately (fail-safe) and stays reviewable.
- Follow-ups create reminders only; follow-up drafts are generated on request and need their own approval.
- Fonts come from a free font site. Confirm a commercial web licence before public deployment.
