-- Documents against organisations: open string tags (what / where a document belongs) and free-text notes.
-- Idempotent.
alter table public.organisation_files add column if not exists tags text[] not null default '{}';
alter table public.organisation_files add column if not exists notes text;
alter table public.organisation_files drop constraint if exists organisation_files_notes_len;
alter table public.organisation_files add constraint organisation_files_notes_len check (notes is null or length(notes) <= 10000);
create index if not exists organisation_files_tags_idx on public.organisation_files using gin (tags);
