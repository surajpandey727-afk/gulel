-- Central Repository: projects, finances, credentials tables + enum widening
-- Bridges the gap between the Google Sheet "central_repository_nishaan-a_v2" and gulel's schema.

-- ---------------------------------------------------------------- widen enums
-- 1. opportunities.market: add 'Global'
alter table public.opportunities drop constraint if exists opportunities_market_check;
alter table public.opportunities add constraint opportunities_market_check check (market in ('UK','IN','Global'));

-- 2. opportunities.currency: add USD, AUD, EUR
alter table public.opportunities drop constraint if exists opportunities_currency_check;
alter table public.opportunities add constraint opportunities_currency_check check (currency in ('GBP','INR','USD','AUD','EUR'));

-- 3. Drop the paired market/currency constraint (Global can use any currency)
alter table public.opportunities drop constraint if exists opportunities_check;

-- 4. opportunities.stage: widen to include sheet stages
alter table public.opportunities drop constraint if exists opportunities_stage_check;
alter table public.opportunities add constraint opportunities_stage_check check (stage in (
  'discovery','meeting','scoping','proposal','negotiation','won','lost','nurture',
  'identified','contacted','in_conversation','parked'
));

-- 5. Add 'track' column to opportunities (A Direct / B Studio / C Existing)
alter table public.opportunities add column if not exists track text
  check (track in ('direct_client','studio_channel','existing_account') or track is null);

-- 6. Add 'last_touch_at' to opportunities
alter table public.opportunities add column if not exists last_touch_at timestamptz;

-- 7. Contacts: add contact-level relationship
alter table public.contacts add column if not exists relationship text
  check (relationship in ('prospect','client_contact','partner','referrer','candidate') or relationship is null);

-- 8. Contacts market: add 'Global'
alter table public.contacts drop constraint if exists contacts_market_check;
alter table public.contacts add constraint contacts_market_check check (market in ('UK','IN','Global') or market is null);

-- 9. Meetings: add external_link for Fathom recordings etc.
alter table public.meetings add column if not exists external_link text;

-- ---------------------------------------------------------------- projects table
create table if not exists public.projects (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  opportunity_id  uuid references public.opportunities(id) on delete set null,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name            text not null,
  scope           text,
  region          text check (region in ('UK','IN','Global') or region is null),
  status          text not null default 'proposed' check (status in ('proposed','active','completed','cancelled','on_hold')),
  start_date      date,
  end_date        date,
  owner_user_id   uuid references auth.users(id),
  fee_amount      numeric check (fee_amount >= 0),
  fee_currency    text check (fee_currency in ('GBP','INR','USD','AUD','EUR') or fee_currency is null),
  has_nda         boolean not null default false,
  has_testimonial boolean not null default false,
  notes           text,
  is_demo         boolean not null default false,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_projects_updated before update on public.projects for each row execute function public.set_updated_at();
create index on public.projects(workspace_id, status);
create index on public.projects(organisation_id);

-- ---------------------------------------------------------------- finances table
create table if not exists public.finances (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  project_id      uuid references public.projects(id) on delete set null,
  organisation_id uuid references public.organisations(id) on delete cascade,
  type            text not null check (type in ('receivable','expense')),
  item            text not null,
  currency        text not null check (currency in ('GBP','INR','USD','AUD','EUR')),
  quantity        numeric not null default 1 check (quantity > 0),
  unit_amount     numeric not null check (unit_amount >= 0),
  total_amount    numeric generated always as (quantity * unit_amount) stored,
  status          text not null default 'proposed' check (status in ('proposed','invoiced','paid','unconfirmed','cancelled')),
  invoice_date    date,
  received_amount numeric default 0 check (received_amount >= 0),
  received_date   date,
  pending_amount  numeric generated always as (quantity * unit_amount - coalesce(received_amount, 0)) stored,
  notes           text,
  is_demo         boolean not null default false,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_finances_updated before update on public.finances for each row execute function public.set_updated_at();
create index on public.finances(workspace_id, type, status);
create index on public.finances(project_id);

-- ---------------------------------------------------------------- credentials table
create table if not exists public.credentials (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  project_id      uuid references public.projects(id) on delete set null,
  organisation_id uuid references public.organisations(id) on delete set null,
  name            text not null,
  type            text not null check (type in ('case_study','testimonial')),
  sector          text,
  status          text not null default 'draft' check (status in ('locked','received','permission_given','draft','retired')),
  permission_notes text,
  is_demo         boolean not null default false,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_credentials_updated before update on public.credentials for each row execute function public.set_updated_at();
create index on public.credentials(workspace_id, type);

-- ---------------------------------------------------------------- RLS
select public._apply_ws_rls('projects');
select public._apply_ws_rls('finances');
select public._apply_ws_rls('credentials');

-- ---------------------------------------------------------------- sync metadata
create table if not exists public.sync_log (
  id              bigint generated always as identity primary key,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  direction       text not null check (direction in ('sheet_to_gulel','gulel_to_sheet')),
  entity          text not null,
  rows_synced     int not null default 0,
  rows_skipped    int not null default 0,
  rows_errored    int not null default 0,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null default 'running' check (status in ('running','completed','failed')),
  error_detail    text,
  created_by      uuid references auth.users(id)
);
create index on public.sync_log(workspace_id, entity, started_at desc);
select public._apply_ws_rls('sync_log');
