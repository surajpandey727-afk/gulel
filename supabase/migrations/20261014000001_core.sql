-- Nishaan-a OS — core: workspaces, membership, helpers, audit
create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- workspaces
create table public.workspaces (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  default_market text not null default 'UK' check (default_market in ('UK','IN')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_workspaces_updated before update on public.workspaces
  for each row execute function public.set_updated_at();

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'owner'
               check (role in ('owner','analyst','reviewer','viewer')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index on public.workspace_members (user_id);

create table public.user_preferences (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  active_workspace_id uuid references public.workspaces(id) on delete set null,
  display_name text,
  preferences  jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

-- Membership checks. SECURITY DEFINER so policies on workspace_members don't recurse.
create or replace function public.is_workspace_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members m
                 where m.workspace_id = ws and m.user_id = auth.uid());
$$;

create or replace function public.has_workspace_role(ws uuid, roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members m
                 where m.workspace_id = ws and m.user_id = auth.uid() and m.role = any(roles));
$$;

-- First sign-in bootstraps a single-founder workspace.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  insert into public.workspaces(name) values ('Nishaan-a') returning id into ws;
  insert into public.workspace_members(workspace_id, user_id, role) values (ws, new.id, 'owner');
  insert into public.user_preferences(user_id, active_workspace_id) values (new.id, ws);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- workspace settings / policies
create table public.workspace_settings (
  workspace_id          uuid primary key references public.workspaces(id) on delete cascade,
  daily_send_cap        int  not null default 25 check (daily_send_cap between 0 and 500),
  min_hours_between_org_sends int not null default 72 check (min_hours_between_org_sends >= 0),
  send_window_start     time not null default '08:00',
  send_window_end       time not null default '18:00',
  require_compliance_check boolean not null default true,
  tracking_pixels_enabled boolean not null default false,
  approval_ttl_hours    int  not null default 72 check (approval_ttl_hours > 0),
  -- private engagement pricing ranges, per market/currency
  pricing_ranges        jsonb not null default '{"UK":{"currency":"GBP","min":15000,"typical":40000,"max":120000},"IN":{"currency":"INR","min":800000,"typical":2500000,"max":8000000}}'::jsonb,
  onboarding            jsonb not null default '{}'::jsonb,
  updated_at            timestamptz not null default now()
);
create trigger trg_ws_settings_updated before update on public.workspace_settings
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_workspace() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.workspace_settings(workspace_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_workspace_created after insert on public.workspaces
  for each row execute function public.handle_new_workspace();

-- ---------------------------------------------------------------- audit (append-only)
create table public.audit_logs (
  id             bigint generated always as identity primary key,
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  actor_type     text not null check (actor_type in ('user','agent','system','gateway')),
  actor_id       text,
  action         text not null,
  entity_type    text,
  entity_id      uuid,
  correlation_id uuid,
  before         jsonb,
  after          jsonb,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index on public.audit_logs (workspace_id, created_at desc);
create index on public.audit_logs (entity_type, entity_id);

create or replace function public.forbid_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = 'P0001';
end $$;
create trigger trg_audit_immutable before update on public.audit_logs
  for each row execute function public.forbid_mutation();

-- ---------------------------------------------------------------- RLS
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.user_preferences enable row level security;
alter table public.workspace_settings enable row level security;
alter table public.audit_logs enable row level security;

create policy ws_select on public.workspaces for select using (public.is_workspace_member(id));
create policy ws_update on public.workspaces for update using (public.has_workspace_role(id, array['owner']));

create policy wm_select on public.workspace_members for select using (public.is_workspace_member(workspace_id));
create policy wm_owner_all on public.workspace_members for all
  using (public.has_workspace_role(workspace_id, array['owner']))
  with check (public.has_workspace_role(workspace_id, array['owner']));

create policy up_self on public.user_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy wss_select on public.workspace_settings for select using (public.is_workspace_member(workspace_id));
create policy wss_update on public.workspace_settings for update using (public.has_workspace_role(workspace_id, array['owner']));

create policy audit_select on public.audit_logs for select using (public.is_workspace_member(workspace_id));
create policy audit_insert on public.audit_logs for insert with check (public.is_workspace_member(workspace_id));
