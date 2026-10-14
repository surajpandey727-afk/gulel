-- AI provider gateway, agent configuration, executions/costs, Voice DNA

-- Standard workspace RLS: members read; owner/analyst/reviewer write.
create or replace function public._apply_ws_rls(tbl text, write_roles text[] default array['owner','analyst','reviewer'])
returns void language plpgsql as $$
begin
  execute format('alter table public.%I enable row level security', tbl);
  execute format('create policy %I on public.%I for select using (public.is_workspace_member(workspace_id))', tbl||'_sel', tbl);
  execute format('create policy %I on public.%I for insert with check (public.has_workspace_role(workspace_id, %L))', tbl||'_ins', tbl, write_roles);
  execute format('create policy %I on public.%I for update using (public.has_workspace_role(workspace_id, %L)) with check (public.has_workspace_role(workspace_id, %L))', tbl||'_upd', tbl, write_roles, write_roles);
  execute format('create policy %I on public.%I for delete using (public.has_workspace_role(workspace_id, array[''owner'']))', tbl||'_del', tbl);
end $$;

-- ---------------------------------------------------------------- providers
create table public.provider_connections (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  provider      text not null check (provider in ('anthropic','omniroute','other')),
  label         text not null,
  base_url      text,
  -- non-secret metadata only; the key lives in provider_secrets
  key_hint      text,                      -- e.g. 'sk-ant-…MVgAA'
  anthropic_workspace_id text,             -- required for org-level (unscoped) keys
  is_enabled    boolean not null default false,
  status        text not null default 'not_configured'
                check (status in ('not_configured','connected','failed','rate_limited','permission_restricted','disabled')),
  last_tested_at timestamptz,
  last_test_result jsonb,
  rotated_at    timestamptz,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index provider_one_anthropic_label on public.provider_connections(workspace_id, provider, label);
create trigger trg_pc_updated before update on public.provider_connections for each row execute function public.set_updated_at();

-- Secrets: RLS enabled with NO policies → only the service role can read/write.
create table public.provider_secrets (
  connection_id uuid primary key references public.provider_connections(id) on delete cascade,
  ciphertext    text not null,     -- AES-256-GCM, base64(iv|tag|ct), key in server env
  key_version   int  not null default 1,
  created_at    timestamptz not null default now()
);
alter table public.provider_secrets enable row level security;

create table public.agent_configurations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  agent         text not null check (agent in ('discovery','governance','analyst','voice','classifier')),
  connection_id uuid references public.provider_connections(id) on delete set null,
  model         text not null default 'claude-opus-5-5',
  effort        text not null default 'medium' check (effort in ('low','medium','high','xhigh','max')),
  monthly_budget_usd numeric(10,2) not null default 50 check (monthly_budget_usd >= 0),
  on_budget_exhausted text not null default 'pause' check (on_budget_exhausted in ('pause','warn')),
  allow_cross_provider_fallback boolean not null default false,
  prompt_version text not null default 'v1',
  updated_at    timestamptz not null default now(),
  unique (workspace_id, agent)
);
create trigger trg_ac_updated before update on public.agent_configurations for each row execute function public.set_updated_at();

create table public.agent_executions (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  agent          text not null,
  provider       text not null,
  model          text not null,
  prompt_version text,
  status         text not null default 'running' check (status in ('running','succeeded','failed','blocked_budget','invalid_output')),
  input_tokens   int not null default 0,
  output_tokens  int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  cost_usd       numeric(12,6) not null default 0,
  entity_type    text,
  entity_id      uuid,
  correlation_id uuid,
  request_id     text,               -- provider request id
  error          text,
  triggered_by   uuid references auth.users(id),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz
);
create index on public.agent_executions (workspace_id, started_at desc);
create index on public.agent_executions (workspace_id, agent, started_at);

-- ---------------------------------------------------------------- Voice DNA
create table public.writing_samples (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  kind          text not null default 'email'
                check (kind in ('email','linkedin','introduction','observation','proposal','principles','dislike','other')),
  title         text,
  body          text not null check (length(body) > 0),
  is_negative   boolean not null default false,   -- "writing I dislike"
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create trigger trg_ws_samples_updated before update on public.writing_samples for each row execute function public.set_updated_at();

create table public.voice_profiles (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade unique,
  active_version_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_vp_updated before update on public.voice_profiles for each row execute function public.set_updated_at();

create table public.voice_profile_versions (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  profile_id    uuid not null references public.voice_profiles(id) on delete cascade,
  version_no    int not null,
  source        text not null check (source in ('default','extraction','preference','rollback','manual')),
  dna           jsonb not null,           -- structured Voice DNA
  generation_prompt text not null,        -- compact reusable prompt
  examples      jsonb not null default '[]'::jsonb,
  preferences   jsonb not null default '[]'::jsonb,  -- accumulated user corrections
  sample_ids    uuid[] not null default '{}',
  agent_execution_id uuid references public.agent_executions(id),
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  unique (profile_id, version_no)
);
alter table public.voice_profiles
  add constraint voice_profiles_active_fk foreign key (active_version_id)
  references public.voice_profile_versions(id) on delete set null;
create trigger trg_vpv_immutable before update on public.voice_profile_versions
  for each row execute function public.forbid_mutation();

create table public.voice_feedback (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  draft_version_id uuid,           -- fk added in outreach migration
  original_text text not null,
  final_text    text not null,
  disposition   text not null check (disposition in ('one_off','preference','replace_preference','example')),
  preference_text text,
  replaces_preference text,
  applied_to_version_id uuid references public.voice_profile_versions(id),
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

select public._apply_ws_rls('provider_connections', array['owner']);
select public._apply_ws_rls('agent_configurations', array['owner']);
select public._apply_ws_rls('agent_executions');
select public._apply_ws_rls('writing_samples');
select public._apply_ws_rls('voice_profiles');
select public._apply_ws_rls('voice_profile_versions');
select public._apply_ws_rls('voice_feedback');
