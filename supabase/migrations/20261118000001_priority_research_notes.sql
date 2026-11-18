-- Priority reorder, per-section research runs, rich and archivable notes.
-- Idempotent: every statement can be re-run.

-- ---------------------------------------------------------------- reorder is a recorded change (so a Sheet pull keeps it)
alter table public.cr_changes drop constraint if exists cr_changes_action_check;
alter table public.cr_changes add constraint cr_changes_action_check check (action in ('insert','update','delete','restore','move'));

-- Clean integer positions per sheet (1..n in current order) so priority numbers and the Sheet row order agree.
with ranked as (
  select id, row_number() over (partition by workspace_id, sheet order by position, row_key) as rn
  from public.cr_rows where deleted_at is null
)
update public.cr_rows c set position = r.rn from ranked r where c.id = r.id and c.position <> r.rn;

-- ---------------------------------------------------------------- notes: archive (reversible) separate from delete
alter table public.notes add column if not exists archived_at timestamptz;
alter table public.notes drop constraint if exists notes_body_len;
alter table public.notes add constraint notes_body_len check (length(body) <= 200000);

-- Document notes can be rich text now (HTML is longer than the words in it).
alter table public.organisation_files drop constraint if exists organisation_files_notes_len;
alter table public.organisation_files add constraint organisation_files_notes_len check (notes is null or length(notes) <= 60000);

-- ---------------------------------------------------------------- one research attempt per organisation section
create table if not exists public.organisation_research_runs (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  section         text not null check (section in ('financials','brand','commercial','signals')),
  status          text not null default 'running' check (status in ('running','populated','partial','nothing_new','not_found','failed')),
  found           int not null default 0,
  added           int not null default 0,
  duplicates      int not null default 0,
  from_internal   int not null default 0,
  from_web        int not null default 0,
  sources_checked jsonb not null default '{}'::jsonb,
  message         text,
  error           text,
  agent_execution_id uuid references public.agent_executions(id) on delete set null,
  cost_usd        numeric(10,4),
  created_by      uuid references auth.users(id),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);
create index if not exists organisation_research_runs_org_idx on public.organisation_research_runs(organisation_id, section, started_at desc);
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'organisation_research_runs') then
    perform public._apply_ws_rls('organisation_research_runs');
  end if;
end $$;

notify pgrst, 'reload schema';
