-- Workspace-wide document tags: one shared list (with a colour each) so tags are picked, not retyped.
-- Idempotent: every statement can be re-run.
create table if not exists public.doc_tags (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 40),
  color        text not null default 'moss',
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create unique index if not exists doc_tags_name_uq on public.doc_tags(workspace_id, lower(name));
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'doc_tags') then
    perform public._apply_ws_rls('doc_tags');
  end if;
end $$;

-- Every workspace starts with "Qualification" (the client intelligence / qualification reports).
insert into public.doc_tags (workspace_id, name, color)
select w.id, 'Qualification', 'green' from public.workspaces w
on conflict (workspace_id, lower(name)) do nothing;

-- Tags already typed on documents join the shared list.
insert into public.doc_tags (workspace_id, name, color)
select distinct on (f.workspace_id, lower(t.tag)) f.workspace_id, t.tag,
  (array['moss','olive','taupe','amber','cream','grey','red'])[1 + abs(hashtext(lower(t.tag))) % 7]
from public.organisation_files f cross join lateral unnest(f.tags) as t(tag)
where f.deleted_at is null and btrim(t.tag) <> ''
on conflict (workspace_id, lower(name)) do nothing;

notify pgrst, 'reload schema';
