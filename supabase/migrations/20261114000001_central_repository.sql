-- Central Repository: enum widening on core tables + sync run log.
-- (Sheet rows themselves live in the generic cr_* store, see 20261116000001.)
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
