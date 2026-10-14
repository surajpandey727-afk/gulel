-- Trigger monitoring: last-known source snapshots, detected trigger events

create table public.organisation_snapshots (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  source          text not null,             -- 'companies_house'
  data            jsonb not null,
  fetched_at      timestamptz not null default now(),
  unique (organisation_id, source)
);

create table public.trigger_events (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  source          text not null,
  kind            text not null check (kind in ('status_change','insolvency','filing_overdue','new_accounts','leadership_joined','leadership_left','funding','launch','acquisition','market_entry','consolidation','strategic_review','rfp','other')),
  materiality     text not null default 'moderate' check (materiality in ('low','moderate','high')),
  summary         text not null,
  evidence_id     uuid references public.evidence_items(id) on delete set null,
  status          text not null default 'new' check (status in ('new','reviewed','dismissed','actioned')),
  task_id         uuid references public.tasks(id) on delete set null,
  detected_at     timestamptz not null default now()
);
create index on public.trigger_events(workspace_id, status, detected_at desc);

-- win/loss capture on closed opportunities
alter table public.opportunities add column if not exists competitive_outcome text;
alter table public.opportunities add column if not exists win_loss_notes text;

select public._apply_ws_rls('organisation_snapshots', array['owner','analyst']);
select public._apply_ws_rls('trigger_events', array['owner','analyst']);
