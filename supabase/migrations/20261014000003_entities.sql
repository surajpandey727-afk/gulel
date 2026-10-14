-- Organisations, contacts, provenance/evidence, imports, entity resolution, suppression

-- ---------------------------------------------------------------- sources & evidence
create table public.data_sources (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  key           text not null,       -- 'manual','import','companies_house','website','news', ...
  name          text not null,
  kind          text not null check (kind in ('manual','import','registry','website','news','ads','jobs','tender','social','enrichment_vendor','ai_research','other')),
  licence_notes text,
  is_enabled    boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (workspace_id, key)
);

create table public.organisations (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  trading_name    text not null,
  legal_name      text,
  normalised_name text not null,             -- for resolution, computed in app (lib/import/normalise)
  primary_domain  citext,
  website         text,
  registration_number text,                  -- CH number / CIN
  registration_jurisdiction text check (registration_jurisdiction in ('UK','IN') or registration_jurisdiction is null),
  primary_market  text not null check (primary_market in ('UK','IN')),
  headquarters    text,
  incorporation_date date,
  operating_status text not null default 'unknown' check (operating_status in ('active','dissolved','liquidation','dormant','unknown')),
  sector          text,
  sub_sector      text,
  employee_count  int,
  employee_count_source text,
  employee_count_as_of date,
  ownership_notes text,
  parent_organisation_id uuid references public.organisations(id) on delete set null,
  description     text,
  needs           text[] not null default '{}'   -- strategic opportunity taxonomy keys
                  check (needs <@ array['positioning','brand_consolidation','market_entry','category_expansion','distribution_strategy','commercial_growth','gtm','rtm','portfolio_architecture','repositioning','strategic_research','other']),
  relationship_status text not null default 'prospect'
                  check (relationship_status in ('prospect','client','former_client','partner','in_conversation','do_not_contact')),
  owner_user_id   uuid references auth.users(id),
  is_demo         boolean not null default false,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create trigger trg_org_updated before update on public.organisations for each row execute function public.set_updated_at();
create unique index org_domain_uq on public.organisations(workspace_id, primary_domain) where primary_domain is not null and deleted_at is null;
create unique index org_regno_uq on public.organisations(workspace_id, registration_jurisdiction, registration_number) where registration_number is not null and deleted_at is null;
create index org_name_trgm on public.organisations using gin (normalised_name gin_trgm_ops);
create index on public.organisations(workspace_id, primary_market) where deleted_at is null;

create table public.organisation_aliases (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  alias           text not null,
  normalised_alias text not null,
  kind            text not null default 'trading' check (kind in ('trading','legal','brand','former','import_variant')),
  created_at      timestamptz not null default now(),
  unique (organisation_id, normalised_alias)
);
create index org_alias_trgm on public.organisation_aliases using gin (normalised_alias gin_trgm_ops);

create table public.organisation_market_profiles (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  market          text not null check (market in ('UK','IN')),
  currency        text not null check (currency in ('GBP','INR')),
  local_entity_name text,
  local_registration_number text,
  presence        text not null default 'operating' check (presence in ('headquartered','operating','entering','exporting','unknown')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organisation_id, market),
  check ((market = 'UK' and currency = 'GBP') or (market = 'IN' and currency = 'INR'))
);
create trigger trg_omp_updated before update on public.organisation_market_profiles for each row execute function public.set_updated_at();

create table public.source_records (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  data_source_id uuid not null references public.data_sources(id),
  external_id   text,
  url           text,
  title         text,
  published_at  timestamptz,
  retrieved_at  timestamptz not null default now(),
  content_hash  text,
  raw_metadata  jsonb not null default '{}'::jsonb,   -- permitted metadata only
  created_at    timestamptz not null default now()
);
create unique index source_records_dedupe on public.source_records(workspace_id, data_source_id, content_hash) where content_hash is not null;

create table public.evidence_items (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete cascade,
  contact_id      uuid,                          -- fk below
  source_record_id uuid references public.source_records(id) on delete set null,
  claim_field     text not null,                 -- e.g. 'financials.revenue', 'signal.funding', 'identity.employee_count'
  claim_text      text not null,
  fact_type       text not null check (fact_type in ('reported_fact','dated_filing','third_party_estimate','inference','unknown')),
  value_numeric   numeric,
  value_currency  text check (value_currency in ('GBP','INR','USD') or value_currency is null),
  value_as_of     date,
  source_name     text not null,
  source_url      text,
  published_at    timestamptz,
  retrieved_at    timestamptz not null default now(),
  excerpt         text,
  licence_notes   text,
  confidence      numeric(3,2) not null check (confidence between 0 and 1),
  review_by       date,
  is_adverse      boolean not null default false,
  status          text not null default 'active' check (status in ('active','superseded','disputed','rejected')),
  superseded_by   uuid references public.evidence_items(id),
  created_by_type text not null default 'user' check (created_by_type in ('user','agent','import','system')),
  agent_execution_id uuid references public.agent_executions(id),
  created_by      uuid references auth.users(id),
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now()
);
create index on public.evidence_items(organisation_id, claim_field) where status = 'active';
create index on public.evidence_items(workspace_id, retrieved_at desc);

create table public.organisation_financials (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  market          text not null check (market in ('UK','IN')),
  period_end      date,
  metric          text not null check (metric in ('revenue','revenue_growth_pct','operating_profit','net_profit','total_assets','net_assets','cash','total_debt','equity_raised','funding_round','capex_plan')),
  amount          numeric,
  currency        text check (currency in ('GBP','INR','USD') or currency is null),
  fact_type       text not null check (fact_type in ('reported_fact','dated_filing','third_party_estimate','inference','unknown')),
  evidence_id     uuid references public.evidence_items(id) on delete set null,
  notes           text,
  created_at      timestamptz not null default now()
);
create index on public.organisation_financials(organisation_id, metric, period_end desc);

create table public.organisation_brands (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name            text not null,
  category        text,
  markets         text[] not null default '{}',
  evidence_id     uuid references public.evidence_items(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (organisation_id, name)
);

create table public.organisation_risk_flags (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  kind            text not null check (kind in ('dissolved','insolvency','filing_issue','regulatory','identity_mismatch','domain_legitimacy','reputational','sanctions','other')),
  severity        text not null check (severity in ('info','warning','critical')),
  summary         text not null,
  evidence_id     uuid references public.evidence_items(id) on delete set null,
  status          text not null default 'needs_review' check (status in ('needs_review','confirmed','dismissed')),
  reviewed_by     uuid references auth.users(id),
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);

create table public.organisation_news (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  headline        text not null,
  publisher       text not null,
  published_at    date not null,
  url             text not null,
  is_press_release boolean not null default false,
  summary         text,
  commercial_relevance text,
  advisory_implication text,
  syndication_group text,
  evidence_id     uuid references public.evidence_items(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (organisation_id, url)
);

-- ---------------------------------------------------------------- contacts
create table public.contacts (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  full_name       text not null,
  first_name      text,
  last_name       text,
  normalised_name text not null,
  market          text check (market in ('UK','IN') or market is null),
  location        text,
  linkedin_url    text,
  verification_status text not null default 'candidate' check (verification_status in ('verified','candidate','missing')),
  -- direct-marketing compliance attributes
  subscriber_type text not null default 'unknown' check (subscriber_type in ('corporate','individual','unknown')),
  lawful_basis    text not null default 'legitimate_interest' check (lawful_basis in ('legitimate_interest','consent','existing_relationship','none')),
  opted_out_at    timestamptz,
  outreach_status text not null default 'not_contacted',
  last_interaction_at timestamptz,
  owner_user_id   uuid references auth.users(id),
  notes           text,
  is_demo         boolean not null default false,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create trigger trg_contacts_updated before update on public.contacts for each row execute function public.set_updated_at();
create index contacts_name_trgm on public.contacts using gin (normalised_name gin_trgm_ops);
alter table public.evidence_items add constraint evidence_contact_fk foreign key (contact_id) references public.contacts(id) on delete cascade;

create table public.contact_organisations (
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  contact_id      uuid not null references public.contacts(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  title           text,
  role_category   text check (role_category in ('founder','ceo_md','cco','cmo','head_strategy','brand_director','marketing_director','growth_director','bu_director','other_senior','other') or role_category is null),
  buyer_relevance smallint check (buyer_relevance between 0 and 100),
  is_current      boolean not null default true,
  source          text,
  created_at      timestamptz not null default now(),
  primary key (contact_id, organisation_id)
);
create index on public.contact_organisations(organisation_id);

create table public.contact_channels (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  contact_id      uuid references public.contacts(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete cascade,   -- for org-level role inboxes
  channel         text not null check (channel in ('email','linkedin','phone','other')),
  value           citext not null,
  -- email quality: named-person business addresses rank above role inboxes (founder rule)
  email_quality   text check (email_quality in ('personal_named','personal_unknown','role_generic','free_mail') or email_quality is null),
  verification_status text not null default 'candidate' check (verification_status in ('verified','candidate','missing','invalid')),
  verification_method text check (verification_method in ('source_document','user_confirmed','reply_received','vendor_check','import_unverified','pattern_inferred') or verification_method is null),
  verified_at     timestamptz,
  source          text,
  confidence      numeric(3,2) check (confidence between 0 and 1),
  is_primary      boolean not null default false,
  bounced_at      timestamptz,
  created_at      timestamptz not null default now(),
  check (contact_id is not null or organisation_id is not null),
  -- an inferred pattern can never be "verified"
  check (not (verification_method = 'pattern_inferred' and verification_status = 'verified'))
);
create unique index contact_channels_uq on public.contact_channels(workspace_id, channel, value);
create index on public.contact_channels(contact_id);

create table public.suppression_entries (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  kind            text not null check (kind in ('email','domain','contact','organisation','linkedin')),
  value           citext not null,
  reason          text not null check (reason in ('opt_out','bounce','do_not_contact','complaint','legal','manual')),
  notes           text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  unique (workspace_id, kind, value)
);

-- ---------------------------------------------------------------- imports & resolution
create table public.import_batches (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  file_name     text not null,
  file_path     text,                  -- storage path
  sheet_name    text,
  status        text not null default 'uploaded' check (status in ('uploaded','mapped','previewed','committing','committed','failed','reverted')),
  mapping       jsonb,                 -- confirmed header → field map
  stats         jsonb not null default '{}'::jsonb,
  error         text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  committed_at  timestamptz,
  reverted_at   timestamptz
);

create table public.import_rows (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  batch_id      uuid not null references public.import_batches(id) on delete cascade,
  row_number    int not null,
  raw           jsonb not null,
  normalised    jsonb,
  action        text check (action in ('create','merge','skip','error') or action is null),
  status        text not null default 'pending' check (status in ('pending','committed','error','skipped','reverted')),
  errors        jsonb not null default '[]'::jsonb,
  warnings      jsonb not null default '[]'::jsonb,
  organisation_id uuid references public.organisations(id) on delete set null,
  contact_id    uuid references public.contacts(id) on delete set null,
  created_entities jsonb not null default '{}'::jsonb,   -- for batch reversal
  unique (batch_id, row_number)
);

create table public.entity_resolution_matches (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  entity_type     text not null check (entity_type in ('organisation','contact')),
  candidate_ref   text not null,             -- import_row id or source record id
  matched_id      uuid,
  score           numeric(4,3) not null,
  signals         jsonb not null,            -- {domain:true, regno:false, name_sim:0.82, market:true}
  decision        text not null default 'proposed' check (decision in ('proposed','accepted','rejected','auto_merged')),
  decided_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

select public._apply_ws_rls('data_sources');
select public._apply_ws_rls('organisations');
select public._apply_ws_rls('organisation_aliases');
select public._apply_ws_rls('organisation_market_profiles');
select public._apply_ws_rls('source_records');
select public._apply_ws_rls('evidence_items');
select public._apply_ws_rls('organisation_financials');
select public._apply_ws_rls('organisation_brands');
select public._apply_ws_rls('organisation_risk_flags');
select public._apply_ws_rls('organisation_news');
select public._apply_ws_rls('contacts');
select public._apply_ws_rls('contact_organisations');
select public._apply_ws_rls('contact_channels');
select public._apply_ws_rls('suppression_entries');
select public._apply_ws_rls('import_batches');
select public._apply_ws_rls('import_rows');
select public._apply_ws_rls('entity_resolution_matches');
