-- Writing DNA gaps: sample encryption, fidelity agent, manual DNA editing support
-- This migration is additive-only (no destructive changes).

-- 1. Writing sample encryption at rest
alter table public.writing_samples add column if not exists is_encrypted boolean not null default false;

-- 2. Fidelity agent: expand agent CHECK constraint
alter table public.agent_configurations drop constraint if exists agent_configurations_agent_check;
alter table public.agent_configurations add constraint agent_configurations_agent_check
  check (agent in ('discovery','governance','analyst','voice','classifier','fidelity'));

-- 3. Manual DNA editing: voice_profile_versions source already allows 'manual' — no schema change needed.

-- 4. Voice fidelity trending: add fidelity_score and fidelity_notes to draft_versions quality JSONB.
--    These are written into the existing quality JSONB column by the fidelity agent — no schema change needed.
--    Add an index for efficient aggregation.
create index if not exists idx_dv_quality_tone on public.draft_versions using gin ((quality -> 'tone_match'));

-- 5. Seed fidelity agent configuration for existing workspaces that have an agent config.
insert into public.agent_configurations (workspace_id, agent, model, effort, monthly_budget_usd, on_budget_exhausted)
  select workspace_id, 'fidelity', 'claude-haiku-5-5', 'low', 10, 'pause'
  from public.agent_configurations
  where agent = 'voice'
  on conflict (workspace_id, agent) do nothing;
