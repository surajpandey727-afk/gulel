-- Jobs queue, ops logs, pipeline, insights, analytics RPCs, workspace seeding, demo data controls

-- ---------------------------------------------------------------- durable jobs
create table public.jobs (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  type            text not null,     -- 'gmail_sync','classify_reply','qualify','governance','voice_extract','followup_scan'
  payload         jsonb not null default '{}'::jsonb,
  status          text not null default 'queued' check (status in ('queued','running','succeeded','failed','dead_letter','cancelled')),
  attempts        int not null default 0,
  max_attempts    int not null default 5,
  run_after       timestamptz not null default now(),
  timeout_seconds int not null default 300,
  locked_at       timestamptz,
  locked_by       text,
  idempotency_key text,
  correlation_id  uuid not null default gen_random_uuid(),
  result          jsonb,
  last_error      text,
  cost_usd        numeric(12,6) not null default 0,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  finished_at     timestamptz
);
create trigger trg_jobs_updated before update on public.jobs for each row execute function public.set_updated_at();
alter table public.jobs add constraint jobs_idem_uq unique (workspace_id, type, idempotency_key);
create index jobs_ready on public.jobs(status, run_after) where status in ('queued','failed');

-- Claim up to n ready jobs; reclaims jobs whose lock outlived their timeout.
create or replace function public.claim_jobs(p_worker text, p_limit int default 5)
returns setof public.jobs language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.jobs j set status = 'running', locked_at = now(), locked_by = p_worker, attempts = j.attempts + 1
   where j.id in (
     select id from public.jobs
      where (status in ('queued','failed') and run_after <= now() and attempts < max_attempts)
         or (status = 'running' and locked_at < now() - make_interval(secs => timeout_seconds))
      order by run_after
      limit p_limit
      for update skip locked)
  returning j.*;
end $$;
revoke execute on function public.claim_jobs(text, int) from anon, authenticated;

create or replace function public.finish_job(p_job_id uuid, p_ok boolean, p_result jsonb, p_error text, p_cost numeric default 0)
returns void language plpgsql security definer set search_path = public as $$
declare j record;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if p_ok then
    update public.jobs set status = 'succeeded', result = p_result, finished_at = now(), locked_at = null, cost_usd = cost_usd + p_cost where id = j.id;
  else
    update public.jobs set
      status = case when j.attempts >= j.max_attempts then 'dead_letter' else 'failed' end,
      last_error = p_error, locked_at = null, cost_usd = cost_usd + p_cost,
      run_after = now() + make_interval(secs => least(3600, (30 * power(2, j.attempts))::int))
    where id = j.id;
    insert into public.system_errors(workspace_id, source, message, correlation_id, context)
    values (j.workspace_id, 'job:'||j.type, p_error, j.correlation_id, jsonb_build_object('job_id', j.id, 'attempt', j.attempts));
  end if;
end $$;

create table public.system_errors (
  id              bigint generated always as identity primary key,
  workspace_id    uuid references public.workspaces(id) on delete cascade,
  source          text not null,
  message         text not null,
  correlation_id  uuid,
  context         jsonb not null default '{}'::jsonb,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);
-- finish_job references system_errors; function bodies resolve at call time, so ordering is fine.

