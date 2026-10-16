-- Align agent_configurations with code agent names.
-- The code uses: taftish, doot, chanakya, sutradhar, mariyada, chitragupta, voice, classifier, fidelity
-- The database had: discovery, governance, analyst, voice, classifier, fidelity
-- This migration: renames old→new, expands CHECK to all 9, seeds missing agents, updates the trigger.

-- 1. Drop the old CHECK so we can rename rows
alter table public.agent_configurations drop constraint if exists agent_configurations_agent_check;

-- 2. Rename existing rows from old names to new names
update public.agent_configurations set agent = 'taftish'  where agent = 'discovery';
update public.agent_configurations set agent = 'doot'     where agent = 'governance';
update public.agent_configurations set agent = 'chanakya'  where agent = 'analyst';

-- 3. Add the new CHECK constraint allowing all 9 agents
alter table public.agent_configurations add constraint agent_configurations_agent_check
  check (agent in ('taftish','doot','chanakya','sutradhar','mariyada','chitragupta','voice','classifier','fidelity'));

-- 4. Seed missing agents (sutradhar, mariyada, chitragupta) for all existing workspaces
insert into public.agent_configurations (workspace_id, agent, model, effort, monthly_budget_usd, on_budget_exhausted)
  select workspace_id, 'sutradhar', 'claude-opus-5-5', 'medium', 50, 'warn'
  from public.agent_configurations
  where agent = 'taftish'
  on conflict (workspace_id, agent) do nothing;

insert into public.agent_configurations (workspace_id, agent, model, effort, monthly_budget_usd, on_budget_exhausted)
  select workspace_id, 'mariyada', 'claude-opus-5-5', 'high', 30, 'pause'
  from public.agent_configurations
  where agent = 'taftish'
  on conflict (workspace_id, agent) do nothing;

insert into public.agent_configurations (workspace_id, agent, model, effort, monthly_budget_usd, on_budget_exhausted)
  select workspace_id, 'chitragupta', 'claude-haiku-5-5', 'low', 10, 'pause'
  from public.agent_configurations
  where agent = 'taftish'
  on conflict (workspace_id, agent) do nothing;

-- 5. Update the workspace seed trigger to use the correct agent names
create or replace function public.seed_workspace_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
declare vp uuid; vv uuid;
begin
  -- Scoring weights
  insert into public.scoring_weights(workspace_id, dimension, weight, version_note) values
    (new.id, 'revenue',    0.18, 'Initial published weights (spec §6). Operating thresholds, not validated classifications.'),
    (new.id, 'growth',     0.14, 'Initial published weights (spec §6). Operating thresholds, not validated classifications.'),
    (new.id, 'margin',     0.10, 'Initial published weights (spec §6). Operating thresholds, not validated classifications.'),
    (new.id, 'market_position', 0.10, 'Initial published weights (spec §6). Operating thresholds, not validated classifications.'),
    (new.id, 'brand_complexity', 0.12, 'Initial published weights (spec §6). Operating thresholds, not validated classifications.'),
    (new.id, 'advisory_need',    0.14, 'Initial published weights (spec §6). Operating thresholds, not validated classifications.'),
    (new.id, 'strategic_timing',  0.12, 'Initial published weights (spec §6). Operating thresholds, not validated classifications.'),
    (new.id, 'engagement_signals', 0.10,
    'Initial published weights (spec §6). Operating thresholds, not validated classifications.');
  -- Data sources
  insert into public.data_sources(workspace_id, key, name, kind) values
    (new.id, 'manual', 'Manual entry', 'manual'),
    (new.id, 'import', 'Spreadsheet import', 'import'),
    (new.id, 'website', 'Company website', 'website'),
    (new.id, 'companies_house', 'Companies House', 'registry'),
    (new.id, 'mca', 'MCA (India)', 'registry'),
    (new.id, 'news', 'News & publications', 'news'),
    (new.id, 'ai_research', 'AI research (requires citation)', 'ai_research');
  -- Agent configurations: all 9 agents with correct names
  insert into public.agent_configurations(workspace_id, agent, model, effort, monthly_budget_usd, on_budget_exhausted) values
    (new.id, 'taftish',     'claude-opus-5-5',  'medium', 50, 'warn'),
    (new.id, 'doot',        'claude-opus-5-5',  'high',   50, 'warn'),
    (new.id, 'chanakya',    'claude-opus-5-5',  'medium', 50, 'warn'),
    (new.id, 'sutradhar',   'claude-opus-5-5',  'medium', 50, 'warn'),
    (new.id, 'mariyada',    'claude-opus-5-5',  'high',   30, 'pause'),
    (new.id, 'chitragupta', 'claude-haiku-5-5', 'low',    10, 'pause'),
    (new.id, 'voice',       'claude-opus-5-5',  'high',   50, 'warn'),
    (new.id, 'classifier',  'claude-opus-5-5',  'low',    20, 'pause'),
    (new.id, 'fidelity',    'claude-haiku-5-5', 'low',    10, 'pause');
  -- Voice profile
  insert into public.voice_profiles(workspace_id) values (new.id) returning id into vp;
  insert into public.voice_profile_versions(workspace_id, profile_id, version_no, source, dna, generation_prompt)
  values (new.id, vp, 1, 'default',
    '{"status":"provisional","formality":"professional, unstuffy","sentence_length":"short to medium","directness":"high","assertiveness":"confident without self-importance","persuasion_style":"evidence-led commercial observation","openings":["a specific, relevant commercial observation"],"conclusions":["one clear, low-friction next step"],"avoid":["generic compliments","artificial enthusiasm","agency pitch language","exaggerated promises","bloated introductions","false urgency","AI-style filler (e.g. I hope this finds you well, delve, leverage, synergy)"],"preserve":["distinction between upstream advisory and downstream execution"]}'::jsonb,
    'Write as the founder of Nishaan-a, an independent upstream strategy practice. Be human, commercially astute and strategically precise. Confident, never self-important. Simple language, sophisticated judgement. Concise, never vague. Lead with a specific commercial observation grounded in the evidence provided, not a compliment. State the practical business consequence. No artificial enthusiasm, no agency pitch language, no exaggerated promises, no false urgency, no mechanical AI phrasing. Keep strategy (what Nishaan-a does) distinct from execution (handled by partners). End with a single, easy next step.')
  returning id into vv;
  update public.voice_profiles set active_version_id = vv where id = vp;
  return new;
end $$;
