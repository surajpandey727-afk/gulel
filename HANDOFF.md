# gulel — Session Handoff

## What this project is

**gulel** is a production AI-powered commercial intelligence and outreach platform, branded "gulel — for nishaan-a". It helps founders research target organisations, draft personalised outreach, and manage a sales pipeline — with AI doing the research and drafting while the human authorises and communicates.

### Stack

- **Framework:** Next.js 15 App Router (React Server Components, Server Actions)
- **Database:** Supabase (Auth, PostgreSQL with RLS, Storage)
- **AI:** Anthropic Claude API (Claude 5 family only: claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5, claude-fable-5-1)
- **Encryption:** AES-256-GCM via `src/lib/crypto.ts` for credentials and writing samples
- **UI:** Neomorphic design system (brand green #082613, ivory #F7F3EA), Tailwind CSS v4
- **Deployment:** Vercel (project: suraj-8bca/gulel, URL: https://gulel.vercel.app)

### Core principle

> "AI researches and prepares. The human authorises and communicates."

No external message may ever be sent without explicit human approval.

---

## What was just completed

All **5 Writing DNA gaps** were implemented, built, tested, and deployed to Vercel:

1. **Independent voice fidelity evaluator** — A separate `fidelity` agent (claude-haiku-5-5, low effort) that scores drafts against the founder's voice profile before the draft_version row is inserted. Runs synchronously during outreach generation.
   - New file: `src/lib/ai/agents/fidelity.ts`

2. **Manual DNA editing UI** — Founders can click "Edit DNA" on the Voice Settings page to inline-edit individual voice dimensions. Saves create a new immutable version with `source: "manual"`.
   - Modified: `src/app/(app)/settings/voice/voice-settings.tsx`

3. **Multi-provider routing** — The AI gateway (`src/lib/ai/gateway.ts`) now routes to non-Anthropic providers when they have a `base_url` configured, instead of hard-blocking them.

4. **Writing sample encryption at rest** — Writing sample bodies are encrypted with AES-256-GCM on insert (both onboarding and settings flows) and decrypted transparently on read.
   - Modified: `src/app/onboarding/voice/actions.ts`, `src/app/(app)/settings/actions.ts`, `src/app/(app)/settings/voice/page.tsx`

5. **Voice fidelity trending** — A sparkline panel on the Voice Settings page showing latest fidelity score, rolling average, and a trend line from the last 30 drafts' `quality.fidelity_score` in `draft_versions`.

### Files changed (committed as `77e7f6f`)

| File | Change |
|------|--------|
| `src/lib/ai/agents/fidelity.ts` | **NEW** — Fidelity agent definition, schema, system prompt |
| `supabase/migrations/20261015000001_voice_gaps.sql` | **NEW** — Migration for all 5 gaps |
| `src/lib/ai/models.ts` | Added fidelity agent to AGENTS map |
| `src/lib/voice/service.ts` | Added `evaluateFidelity()` and `saveManualDna()` functions, decrypt samples on extract |
| `src/lib/ai/gateway.ts` | Multi-provider routing (allow non-Anthropic with base_url) |
| `src/lib/outreach/service.ts` | Synchronous fidelity evaluation before draft_version insert |
| `src/app/(app)/settings/actions.ts` | Added fidelity to agent enum, `saveManualDnaAction`, sample encryption |
| `src/app/(app)/settings/voice/page.tsx` | Decrypt samples, query fidelity scores, pass to client |
| `src/app/(app)/settings/voice/voice-settings.tsx` | Edit DNA UI, fidelity trend panel |
| `src/app/onboarding/voice/actions.ts` | Encrypt samples on onboarding insert |

---

## What needs to happen now

### Immediate: Apply the Supabase migration to cloud

The migration `supabase/migrations/20261015000001_voice_gaps.sql` has been applied locally but **not** to the cloud Supabase project. The Vercel deployment is live but the cloud database doesn't have the new column/constraints yet.

**Steps:**

1. Link the Supabase project to this repo:
   ```bash
   npx supabase link --project-ref <PROJECT_REF>
   ```
2. Push the pending migration:
   ```bash
   npx supabase db push
   ```
3. Verify the migration applied (the `is_encrypted` column, updated CHECK constraint, GIN index, and fidelity agent config rows should all exist).

**Cloud connection notes:**
- The cloud Supabase project is IPv6-only on the direct host; use the Supavisor pooler: `aws-0-eu-west-2.pooler.supabase.com:6543` with user `postgres.<project-ref>`
- The previous project ref noted in conversation was `pseaaaltdzbzlpdlsjkv` but it was not found in the account's project list — confirm the correct ref when linking

### What the migration does (additive only, no destructive changes)

```sql
-- 1. Add is_encrypted column to writing_samples
ALTER TABLE writing_samples ADD COLUMN IF NOT EXISTS is_encrypted boolean NOT NULL DEFAULT false;

-- 2. Expand agent CHECK to include 'fidelity'
ALTER TABLE agent_configurations DROP CONSTRAINT IF EXISTS agent_configurations_agent_check;
ALTER TABLE agent_configurations ADD CONSTRAINT agent_configurations_agent_check
  CHECK (agent IN ('discovery','governance','analyst','voice','classifier','fidelity'));

-- 3. GIN index on draft_versions quality->tone_match for fidelity trending
CREATE INDEX IF NOT EXISTS idx_dv_quality_tone ON draft_versions USING gin ((quality -> 'tone_match'));

-- 4. Seed fidelity agent config for existing workspaces
INSERT INTO agent_configurations (workspace_id, agent, model, effort, monthly_budget_usd, on_budget_exhausted)
  SELECT workspace_id, 'fidelity', 'claude-haiku-5-5', 'low', 10, 'pause'
  FROM agent_configurations WHERE agent = 'voice'
  ON CONFLICT (workspace_id, agent) DO NOTHING;
```

---

## Other pending items (not blocking but noted)

- **No git remote configured** — This repo has no `origin` remote. If you want to push to GitHub, add one first.
- **Existing unencrypted writing samples** — The migration adds `is_encrypted` but doesn't migrate existing plaintext sample bodies. A backfill script would encrypt them in place.
- **API key rotation** — Anthropic key and Supabase secret key were shared in prior chat sessions and should be rotated.

---

## Key architecture details

- **6 AI agents:** discovery, governance, analyst, voice, classifier, fidelity — each configured per-workspace in `agent_configurations`
- **Voice DNA system:** `voice_profiles` -> `voice_profile_versions` (immutable via `forbid_mutation` trigger) -> `writing_samples`, `voice_feedback`
- **17 voice dimensions:** formality, sentence_length, vocabulary, assertiveness, directness, rhythm, persuasion_style, commercial_reasoning, typical_openings, typical_conclusions, personalisation_level, use_of_evidence, preferred_ctas, punctuation_habits, expressions_to_preserve, expressions_to_reject, avoided_phrases
- **draft_versions** table is immutable (forbid_mutation trigger) — fidelity scores are included in the initial insert, not updated after
- **draft_versions.quality JSONB** stores: tone_match, factuality, compliance, brief, fidelity_score, fidelity_notes, fidelity_assessment, fidelity_dimensions
- **CSS variable indirection:** class names like `text-oxblood` map via `--color-oxblood: var(--brand-oxblood)` — variable NAMES say "oxblood" but VALUES are green
- **Dev login:** founder@nishaan.test (workspace db0dc501 has all data)
- **Bootstrap keys via:** `scripts/bootstrap-provider.mjs` (never type real keys into the UI)

---

## Branch

Currently on `phase-1-foundation`. Main branch is `main`.