create table public.integration_events (
  id              bigint generated always as identity primary key,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  integration     text not null,       -- 'gmail','anthropic','omniroute'
  event           text not null,       -- 'connected','token_refreshed','sync_completed','error','rate_limited'
  status          text not null check (status in ('ok','error','warning')),
  detail          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index on public.integration_events(workspace_id, integration, created_at desc);

-- ---------------------------------------------------------------- pipeline
create table public.opportunities (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  contact_id      uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  name            text not null,
  service         text,
  stage           text not null default 'discovery' check (stage in ('discovery','meeting','scoping','proposal','negotiation','won','lost','nurture')),
  market          text not null check (market in ('UK','IN')),
  currency        text not null check (currency in ('GBP','INR')),
  value_amount    numeric check (value_amount >= 0),
  value_basis     text check (value_basis in ('pricing_assumption','client_stated','proposal','contract') or value_basis is null),
  probability_pct int check (probability_pct between 0 and 100),
  expected_close_on date,
  actual_value_amount numeric,
  reason_lost     text,
  next_action     text,
  next_action_due date,
  owner_user_id   uuid references auth.users(id),
  discovery_notes text,
  lead_source     text,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  closed_at       timestamptz,
  check ((market = 'UK' and currency = 'GBP') or (market = 'IN' and currency = 'INR')),
  check (stage <> 'won' or actual_value_amount is not null),
  check (stage <> 'lost' or reason_lost is not null)
);
create trigger trg_opp_updated before update on public.opportunities for each row execute function public.set_updated_at();

create table public.opportunity_events (
  id              bigint generated always as identity primary key,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  opportunity_id  uuid not null references public.opportunities(id) on delete cascade,
  from_stage      text,
  to_stage        text not null,
  actor_id        uuid,
  created_at      timestamptz not null default now()
);
create or replace function public.log_opportunity_stage() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    insert into public.opportunity_events(workspace_id, opportunity_id, from_stage, to_stage, actor_id)
    values (new.workspace_id, new.id, case when tg_op='UPDATE' then old.stage end, new.stage, auth.uid());
    if new.stage in ('won','lost') then new.closed_at := coalesce(new.closed_at, now()); end if;
  end if;
  return new;
end $$;
create trigger trg_opp_stage_ins after insert on public.opportunities for each row execute function public.log_opportunity_stage();
create trigger trg_opp_stage_upd before update of stage on public.opportunities for each row execute function public.log_opportunity_stage();

create table public.meetings (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete cascade,
  contact_id      uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  opportunity_id  uuid references public.opportunities(id) on delete set null,
  status          text not null default 'requested' check (status in ('requested','booked','held','cancelled','no_show')),
  scheduled_at    timestamptz,
  prep_brief      text,
  notes           text,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now()
);

create table public.insights (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  question        text,
  conclusion      text not null,
  body            jsonb not null default '{}'::jsonb,   -- numbers, linked records, caveats, next_action
  status          text not null default 'new' check (status in ('new','saved','dismissed','converted')),
  task_id         uuid references public.tasks(id) on delete set null,
  agent_execution_id uuid references public.agent_executions(id),
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

select public._apply_ws_rls('jobs');
select public._apply_ws_rls('integration_events');
select public._apply_ws_rls('opportunities');
select public._apply_ws_rls('opportunity_events');
select public._apply_ws_rls('meetings');
select public._apply_ws_rls('insights');
alter table public.system_errors enable row level security;
create policy system_errors_sel on public.system_errors for select using (workspace_id is not null and public.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------- analytics
-- All metrics carry explicit denominators. Person-level metrics are distinct contacts; message-level are rows.
create or replace function public.kpi_summary(p_workspace_id uuid, p_from timestamptz, p_to timestamptz,
                                              p_market text default null, p_include_demo boolean default false)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  r jsonb; threshold int;
  discovered int; qualified int; reached int; msgs_api int; msgs_manual int; responded int; positive int;
  meetings int; awaiting int; followups int; pipeline jsonb; won jsonb; qualified_pipeline int;
begin
  if not public.is_workspace_member(p_workspace_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(qualified_threshold,70) into threshold from public.scoring_models where workspace_id = p_workspace_id and is_active;
  threshold := coalesce(threshold, 70);

  select count(*) into discovered from public.organisations o
   where o.workspace_id = p_workspace_id and o.deleted_at is null and o.created_at between p_from and p_to
     and (p_market is null or o.primary_market = p_market) and (p_include_demo or not o.is_demo);

  select count(*) into qualified from public.lead_qualifications q join public.organisations o on o.id = q.organisation_id
   where q.workspace_id = p_workspace_id and q.is_current and coalesce(q.override_score, q.score) >= threshold
     and o.deleted_at is null and (p_market is null or o.primary_market = p_market) and (p_include_demo or not o.is_demo);

  select count(distinct coalesce(m.contact_id::text, m.recipient_value)) filter (where m.delivery_status in ('sent_confirmed','manual_confirmed')),
         count(*) filter (where m.delivery_status = 'sent_confirmed'),
         count(*) filter (where m.delivery_status = 'manual_confirmed')
    into reached, msgs_api, msgs_manual
    from public.outbound_messages m
   where m.workspace_id = p_workspace_id and m.sent_at between p_from and p_to
     and (p_market is null or m.market = p_market) and (p_include_demo or not m.is_demo);

  -- respondents: reached contacts who sent an inbound message after our first outbound in range
  with reached_c as (
    select coalesce(m.contact_id::text, m.recipient_value) k, m.conversation_id, min(m.sent_at) first_sent
      from public.outbound_messages m
     where m.workspace_id = p_workspace_id and m.sent_at between p_from and p_to
       and m.delivery_status in ('sent_confirmed','manual_confirmed')
       and (p_market is null or m.market = p_market) and (p_include_demo or not m.is_demo)
     group by 1, 2),
  inbound as (
    select rc.k, cm.id msg_id from reached_c rc
      join public.conversation_messages cm on cm.conversation_id = rc.conversation_id
     where cm.direction = 'inbound' and cm.occurred_at > rc.first_sent)
  select count(distinct i.k),
         count(distinct i.k) filter (where coalesce(cc.final, cc.proposed) in ('positive','meeting_request'))
    into responded, positive
    from inbound i left join public.conversation_classifications cc on cc.conversation_message_id = i.msg_id;

  select count(*) into meetings from public.meetings mt
    left join public.organisations o on o.id = mt.organisation_id
   where mt.workspace_id = p_workspace_id and mt.status in ('booked','held') and mt.created_at between p_from and p_to
     and (p_market is null or o.primary_market = p_market) and (p_include_demo or not mt.is_demo);

  select count(*) into awaiting from public.approval_requests a
    join public.outreach_drafts d on d.id = a.draft_id join public.organisations o on o.id = d.organisation_id
   where a.workspace_id = p_workspace_id and a.status = 'pending'
     and (p_market is null or o.primary_market = p_market) and (p_include_demo or not d.is_demo);

  select count(*) into followups from public.tasks t left join public.organisations o on o.id = t.organisation_id
   where t.workspace_id = p_workspace_id and t.status = 'open' and t.due_at <= now()
     and (p_market is null or o.primary_market = p_market);

  select count(*) into qualified_pipeline from public.opportunities op
   where op.workspace_id = p_workspace_id and op.stage not in ('won','lost','nurture')
     and (p_market is null or op.market = p_market) and (p_include_demo or not op.is_demo);

  -- currencies are never combined
  select coalesce(jsonb_object_agg(currency, total), '{}'::jsonb) into pipeline from (
    select op.currency, sum(op.value_amount) total from public.opportunities op
     where op.workspace_id = p_workspace_id and op.stage not in ('won','lost','nurture') and op.value_amount is not null
       and op.value_basis is not null
       and (p_market is null or op.market = p_market) and (p_include_demo or not op.is_demo)
     group by op.currency) x;
  select coalesce(jsonb_object_agg(currency, total), '{}'::jsonb) into won from (
    select op.currency, sum(op.actual_value_amount) total from public.opportunities op
     where op.workspace_id = p_workspace_id and op.stage = 'won' and op.closed_at between p_from and p_to
       and (p_market is null or op.market = p_market) and (p_include_demo or not op.is_demo)
     group by op.currency) x;

  return jsonb_build_object(
    'organisations_discovered', discovered,
    'qualified_leads', qualified, 'qualified_threshold', threshold,
    'qualified_pipeline', qualified_pipeline,
    'unique_people_reached', reached,
    'messages_sent_confirmed', msgs_api,
    'linkedin_manual_confirmed', msgs_manual,
    'people_responded', responded,
    'positive_responders', positive,
    'reply_rate', case when reached > 0 then round(responded::numeric / reached, 4) end,
    'positive_reply_rate', case when reached > 0 then round(positive::numeric / reached, 4) end,
    'meetings_booked', meetings,
    'meeting_conversion', case when reached > 0 then round(meetings::numeric / reached, 4) end,
    'awaiting_approval', awaiting,
    'followups_due', followups,
    'pipeline_value_by_currency', pipeline,
    'won_revenue_by_currency', won,
    'sample_size_reached', reached);
end $$;

create or replace function public.funnel_summary(p_workspace_id uuid, p_from timestamptz, p_to timestamptz,
                                                 p_market text default null, p_include_demo boolean default false)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare threshold int; res jsonb;
begin
  if not public.is_workspace_member(p_workspace_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select qualified_threshold into threshold from public.scoring_models where workspace_id = p_workspace_id and is_active;
  threshold := coalesce(threshold, 70);
  with orgs as (
    select o.id from public.organisations o
     where o.workspace_id = p_workspace_id and o.deleted_at is null and o.created_at between p_from and p_to
       and (p_market is null or o.primary_market = p_market) and (p_include_demo or not o.is_demo))
  select jsonb_build_array(
    jsonb_build_object('stage','discovered','count',(select count(*) from orgs)),
    jsonb_build_object('stage','qualified','count',(select count(*) from orgs join public.lead_qualifications q on q.organisation_id = orgs.id and q.is_current and coalesce(q.override_score,q.score) >= threshold)),
    jsonb_build_object('stage','contacted','count',(select count(distinct m.organisation_id) from public.outbound_messages m join orgs on orgs.id = m.organisation_id)),
    jsonb_build_object('stage','replied','count',(select count(distinct c.organisation_id) from public.conversations c join orgs on orgs.id = c.organisation_id where c.last_inbound_at is not null)),
    jsonb_build_object('stage','meeting','count',(select count(distinct mt.organisation_id) from public.meetings mt join orgs on orgs.id = mt.organisation_id where mt.status in ('booked','held'))),
    jsonb_build_object('stage','opportunity','count',(select count(distinct op.organisation_id) from public.opportunities op join orgs on orgs.id = op.organisation_id)),
    jsonb_build_object('stage','won','count',(select count(distinct op.organisation_id) from public.opportunities op join orgs on orgs.id = op.organisation_id where op.stage = 'won'))
  ) into res;
  return res;
end $$;

-- ---------------------------------------------------------------- workspace seeding
create or replace function public.handle_new_workspace() returns trigger
language plpgsql security definer set search_path = public as $$
declare vp uuid; vv uuid;
begin
  insert into public.workspace_settings(workspace_id) values (new.id) on conflict do nothing;
  insert into public.scoring_models(workspace_id, version_no, is_active, weights, notes) values (new.id, 1, true,
    '{"strategic_need":20,"buying_intent":20,"financial_capacity":15,"trigger_strength":15,"decision_maker_access":10,"growth_scale":10,"procurement_readiness":5,"credibility":5}'::jsonb,
    'Initial published weights (spec §6). Operating thresholds, not validated classifications.');
  insert into public.data_sources(workspace_id, key, name, kind) values
    (new.id, 'manual', 'Manual entry', 'manual'),
    (new.id, 'import', 'Spreadsheet import', 'import'),
    (new.id, 'website', 'Company website', 'website'),
    (new.id, 'companies_house', 'Companies House', 'registry'),
    (new.id, 'mca', 'MCA (India)', 'registry'),
    (new.id, 'news', 'News & publications', 'news'),
    (new.id, 'ai_research', 'AI research (requires citation)', 'ai_research');
  insert into public.agent_configurations(workspace_id, agent, model, effort) values
    (new.id, 'discovery', 'claude-opus-5-5', 'medium'),
    (new.id, 'governance', 'claude-opus-5-5', 'high'),
    (new.id, 'analyst', 'claude-opus-5-5', 'medium'),
    (new.id, 'voice', 'claude-opus-5-5', 'high'),
    (new.id, 'classifier', 'claude-opus-5-5', 'low');
  insert into public.voice_profiles(workspace_id) values (new.id) returning id into vp;
  insert into public.voice_profile_versions(workspace_id, profile_id, version_no, source, dna, generation_prompt)
  values (new.id, vp, 1, 'default',
    '{"status":"provisional","formality":"professional, unstuffy","sentence_length":"short to medium","directness":"high","assertiveness":"confident without self-importance","persuasion_style":"evidence-led commercial observation","openings":["a specific, relevant commercial observation"],"conclusions":["one clear, low-friction next step"],"avoid":["generic compliments","artificial enthusiasm","agency pitch language","exaggerated promises","bloated introductions","false urgency","AI-style filler (e.g. I hope this finds you well, delve, leverage, synergy)"],"preserve":["distinction between upstream advisory and downstream execution"]}'::jsonb,
    'Write as the founder of Nishaan-a, an independent upstream strategy practice. Be human, commercially astute and strategically precise. Confident, never self-important. Simple language, sophisticated judgement. Concise, never vague. Lead with a specific commercial observation grounded in the evidence provided, not a compliment. State the practical business consequence. No artificial enthusiasm, no agency pitch language, no exaggerated promises, no false urgency, no mechanical AI phrasing. Keep strategy (what Nishaan-a does) distinct from execution (handled by partners). End with a single, easy next step.')
  returning id into vv;
  update public.voice_profiles set active_version_id = vv where id = vp;
  return new;
end $$;

-- ---------------------------------------------------------------- demo data controls
create or replace function public.reset_demo_data(p_workspace_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_org int; n_contact int;
begin
  if not public.has_workspace_role(p_workspace_id, array['owner']) then raise exception 'owner only' using errcode = '42501'; end if;
  delete from public.opportunities where workspace_id = p_workspace_id and is_demo;
  delete from public.meetings where workspace_id = p_workspace_id and is_demo;
  delete from public.outbound_messages where workspace_id = p_workspace_id and is_demo;
  delete from public.send_jobs sj using public.approval_requests a, public.outreach_drafts d
   where sj.approval_id = a.id and a.draft_id = d.id and d.workspace_id = p_workspace_id and d.is_demo;
  delete from public.conversations where workspace_id = p_workspace_id and is_demo;
  delete from public.outreach_drafts where workspace_id = p_workspace_id and is_demo;
  with d as (delete from public.contacts where workspace_id = p_workspace_id and is_demo returning 1) select count(*) into n_contact from d;
  with d as (delete from public.organisations where workspace_id = p_workspace_id and is_demo returning 1) select count(*) into n_org from d;
  insert into public.audit_logs(workspace_id, actor_type, actor_id, action, metadata)
  values (p_workspace_id, 'user', auth.uid()::text, 'demo.reset', jsonb_build_object('organisations', n_org, 'contacts', n_contact));
  return jsonb_build_object('organisations', n_org, 'contacts', n_contact);
end $$;

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public) values ('imports', 'imports', false) on conflict do nothing;
create policy "imports_member_rw" on storage.objects for all to authenticated
  using (bucket_id = 'imports' and public.is_workspace_member((storage.foldername(name))[1]::uuid))
  with check (bucket_id = 'imports' and public.is_workspace_member((storage.foldername(name))[1]::uuid));

-- ---------------------------------------------------------------- internal notes on conversations / contacts
create table public.notes (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  contact_id      uuid references public.contacts(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete cascade,
  body            text not null check (length(body) > 0),
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);
create index on public.notes(conversation_id);
select public._apply_ws_rls('notes');
