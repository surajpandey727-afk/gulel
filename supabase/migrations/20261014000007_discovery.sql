-- Discovery: campaigns, runs and raw signals awaiting review

create table public.discovery_campaigns (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  name            text not null,
  market          text not null check (market in ('UK','IN','BOTH')),
  icp_id          uuid references public.icps(id) on delete set null,
  config          jsonb not null default '{}'::jsonb,  -- industries, keywords, excluded_*, negative_fit, sizes, services, sources, sic_codes
  sources         text[] not null default '{}' check (sources <@ array['companies_house','ai_web_research','manual_urls']),
  frequency       text not null default 'manual' check (frequency in ('manual','daily','weekly')),
  max_leads_per_run int not null default 25 check (max_leads_per_run between 1 and 200),
  max_spend_usd   numeric(8,2) not null default 5 check (max_spend_usd >= 0),
  min_score       int not null default 60 check (min_score between 0 and 100),
  status          text not null default 'draft' check (status in ('draft','active','paused','archived')),
  last_run_at     timestamptz,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id, name)
);
create trigger trg_dc_updated before update on public.discovery_campaigns for each row execute function public.set_updated_at();

create table public.discovery_runs (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  campaign_id     uuid not null references public.discovery_campaigns(id) on delete cascade,
  status          text not null default 'running' check (status in ('running','succeeded','partial','failed','blocked')),
  trigger         text not null default 'manual' check (trigger in ('manual','schedule')),
  per_source      jsonb not null default '{}'::jsonb,   -- {companies_house: {status, found, error}, ...}
  candidates_found int not null default 0,
  new_signals     int not null default 0,
  cost_usd        numeric(12,6) not null default 0,
  error           text,
  started_by      uuid references auth.users(id),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);
create index on public.discovery_runs(campaign_id, started_at desc);

create table public.discovery_signals (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  campaign_id     uuid references public.discovery_campaigns(id) on delete set null,
  run_id          uuid references public.discovery_runs(id) on delete set null,
  source          text not null,
  external_id     text,                      -- e.g. Companies House number
  candidate_name  text not null,
  candidate_domain citext,
  candidate_registration text,
  market          text check (market in ('UK','IN') or market is null),
  signal_type     text not null,             -- 'incorporation','funding','expansion','hiring','rfp','rebrand','launch','other'
  strength        text not null default 'weak' check (strength in ('weak','moderate','strong')),
  claim_text      text not null,
  uncertainty     text,
  source_url      text,
  published_at    timestamptz,
  raw             jsonb not null default '{}'::jsonb,
  organisation_id uuid references public.organisations(id) on delete set null,   -- set when promoted/resolved
  match_hint      jsonb,                     -- resolver output at ingest
  status          text not null default 'new' check (status in ('new','promoted','merged','dismissed','duplicate')),
  reviewed_by     uuid references auth.users(id),
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);
create unique index ds_dedupe on public.discovery_signals(workspace_id, source, external_id, signal_type) where external_id is not null;
create index on public.discovery_signals(workspace_id, status, created_at desc);

select public._apply_ws_rls('discovery_campaigns', array['owner','analyst']);
select public._apply_ws_rls('discovery_runs', array['owner','analyst']);
select public._apply_ws_rls('discovery_signals', array['owner','analyst']);
