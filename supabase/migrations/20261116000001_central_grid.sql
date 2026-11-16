-- Central Repository grid store. Mirrors the Google Sheet one-to-one: one row per sheet row,
-- input cells in `data` (keyed by column slug); formula columns are computed in the app.

create table if not exists public.cr_rows (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sheet        text not null,
  row_key      text,
  data         jsonb not null default '{}'::jsonb,
  position     double precision not null default 0,
  color        text,
  deleted_at   timestamptz,
  updated_by   uuid references auth.users(id),
  updated_via  text not null default 'ui' check (updated_via in ('ui','agent','sheet','api','import')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists cr_rows_key_uq on public.cr_rows(workspace_id, sheet, row_key) where deleted_at is null and row_key is not null;
create index if not exists cr_rows_sheet_idx on public.cr_rows(workspace_id, sheet, position);
create trigger trg_cr_rows_updated before update on public.cr_rows for each row execute function public.set_updated_at();
select public._apply_ws_rls('cr_rows');

create table if not exists public.cr_reference (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  list         text not null,
  item_id      text not null,
  name         text not null,
  is_open      boolean,
  market_id    text,
  color        text,
  position     int not null default 0,
  primary key (workspace_id, list, item_id)
);
select public._apply_ws_rls('cr_reference');

create table if not exists public.cr_changes (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sheet        text not null,
  row_id       uuid references public.cr_rows(id) on delete set null,
  row_key      text,
  action       text not null check (action in ('insert','update','delete','restore')),
  before       jsonb,
  after        jsonb,
  actor_id     uuid references auth.users(id),
  via          text not null default 'ui' check (via in ('ui','agent','sheet','api','import')),
  note         text,
  created_at   timestamptz not null default now(),
  pushed_at    timestamptz,
  push_error   text
);
create index if not exists cr_changes_ws_idx on public.cr_changes(workspace_id, created_at desc);
create index if not exists cr_changes_pending_idx on public.cr_changes(workspace_id) where pushed_at is null;
select public._apply_ws_rls('cr_changes');

create table if not exists public.cr_link (
  workspace_id    uuid primary key references public.workspaces(id) on delete cascade,
  spreadsheet_id  text,
  spreadsheet_url text,
  account_email   text,
  auto_push       boolean not null default true,
  last_pull_at    timestamptz,
  last_push_at    timestamptz,
  last_status     text,
  last_error      text,
  updated_at      timestamptz not null default now()
);
select public._apply_ws_rls('cr_link');

-- OAuth tokens for the Sheets connection: service role only (RLS on, no policies).
create table if not exists public.cr_link_secrets (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  ciphertext   text not null,
  key_version  int not null default 1,
  updated_at   timestamptz not null default now()
);
alter table public.cr_link_secrets enable row level security;

create table if not exists public.cr_api_tokens (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  label        text not null,
  token_hash   text not null unique,
  token_hint   text not null,
  can_write    boolean not null default true,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
select public._apply_ws_rls('cr_api_tokens', array['owner']);

do $$ begin
  alter publication supabase_realtime add table public.cr_rows;
exception when others then null; end $$;

-- Munshi: the record-keeping agent allowed to edit the Central Repository (validated, logged ops only).
alter table public.agent_configurations drop constraint if exists agent_configurations_agent_check;
alter table public.agent_configurations add constraint agent_configurations_agent_check
  check (agent in ('taftish','doot','chanakya','sutradhar','mariyada','chitragupta','voice','classifier','fidelity','munshi')) not valid;
insert into public.agent_configurations (workspace_id, agent, model, effort, monthly_budget_usd, on_budget_exhausted)
  select distinct workspace_id, 'munshi', 'claude-opus-5-5', 'medium', 20, 'warn' from public.agent_configurations
  on conflict (workspace_id, agent) do nothing;
