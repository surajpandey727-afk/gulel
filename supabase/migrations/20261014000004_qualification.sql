-- Scoring models (versioned weights), qualifications (versioned snapshots), ICPs

create table public.scoring_models (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  version_no    int not null,
  weights       jsonb not null,       -- {dimension_key: weight}, must sum to 100 (validated in app + check below)
  bands         jsonb not null default '[{"min":85,"label":"priority_review"},{"min":70,"label":"qualified"},{"min":50,"label":"nurture"},{"min":0,"label":"low_priority"}]'::jsonb,
  freshness_half_life_days int not null default 180 check (freshness_half_life_days > 0),
  qualified_threshold int not null default 70 check (qualified_threshold between 0 and 100),
  is_active     boolean not null default false,
  notes         text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  unique (workspace_id, version_no)
);
create unique index scoring_one_active on public.scoring_models(workspace_id) where is_active;
create trigger trg_sm_immutable before update of weights, bands, version_no on public.scoring_models
  for each row execute function public.forbid_mutation();

create or replace function public.check_weights_sum() returns trigger language plpgsql as $$
declare total numeric;
begin
  select coalesce(sum(value::numeric),0) into total from jsonb_each_text(new.weights);
  if total <> 100 then
    raise exception 'scoring weights must sum to 100 (got %)', total using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_sm_weights before insert on public.scoring_models for each row execute function public.check_weights_sum();

create table public.icps (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  version_no    int not null default 1,
  market        text check (market in ('UK','IN','BOTH')),
  definition    jsonb not null,   -- industry, size, stage, problem, triggers, decision_maker, exclusions, service
  min_score     int not null default 70,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (workspace_id, name, version_no)
);

create table public.lead_qualifications (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  scoring_model_id uuid not null references public.scoring_models(id),
  version_no      int not null,
  score           numeric(5,2) not null check (score between 0 and 100),
  coverage        numeric(4,3) not null check (coverage between 0 and 1),        -- share of weight with evidence
  evidence_confidence numeric(4,3) not null check (evidence_confidence between 0 and 1),
  engagement_propensity text not null default 'unknown' check (engagement_propensity in ('high','medium','low','unknown')),
  propensity_is_calibrated boolean not null default false,
  affordability   text not null default 'uncertain' check (affordability in ('strong','moderate','uncertain','weak')),
  affordability_reasons jsonb not null default '[]'::jsonb,
  commercial_value_amount numeric,
  commercial_value_currency text check (commercial_value_currency in ('GBP','INR') or commercial_value_currency is null),
  band            text not null,
  explanation     jsonb not null default '{}'::jsonb,   -- why_company[], why_now, why_nishaan, who_to_approach, whats_missing[]
  critical_unknowns jsonb not null default '[]'::jsonb,
  icp_id          uuid references public.icps(id),
  override_score  numeric(5,2) check (override_score between 0 and 100),
  override_reason text,
  overridden_by   uuid references auth.users(id),
  overridden_at   timestamptz,
  is_current      boolean not null default true,
  agent_execution_id uuid references public.agent_executions(id),
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  unique (organisation_id, version_no),
  check (override_score is null or (override_reason is not null and length(trim(override_reason)) >= 5))
);
create unique index lq_one_current on public.lead_qualifications(organisation_id) where is_current;
create index on public.lead_qualifications(workspace_id, is_current, score desc);

create table public.qualification_dimensions (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  qualification_id uuid not null references public.lead_qualifications(id) on delete cascade,
  dimension        text not null,
  weight           numeric(5,2) not null,
  raw_score        numeric(4,2) check (raw_score between 0 and 10),   -- null = unknown (NOT zero)
  freshness_factor numeric(4,3) not null default 1,
  contribution     numeric(6,3),
  confidence       numeric(3,2),
  rationale        text,
  evidence_ids     uuid[] not null default '{}',
  unique (qualification_id, dimension)
);

select public._apply_ws_rls('scoring_models', array['owner','analyst']);
select public._apply_ws_rls('icps', array['owner','analyst']);
select public._apply_ws_rls('lead_qualifications', array['owner','analyst']);
select public._apply_ws_rls('qualification_dimensions', array['owner','analyst']);
