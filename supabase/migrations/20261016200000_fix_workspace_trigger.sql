-- Fix handle_new_workspace trigger to use correct 9 agent names.
-- The prior migration (20261016100000) created seed_workspace_defaults() but
-- never attached it to the trigger, and it referenced a non-existent
-- scoring_weights table. This migration replaces handle_new_workspace in place
-- and drops the orphaned function.

-- 1. Replace the trigger function with correct agent names and scoring_models seed
create or replace function public.handle_new_workspace() returns trigger
language plpgsql security definer set search_path = public as $$
declare vp uuid; vv uuid;
begin
  insert into public.workspace_settings(workspace_id) values (new.id) on conflict do nothing;
  insert into public.scoring_models(workspace_id, version_no, is_active, weights, notes) values (new.id, 1, true,
    '{"strategic_need":20,"buying_intent":20,"financial_capacity":15,"trigger_strength":15,"decision_maker_access":10,"growth_scale":10,"procurement_readiness":5,"credibility":5}'::jsonb,
    'Initial published weights (spec §6). Operating thresholds, not validated classifications.');
  insert into public.data_sources(workspace_id, key, name, kind) values
    (new.id, 'manual', 'Manual entry', 'manual'),
    (new.id, 'import', 'Spreadsheet import', 'import'),
    (new.id, 'website', 'Company website', 'website'),
    (new.id, 'companies_house', 'Companies House', 'registry'),
    (new.id, 'mca', 'MCA (India)', 'registry'),
    (new.id, 'news', 'News & publications', 'news'),
    (new.id, 'ai_research', 'AI research (requires citation)', 'ai_research');
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
  insert into public.voice_profiles(workspace_id) values (new.id) returning id into vp;
  insert into public.voice_profile_versions(workspace_id, profile_id, version_no, source, dna, generation_prompt)
  values (new.id, vp, 1, 'default',
    '{"status":"provisional","formality":"professional, unstuffy","sentence_length":"short to medium","directness":"high","assertiveness":"confident without self-importance","persuasion_style":"evidence-led commercial observation","openings":["a specific, relevant commercial observation"],"conclusions":["one clear, low-friction next step"],"avoid":["generic compliments","artificial enthusiasm","agency pitch language","exaggerated promises","bloated introductions","false urgency","AI-style filler (e.g. I hope this finds you well, delve, leverage, synergy)"],"preserve":["distinction between upstream advisory and downstream execution"]}'::jsonb,
    'Write as the founder of Nishaan-a, an independent upstream strategy practice. Be human, commercially astute and strategically precise. Confident, never self-important. Simple language, sophisticated judgement. Concise, never vague. Lead with a specific commercial observation grounded in the evidence provided, not a compliment. State the practical business consequence. No artificial enthusiasm, no agency pitch language, no exaggerated promises, no false urgency, no mechanical AI phrasing. Keep strategy (what Nishaan-a does) distinct from execution (handled by partners). End with a single, easy next step.')
  returning id into vv;
  update public.voice_profiles set active_version_id = vv where id = vp;
  return new;
end $$;

-- 2. Drop the orphaned function from the prior migration
drop function if exists public.seed_workspace_defaults() cascade;
