-- One organisation, everywhere: links Central Repository rows to gulel's core records,
-- adds archive (reversible, separate from delete), per-organisation files, and editable notes.
-- Idempotent: every statement can be re-run.

-- ---------------------------------------------------------------- link keys (Central Repository ID, e.g. ORG-030 / CON-004)
alter table public.organisations add column if not exists cr_key text;
alter table public.organisations add column if not exists archived_at timestamptz;
alter table public.organisations add column if not exists city text;
alter table public.organisations add column if not exists country text;
create unique index if not exists organisations_cr_key_uq on public.organisations(workspace_id, cr_key) where cr_key is not null and deleted_at is null;
create index if not exists organisations_archived_idx on public.organisations(workspace_id) where archived_at is not null;

alter table public.contacts add column if not exists cr_key text;
create unique index if not exists contacts_cr_key_uq on public.contacts(workspace_id, cr_key) where cr_key is not null and deleted_at is null;

-- Changes made by gulel's own reconciliation are logged as 'system' in the Central Repository audit trail.
alter table public.cr_rows drop constraint if exists cr_rows_updated_via_check;
alter table public.cr_rows add constraint cr_rows_updated_via_check check (updated_via in ('ui','agent','sheet','api','import','system'));
alter table public.cr_changes drop constraint if exists cr_changes_via_check;
alter table public.cr_changes add constraint cr_changes_via_check check (via in ('ui','agent','sheet','api','import','system'));

-- ---------------------------------------------------------------- notes: editable, soft-deletable, attributed
alter table public.notes add column if not exists updated_at timestamptz not null default now();
alter table public.notes add column if not exists deleted_at timestamptz;
alter table public.notes add column if not exists via text not null default 'ui';
alter table public.notes drop constraint if exists notes_via_check;
alter table public.notes add constraint notes_via_check check (via in ('ui','agent','api','inbox'));
create index if not exists notes_org_idx on public.notes(organisation_id, created_at desc) where deleted_at is null;
create index if not exists notes_contact_idx on public.notes(contact_id, created_at desc) where deleted_at is null;
drop trigger if exists trg_notes_updated on public.notes;
create trigger trg_notes_updated before update on public.notes for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- organisation files (research, decks, briefs)
create table if not exists public.organisation_files (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name            text not null check (length(name) between 1 and 255),
  path            text not null unique,
  size_bytes      bigint not null default 0,
  mime_type       text,
  via             text not null default 'ui' check (via in ('ui','agent','api')),
  uploaded_by     uuid references auth.users(id),
  uploaded_label  text,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists organisation_files_org_idx on public.organisation_files(organisation_id, created_at desc) where deleted_at is null;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'organisation_files') then
    perform public._apply_ws_rls('organisation_files');
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit) values ('org-files', 'org-files', false, 52428800) on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'org_files_member_rw') then
    create policy "org_files_member_rw" on storage.objects for all to authenticated
      using (bucket_id = 'org-files' and public.is_workspace_member((storage.foldername(name))[1]::uuid))
      with check (bucket_id = 'org-files' and public.is_workspace_member((storage.foldername(name))[1]::uuid));
  end if;
end $$;
