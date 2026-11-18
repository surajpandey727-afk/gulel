-- Merge duplicate organisations, per-person preferences, saved board views, @mention notifications.
-- Idempotent: every statement can be re-run.

-- ---------------------------------------------------------------- merge
alter table public.organisations add column if not exists merged_into uuid references public.organisations(id) on delete set null;

/**
 * Move everything that points at p_drop onto p_keep, then retire p_drop (soft-deleted, merged_into = p_keep).
 * Every foreign key to organisations is handled generically, so tables added later are covered too.
 * Rows that would collide with one p_keep already has (same alias, market, news URL, person link…) are dropped;
 * qualifications are renumbered so both histories survive, and p_keep's current score stays current.
 */
create or replace function public.merge_organisations(p_ws uuid, p_keep uuid, p_drop uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k record; d record; fk record; n int; moved jsonb := '{}'::jsonb; off int;
begin
  if p_keep = p_drop then raise exception 'Choose two different organisations.'; end if;
  select * into k from organisations where id = p_keep and workspace_id = p_ws for update;
  select * into d from organisations where id = p_drop and workspace_id = p_ws for update;
  if k.id is null or d.id is null then raise exception 'Organisation not found.'; end if;
  if k.deleted_at is not null then raise exception 'The organisation you keep is deleted. Restore it first.'; end if;
  if k.cr_key is not null and d.cr_key is not null then
    raise exception 'Both are in the Central Repository (% and %). Merge or delete one of those rows on the board first.', k.cr_key, d.cr_key;
  end if;

  -- Rows that would duplicate what the kept organisation already has.
  delete from organisation_aliases a where a.organisation_id = p_drop and exists (select 1 from organisation_aliases b where b.organisation_id = p_keep and b.normalised_alias = a.normalised_alias);
  delete from organisation_brands a where a.organisation_id = p_drop and exists (select 1 from organisation_brands b where b.organisation_id = p_keep and b.name = a.name);
  delete from organisation_market_profiles a where a.organisation_id = p_drop and exists (select 1 from organisation_market_profiles b where b.organisation_id = p_keep and b.market = a.market);
  delete from organisation_news a where a.organisation_id = p_drop and exists (select 1 from organisation_news b where b.organisation_id = p_keep and b.url = a.url);
  delete from contact_organisations a where a.organisation_id = p_drop and exists (select 1 from contact_organisations b where b.organisation_id = p_keep and b.contact_id = a.contact_id);
  delete from organisation_snapshots a where a.organisation_id = p_drop and exists (select 1 from organisation_snapshots b where b.organisation_id = p_keep and b.source = a.source);
  select coalesce(max(version_no), 0) into off from lead_qualifications where organisation_id = p_keep;
  if exists (select 1 from lead_qualifications where organisation_id = p_keep and is_current) then
    update lead_qualifications set is_current = false where organisation_id = p_drop and is_current;
  end if;
  update lead_qualifications set version_no = version_no + off where organisation_id = p_drop;
  if k.parent_organisation_id = p_drop then update organisations set parent_organisation_id = null where id = p_keep; end if;

  -- Every foreign key to organisations(id).
  for fk in
    select c.conrelid::regclass::text as tbl, a.attname as col
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f' and c.confrelid = 'public.organisations'::regclass and array_length(c.conkey, 1) = 1
  loop
    if fk.tbl = 'organisations' and fk.col = 'merged_into' then continue; end if;
    execute format('update %s set %I = $1 where %I = $2', fk.tbl, fk.col, fk.col) using p_keep, p_drop;
    get diagnostics n = row_count;
    if n > 0 then moved := moved || jsonb_build_object(fk.tbl || case when fk.col = 'organisation_id' then '' else '.' || fk.col end, n); end if;
  end loop;

  -- Keep the dropped name findable, fill gaps on the kept record, retire the duplicate.
  insert into organisation_aliases (workspace_id, organisation_id, alias, normalised_alias, kind)
  select p_ws, p_keep, d.trading_name, d.normalised_name, 'former'
  where d.normalised_name is not null and d.normalised_name <> k.normalised_name
    and not exists (select 1 from organisation_aliases where organisation_id = p_keep and normalised_alias = d.normalised_name);
  update organisations set deleted_at = now(), merged_into = p_keep, cr_key = null, primary_domain = null, registration_number = null where id = p_drop;
  update organisations set
    legal_name = coalesce(k.legal_name, d.legal_name), website = coalesce(k.website, d.website), primary_domain = coalesce(k.primary_domain, d.primary_domain),
    registration_number = coalesce(k.registration_number, d.registration_number), registration_jurisdiction = coalesce(k.registration_jurisdiction, d.registration_jurisdiction),
    headquarters = coalesce(k.headquarters, d.headquarters), sector = coalesce(k.sector, d.sector), sub_sector = coalesce(k.sub_sector, d.sub_sector),
    description = coalesce(k.description, d.description), employee_count = coalesce(k.employee_count, d.employee_count), city = coalesce(k.city, d.city),
    country = coalesce(k.country, d.country), cr_key = coalesce(k.cr_key, d.cr_key), archived_at = case when d.archived_at is null then null else k.archived_at end,
    needs = (select array(select distinct unnest(k.needs || d.needs)))
  where id = p_keep;
  insert into audit_logs (workspace_id, actor_type, actor_id, action, entity_type, entity_id, metadata)
  values (p_ws, case when p_actor is null then 'system' else 'user' end, p_actor::text, 'organisation.merged', 'organisation', p_keep,
          jsonb_build_object('kept', k.trading_name, 'merged', d.trading_name, 'merged_id', p_drop, 'moved', moved));
  return moved;
end $$;
revoke all on function public.merge_organisations(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_organisations(uuid, uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------- per-person preferences
-- Kept in the existing user_preferences.preferences jsonb (one row per person, own-row policy), keyed per workspace.

-- ---------------------------------------------------------------- saved board views (personal or shared with the team)
create table if not exists public.cr_saved_views (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sheet        text not null,
  name         text not null check (length(name) between 1 and 60),
  view         jsonb not null,
  shared       boolean not null default false,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists cr_saved_views_sheet_idx on public.cr_saved_views(workspace_id, sheet);
alter table public.cr_saved_views enable row level security;
drop policy if exists cr_saved_views_read on public.cr_saved_views;
create policy cr_saved_views_read on public.cr_saved_views for select to authenticated
  using (public.is_workspace_member(workspace_id) and (shared or created_by = auth.uid()));
drop policy if exists cr_saved_views_write on public.cr_saved_views;
create policy cr_saved_views_write on public.cr_saved_views for all to authenticated
  using (public.is_workspace_member(workspace_id) and created_by = auth.uid())
  with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());

-- ---------------------------------------------------------------- notifications (@mentions in notes)
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null default 'mention' check (kind in ('mention')),
  title        text not null,
  body         text,
  link         text,
  actor_id     uuid references auth.users(id) on delete set null,
  note_id      uuid references public.notes(id) on delete cascade,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_own_update on public.notifications;
create policy notifications_own_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
