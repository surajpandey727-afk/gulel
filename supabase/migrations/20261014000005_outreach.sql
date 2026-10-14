-- Outreach: channel accounts, strategies, drafts, immutable versions, approvals, execution, conversations

-- ---------------------------------------------------------------- channel accounts (Gmail etc.)
create table public.channel_accounts (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  channel       text not null check (channel in ('gmail','linkedin')),
  account_email citext,
  display_name  text,
  status        text not null default 'not_configured'
                check (status in ('not_configured','connected','failed','permission_restricted','rate_limited','stale','awaiting_user_action','disconnected')),
  scopes        text[] not null default '{}',
  history_id    text,                 -- Gmail incremental sync cursor
  last_sync_at  timestamptz,
  last_error    text,
  connected_by  uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, channel, account_email)
);
create trigger trg_ca_updated before update on public.channel_accounts for each row execute function public.set_updated_at();

create table public.channel_account_secrets (
  account_id    uuid primary key references public.channel_accounts(id) on delete cascade,
  ciphertext    text not null,       -- encrypted JSON {refresh_token, access_token, expiry}
  key_version   int not null default 1,
  updated_at    timestamptz not null default now()
);
alter table public.channel_account_secrets enable row level security;   -- service role only

-- ---------------------------------------------------------------- conversations
create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete set null,
  contact_id      uuid references public.contacts(id) on delete set null,
  channel         text not null check (channel in ('gmail','linkedin')),
  channel_account_id uuid references public.channel_accounts(id) on delete set null,
  provider_thread_id text,
  subject         text,
  market          text check (market in ('UK','IN') or market is null),
  status          text not null default 'not_contacted' check (status in (
                    'not_contacted','drafted','awaiting_approval','approved','sent','awaiting_response','replied',
                    'qualified_conversation','meeting_requested','meeting_booked','opportunity','proposal',
                    'won','lost','nurture','bounced','failed','deferred','opted_out','invalid_contact','do_not_contact','archived')),
  last_outbound_at timestamptz,
  last_inbound_at  timestamptz,
  latest_classification text,
  needs_review    boolean not null default false,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_conv_updated before update on public.conversations for each row execute function public.set_updated_at();
create unique index conv_thread_uq on public.conversations(workspace_id, channel, provider_thread_id) where provider_thread_id is not null;
create index on public.conversations(workspace_id, status);
create index on public.conversations(contact_id);

create table public.conversation_events (
  id              bigint generated always as identity primary key,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  from_status     text,
  to_status       text not null,
  actor_type      text not null check (actor_type in ('user','agent','system','gateway')),
  actor_id        text,
  note            text,
  created_at      timestamptz not null default now()
);
create trigger trg_ce_immutable before update on public.conversation_events for each row execute function public.forbid_mutation();

create or replace function public.log_conversation_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.conversation_events(workspace_id, conversation_id, from_status, to_status, actor_type, actor_id)
    values (new.workspace_id, new.id, case when tg_op = 'UPDATE' then old.status end, new.status,
            case when auth.uid() is null then 'system' else 'user' end, auth.uid()::text);
  end if;
  return new;
end $$;
create trigger trg_conv_status after insert or update of status on public.conversations
  for each row execute function public.log_conversation_status();

-- ---------------------------------------------------------------- governance strategy
create table public.outreach_strategies (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  qualification_id uuid references public.lead_qualifications(id) on delete set null,
  decision        text not null check (decision in ('outreach_recommended','further_research','nurture_later','already_in_conversation','no_justified_approach','suppressed')),
  strategic_problem text,
  service_offering text,
  advisory_readiness text,
  recommended_contact_id uuid references public.contacts(id) on delete set null,
  recommended_channel text check (recommended_channel in ('gmail','linkedin') or recommended_channel is null),
  timing_rationale text,
  communication_objective text,
  reasoning       jsonb not null default '{}'::jsonb,
  evidence_ids    uuid[] not null default '{}',
  agent_execution_id uuid references public.agent_executions(id),
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);
create index on public.outreach_strategies(organisation_id, created_at desc);

-- ---------------------------------------------------------------- drafts & immutable versions
create table public.outreach_drafts (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  contact_id      uuid references public.contacts(id) on delete set null,
  strategy_id     uuid references public.outreach_strategies(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  channel         text not null check (channel in ('gmail','linkedin')),
  kind            text not null default 'cold' check (kind in ('cold','warm_intro','connection_note','linkedin_message','reply','follow_up','meeting_request','proposal_intro','partnership','referral','re_engagement')),
  status          text not null default 'draft' check (status in ('draft','awaiting_approval','approved','sent','rejected','deferred','superseded','archived')),
  current_version_id uuid,
  provider_draft_id text,          -- Gmail draft id (draft != sent)
  provider_draft_synced_version_id uuid,
  suggested_follow_up_on date,
  is_demo         boolean not null default false,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_od_updated before update on public.outreach_drafts for each row execute function public.set_updated_at();
create index on public.outreach_drafts(workspace_id, status);
create index on public.outreach_drafts(organisation_id);

create table public.draft_versions (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  draft_id        uuid not null references public.outreach_drafts(id) on delete cascade,
  version_no      int not null,
  channel         text not null check (channel in ('gmail','linkedin')),
  sending_account_id uuid references public.channel_accounts(id) on delete set null,
  recipient_channel_id uuid references public.contact_channels(id) on delete set null,
  recipient_value text not null,       -- email address or LinkedIn profile URL
  subject         text,
  body            text not null check (length(body) > 0),
  source          text not null check (source in ('governance','user_edit','refine','regenerate','manual')),
  refine_action   text,
  strategic_angle text,
  supporting_evidence_ids uuid[] not null default '{}',
  quality         jsonb not null default '{}'::jsonb,   -- {tone_match, factuality:{status,issues}, compliance:{eligible,reasons}}
  voice_version_id uuid references public.voice_profile_versions(id),
  agent_execution_id uuid references public.agent_executions(id),
  fingerprint     text generated always as (
                    encode(extensions.digest(
                      channel || chr(31) || coalesce(sending_account_id::text,'') || chr(31) ||
                      lower(recipient_value) || chr(31) || coalesce(subject,'') || chr(31) || body, 'sha256'), 'hex')
                  ) stored,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  unique (draft_id, version_no)
);
create trigger trg_dv_immutable before update on public.draft_versions for each row execute function public.forbid_mutation();
alter table public.outreach_drafts add constraint od_current_version_fk foreign key (current_version_id) references public.draft_versions(id) on delete set null;
alter table public.voice_feedback add constraint vf_draft_version_fk foreign key (draft_version_id) references public.draft_versions(id) on delete set null;

-- ---------------------------------------------------------------- approvals
create table public.approval_requests (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  draft_id        uuid not null references public.outreach_drafts(id) on delete cascade,
  draft_version_id uuid not null references public.draft_versions(id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending','approved','rejected','snoozed','invalidated','consumed','expired')),
  -- immutable approval reference: what exactly is being authorised
  content_fingerprint text not null,
  channel         text not null,
  recipient_value text not null,
  subject         text,
  sending_account_id uuid references public.channel_accounts(id) on delete set null,
  approved_action text not null default 'send' check (approved_action in ('send','manual_handoff')),
  approved_by     uuid references auth.users(id),
  approved_at     timestamptz,
  expires_at      timestamptz,
  proposed_send_at timestamptz,
  snoozed_until   timestamptz,
  decision_reason text,
  assigned_to     uuid references auth.users(id),
  batch_id        uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (status <> 'approved' or (approved_by is not null and approved_at is not null))
);
create trigger trg_ar_updated before update on public.approval_requests for each row execute function public.set_updated_at();
create unique index ar_one_open_per_draft on public.approval_requests(draft_id) where status in ('pending','approved','snoozed');
create index on public.approval_requests(workspace_id, status);

create table public.approval_events (
  id              bigint generated always as identity primary key,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  approval_id     uuid not null references public.approval_requests(id) on delete cascade,
  event           text not null,
  actor_type      text not null check (actor_type in ('user','agent','system','gateway')),
  actor_id        text,
  content_fingerprint text,
  detail          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create trigger trg_ae_immutable before update on public.approval_events for each row execute function public.forbid_mutation();

-- New version ⇒ becomes current, and every open approval for the draft is invalidated.
create or replace function public.on_draft_version_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  update public.outreach_drafts
     set current_version_id = new.id,
         status = case when status in ('approved','awaiting_approval') then 'draft' else status end
   where id = new.draft_id;
  for r in select id from public.approval_requests
            where draft_id = new.draft_id and status in ('pending','approved','snoozed') loop
    update public.approval_requests set status = 'invalidated', decision_reason = 'content_changed' where id = r.id;
    insert into public.approval_events(workspace_id, approval_id, event, actor_type, actor_id, detail)
    values (new.workspace_id, r.id, 'invalidated', 'system', null, jsonb_build_object('reason','new_draft_version','version_id',new.id));
  end loop;
  return new;
end $$;
create trigger trg_dv_after_insert after insert on public.draft_versions
  for each row execute function public.on_draft_version_insert();

-- Request approval for the CURRENT version.
create or replace function public.request_approval(p_draft_id uuid, p_proposed_send_at timestamptz default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare d record; v record; aid uuid;
begin
  select * into d from public.outreach_drafts where id = p_draft_id for update;
  if d is null then raise exception 'draft not found'; end if;
  select * into v from public.draft_versions where id = d.current_version_id;
  if v is null then raise exception 'draft has no version'; end if;
  select id into aid from public.approval_requests
   where draft_id = d.id and draft_version_id = v.id and status in ('pending','snoozed','approved');
  if aid is not null then return aid; end if;
  insert into public.approval_requests(workspace_id, draft_id, draft_version_id, content_fingerprint, channel,
         recipient_value, subject, sending_account_id, approved_action, proposed_send_at)
  values (d.workspace_id, d.id, v.id, v.fingerprint, v.channel, v.recipient_value, v.subject, v.sending_account_id,
          case when v.channel = 'linkedin' then 'manual_handoff' else 'send' end, p_proposed_send_at)
  returning id into aid;
  update public.outreach_drafts set status = 'awaiting_approval' where id = d.id;
  insert into public.approval_events(workspace_id, approval_id, event, actor_type, actor_id, content_fingerprint)
  values (d.workspace_id, aid, 'requested', 'user', auth.uid()::text, v.fingerprint);
  return aid;
end $$;

-- Human decision. Only a workspace owner/reviewer may approve; agents (no auth.uid()) cannot.
create or replace function public.decide_approval(p_approval_id uuid, p_decision text, p_reason text default null, p_snooze_until timestamptz default null)
returns text language plpgsql security definer set search_path = public as $$
declare a record; d record; v record; ttl int;
begin
  if auth.uid() is null then raise exception 'approval requires an authenticated human' using errcode = '42501'; end if;
  select * into a from public.approval_requests where id = p_approval_id for update;
  if a is null then raise exception 'approval not found'; end if;
  if not public.has_workspace_role(a.workspace_id, array['owner','reviewer']) then
    raise exception 'not authorised to decide approvals' using errcode = '42501';
  end if;
  if a.status not in ('pending','snoozed') then raise exception 'approval is %', a.status; end if;
  select * into d from public.outreach_drafts where id = a.draft_id;
  select * into v from public.draft_versions where id = d.current_version_id;

  if p_decision = 'approve' then
    if v.id <> a.draft_version_id or v.fingerprint <> a.content_fingerprint then
      update public.approval_requests set status = 'invalidated', decision_reason = 'stale_version' where id = a.id;
      return 'invalidated';
    end if;
    select approval_ttl_hours into ttl from public.workspace_settings where workspace_id = a.workspace_id;
    update public.approval_requests
       set status = 'approved', approved_by = auth.uid(), approved_at = now(),
           expires_at = now() + make_interval(hours => coalesce(ttl, 72)), decision_reason = p_reason
     where id = a.id;
    update public.outreach_drafts set status = 'approved' where id = a.draft_id;
  elsif p_decision = 'reject' then
    update public.approval_requests set status = 'rejected', decision_reason = p_reason where id = a.id;
    update public.outreach_drafts set status = 'rejected' where id = a.draft_id;
  elsif p_decision = 'snooze' then
    update public.approval_requests set status = 'snoozed', snoozed_until = coalesce(p_snooze_until, now() + interval '1 day'), decision_reason = p_reason where id = a.id;
  else
    raise exception 'unknown decision %', p_decision;
  end if;

  insert into public.approval_events(workspace_id, approval_id, event, actor_type, actor_id, content_fingerprint, detail)
  values (a.workspace_id, a.id, p_decision, 'user', auth.uid()::text, a.content_fingerprint, jsonb_build_object('reason', p_reason));
  insert into public.audit_logs(workspace_id, actor_type, actor_id, action, entity_type, entity_id, metadata)
  values (a.workspace_id, 'user', auth.uid()::text, 'approval.'||p_decision, 'approval_request', a.id,
          jsonb_build_object('fingerprint', a.content_fingerprint, 'recipient', a.recipient_value, 'channel', a.channel));
  return p_decision;
end $$;

-- ---------------------------------------------------------------- execution
create table public.send_jobs (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  approval_id     uuid not null unique references public.approval_requests(id),   -- idempotency: one send per approval
  status          text not null default 'sending' check (status in ('sending','sent','failed','dead')),
  attempts        int not null default 0,
  last_error      text,
  provider_response jsonb,
  correlation_id  uuid not null default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_sj_updated before update on public.send_jobs for each row execute function public.set_updated_at();

create table public.send_attempts (
  id              bigint generated always as identity primary key,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  send_job_id     uuid not null references public.send_jobs(id) on delete cascade,
  attempt_no      int not null,
  outcome         text not null check (outcome in ('success','retryable_error','permanent_error')),
  http_status     int,
  error           text,
  created_at      timestamptz not null default now()
);

create table public.outbound_messages (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  approval_id     uuid unique references public.approval_requests(id),
  draft_version_id uuid references public.draft_versions(id),
  conversation_id uuid references public.conversations(id) on delete set null,
  contact_id      uuid references public.contacts(id) on delete set null,
  organisation_id uuid references public.organisations(id) on delete set null,
  channel         text not null check (channel in ('gmail','linkedin')),
  recipient_value text not null,
  subject         text,
  body            text not null,
  delivery_status text not null check (delivery_status in ('sent_confirmed','manual_confirmed','bounced','failed')),
  provider_message_id text,
  provider_thread_id text,
  market          text,
  sent_at         timestamptz not null default now(),
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now()
);
create unique index om_provider_uq on public.outbound_messages(workspace_id, channel, provider_message_id) where provider_message_id is not null;
create index on public.outbound_messages(workspace_id, sent_at);

create table public.conversation_messages (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction       text not null check (direction in ('inbound','outbound')),
  source          text not null check (source in ('gmail_sync','gateway','manual_log')),
  provider_message_id text,
  from_value      text,
  to_value        text,
  subject         text,
  body_text       text,
  snippet         text,
  occurred_at     timestamptz not null,
  outbound_message_id uuid references public.outbound_messages(id) on delete set null,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now()
);
alter table public.conversation_messages add constraint cm_provider_uq unique (workspace_id, provider_message_id);
create index on public.conversation_messages(conversation_id, occurred_at);

create table public.conversation_classifications (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  conversation_message_id uuid not null references public.conversation_messages(id) on delete cascade,
  proposed        text not null check (proposed in ('positive','neutral','negative','meeting_request','referral','out_of_office','opt_out','bounce','question','not_now')),
  confidence      numeric(3,2),
  rationale       text,
  final           text check (final in ('positive','neutral','negative','meeting_request','referral','out_of_office','opt_out','bounce','question','not_now') or final is null),
  reviewed_by     uuid references auth.users(id),
  reviewed_at     timestamptz,
  agent_execution_id uuid references public.agent_executions(id),
  created_at      timestamptz not null default now()
);

create table public.manual_channel_events (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  channel         text not null check (channel in ('linkedin','phone','meeting','other')),
  event           text not null check (event in ('message_sent','reply_received','connection_sent','connection_accepted','call','meeting')),
  conversation_id uuid references public.conversations(id) on delete set null,
  contact_id      uuid references public.contacts(id) on delete set null,
  approval_id     uuid references public.approval_requests(id),
  body            text,
  occurred_at     timestamptz not null default now(),
  confirmed_by    uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

-- Deterministic pre-flight. p_claim = true atomically creates the send job (idempotent via unique approval_id).
create or replace function public.preflight_send(p_approval_id uuid, p_claim boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a record; d record; v record; c record; ch record; s record; acc record;
  reasons text[] := '{}'; warnings text[] := '{}';
  domain text; sent_today int; job_id uuid; recent_org timestamptz;
begin
  select * into a from public.approval_requests where id = p_approval_id for update;
  if a is null then return jsonb_build_object('ok', false, 'reasons', array['approval_not_found']); end if;
  if auth.uid() is not null and not public.is_workspace_member(a.workspace_id) then
    raise exception 'not a workspace member' using errcode = '42501';
  end if;
  select * into s from public.workspace_settings where workspace_id = a.workspace_id;
  select * into d from public.outreach_drafts where id = a.draft_id;
  select * into v from public.draft_versions where id = d.current_version_id;

  if a.status <> 'approved' then reasons := reasons || ('approval_'||a.status); end if;
  if a.expires_at is not null and a.expires_at < now() then reasons := reasons || 'approval_expired'::text; end if;
  if v.id is distinct from a.draft_version_id then reasons := reasons || 'draft_changed_since_approval'::text; end if;
  if v.fingerprint is distinct from a.content_fingerprint then reasons := reasons || 'fingerprint_mismatch'::text; end if;
  if exists (select 1 from public.outbound_messages where approval_id = a.id) then reasons := reasons || 'already_sent'::text; end if;
  if a.channel = 'linkedin' and a.approved_action <> 'manual_handoff' then reasons := reasons || 'channel_cannot_send_via_api'::text; end if;
  if p_claim and auth.uid() is not null and a.channel <> 'linkedin' then reasons := reasons || 'claim_requires_gateway'::text; end if;

  -- suppression & opt-outs
  domain := lower(split_part(a.recipient_value, '@', 2));
  if exists (select 1 from public.suppression_entries se where se.workspace_id = a.workspace_id and (
       (se.kind in ('email','linkedin') and se.value = a.recipient_value) or
       (se.kind = 'domain' and domain <> '' and se.value = domain) or
       (se.kind = 'contact' and se.value = coalesce(d.contact_id::text,'-')) or
       (se.kind = 'organisation' and se.value = d.organisation_id::text))) then
    reasons := reasons || 'suppressed'::text;
  end if;
  if d.contact_id is not null then
    select * into c from public.contacts where id = d.contact_id;
    if c.opted_out_at is not null then reasons := reasons || 'contact_opted_out'::text; end if;
    if c.deleted_at is not null then reasons := reasons || 'contact_deleted'::text; end if;
    -- PECR: individual subscribers need consent for unsolicited email marketing
    if s.require_compliance_check and a.channel = 'gmail' and c.subscriber_type = 'individual' and c.lawful_basis <> 'consent' then
      reasons := reasons || 'compliance_individual_subscriber_without_consent'::text;
    end if;
    if c.subscriber_type = 'unknown' then warnings := warnings || 'subscriber_type_unknown'::text; end if;
  end if;
  if exists (select 1 from public.organisations o where o.id = d.organisation_id and o.relationship_status = 'do_not_contact') then
    reasons := reasons || 'organisation_do_not_contact'::text;
  end if;
  select * into ch from public.contact_channels where workspace_id = a.workspace_id and value = a.recipient_value limit 1;
  if ch.id is not null then
    if ch.verification_status = 'invalid' or ch.bounced_at is not null then reasons := reasons || 'recipient_invalid_or_bounced'::text; end if;
    if ch.verification_status <> 'verified' then warnings := warnings || 'recipient_unverified'::text; end if;
    if ch.email_quality = 'role_generic' then warnings := warnings || 'generic_role_inbox'::text; end if;
  end if;

  -- new inbound since approval
  if d.conversation_id is not null and exists (select 1 from public.conversation_messages m
       where m.conversation_id = d.conversation_id and m.direction = 'inbound' and m.occurred_at > coalesce(a.approved_at, a.created_at)) then
    reasons := reasons || 'new_inbound_reply_since_approval'::text;
  end if;

  -- channel account
  if a.channel = 'gmail' then
    select * into acc from public.channel_accounts where id = a.sending_account_id;
    if acc.id is null then reasons := reasons || 'no_sending_account'::text;
    elsif acc.status <> 'connected' then reasons := reasons || ('sending_account_'||acc.status); end if;
  end if;

  -- pacing
  select count(*) into sent_today from public.outbound_messages
   where workspace_id = a.workspace_id and delivery_status = 'sent_confirmed' and sent_at >= date_trunc('day', now());
  if a.channel = 'gmail' and sent_today >= s.daily_send_cap then reasons := reasons || 'daily_send_cap_reached'::text; end if;
  select max(sent_at) into recent_org from public.outbound_messages
   where organisation_id = d.organisation_id and approval_id <> a.id;
  if recent_org is not null and recent_org > now() - make_interval(hours => s.min_hours_between_org_sends) then
    reasons := reasons || 'organisation_contacted_recently'::text;
  end if;

  if array_length(reasons,1) is null and p_claim then
    insert into public.send_jobs(workspace_id, approval_id, status, attempts)
    values (a.workspace_id, a.id, 'sending', 1)
    on conflict (approval_id) do nothing
    returning id into job_id;
    -- re-claim only a job that failed with a definite, retryable provider rejection (never an unknown outcome)
    if job_id is null then
      update public.send_jobs set status = 'sending', attempts = attempts + 1
       where approval_id = a.id and status = 'failed' and attempts < 3
      returning id into job_id;
    end if;
    if job_id is null then
      return jsonb_build_object('ok', false, 'reasons', array['send_job_exists']);
    end if;
  end if;

  return jsonb_build_object('ok', array_length(reasons,1) is null, 'reasons', to_jsonb(reasons),
                            'warnings', to_jsonb(warnings), 'send_job_id', job_id,
                            'sent_today', sent_today, 'daily_cap', s.daily_send_cap);
end $$;
revoke execute on function public.preflight_send(uuid, boolean) from anon;

-- Record the result of an execution (gateway only, service role).
create or replace function public.complete_send(p_send_job_id uuid, p_delivery_status text, p_provider_message_id text,
                                                p_provider_thread_id text, p_provider_response jsonb, p_actor text default 'gateway')
returns uuid language plpgsql security definer set search_path = public as $$
declare j record; a record; d record; v record; conv uuid; om uuid; mkt text;
begin
  select * into j from public.send_jobs where id = p_send_job_id for update;
  select * into a from public.approval_requests where id = j.approval_id for update;
  select * into d from public.outreach_drafts where id = a.draft_id;
  select * into v from public.draft_versions where id = a.draft_version_id;
  select primary_market into mkt from public.organisations where id = d.organisation_id;

  conv := d.conversation_id;
  if conv is null and p_provider_thread_id is not null then
    select id into conv from public.conversations where workspace_id = a.workspace_id and channel = a.channel and provider_thread_id = p_provider_thread_id;
  end if;
  if conv is null then
    insert into public.conversations(workspace_id, organisation_id, contact_id, channel, channel_account_id, provider_thread_id, subject, market, status, is_demo)
    values (a.workspace_id, d.organisation_id, d.contact_id, a.channel, a.sending_account_id, p_provider_thread_id, v.subject, mkt, 'sent', d.is_demo)
    returning id into conv;
  end if;

  insert into public.outbound_messages(workspace_id, approval_id, draft_version_id, conversation_id, contact_id, organisation_id, channel,
         recipient_value, subject, body, delivery_status, provider_message_id, provider_thread_id, market, is_demo)
  values (a.workspace_id, a.id, v.id, conv, d.contact_id, d.organisation_id, a.channel, a.recipient_value, v.subject, v.body,
          p_delivery_status, p_provider_message_id, p_provider_thread_id, mkt, d.is_demo)
  returning id into om;

  insert into public.conversation_messages(workspace_id, conversation_id, direction, source, provider_message_id, to_value, subject, body_text, snippet, occurred_at, outbound_message_id, is_demo)
  values (a.workspace_id, conv, 'outbound', case when a.channel = 'linkedin' then 'manual_log' else 'gateway' end, p_provider_message_id,
          a.recipient_value, v.subject, v.body, left(v.body, 160), now(), om, d.is_demo);

  update public.conversations set status = 'awaiting_response', last_outbound_at = now(),
         provider_thread_id = coalesce(provider_thread_id, p_provider_thread_id) where id = conv;
  update public.send_jobs set status = 'sent', provider_response = p_provider_response where id = j.id;
  update public.approval_requests set status = 'consumed' where id = a.id;
  update public.outreach_drafts set status = 'sent', conversation_id = conv where id = d.id;
  if d.contact_id is not null then
    update public.contacts set outreach_status = 'sent', last_interaction_at = now() where id = d.contact_id;
  end if;
  insert into public.approval_events(workspace_id, approval_id, event, actor_type, actor_id, content_fingerprint, detail)
  values (a.workspace_id, a.id, 'executed', 'gateway', p_actor, a.content_fingerprint,
          jsonb_build_object('delivery_status', p_delivery_status, 'provider_message_id', p_provider_message_id));
  insert into public.audit_logs(workspace_id, actor_type, actor_id, action, entity_type, entity_id, correlation_id, metadata)
  values (a.workspace_id, 'gateway', p_actor, 'message.'||p_delivery_status, 'outbound_message', om, j.correlation_id,
          jsonb_build_object('approval_id', a.id, 'recipient', a.recipient_value, 'provider_message_id', p_provider_message_id));
  return om;
end $$;
revoke execute on function public.complete_send(uuid, text, text, text, jsonb, text) from anon, authenticated;

create or replace function public.fail_send(p_send_job_id uuid, p_error text, p_retryable boolean, p_http_status int)
returns void language plpgsql security definer set search_path = public as $$
declare j record;
begin
  select * into j from public.send_jobs where id = p_send_job_id for update;
  insert into public.send_attempts(workspace_id, send_job_id, attempt_no, outcome, http_status, error)
  values (j.workspace_id, j.id, j.attempts, case when p_retryable then 'retryable_error' else 'permanent_error' end, p_http_status, p_error);
  update public.send_jobs set status = case when p_retryable and j.attempts < 3 then 'failed' else 'dead' end, last_error = p_error where id = j.id;
  insert into public.audit_logs(workspace_id, actor_type, actor_id, action, entity_type, entity_id, correlation_id, metadata)
  values (j.workspace_id, 'gateway', 'gateway', 'message.send_failed', 'send_job', j.id, j.correlation_id, jsonb_build_object('error', p_error, 'http', p_http_status));
end $$;
revoke execute on function public.fail_send(uuid, text, boolean, int) from anon, authenticated;

-- LinkedIn: the human confirms they sent it manually. Never an automated send.
create or replace function public.confirm_manual_send(p_approval_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare pre jsonb; om uuid;
begin
  if auth.uid() is null then raise exception 'manual confirmation requires a human' using errcode = '42501'; end if;
  pre := public.preflight_send(p_approval_id, true);
  if not (pre->>'ok')::boolean then raise exception 'preflight failed: %', pre->'reasons'; end if;
  om := public.complete_send((pre->>'send_job_id')::uuid, 'manual_confirmed', null, null, jsonb_build_object('confirmed_by', auth.uid()), auth.uid()::text);
  insert into public.manual_channel_events(workspace_id, channel, event, approval_id, conversation_id, contact_id, body, confirmed_by)
  select o.workspace_id, 'linkedin', 'message_sent', p_approval_id, o.conversation_id, o.contact_id, o.body, auth.uid()
    from public.outbound_messages o where o.id = om;
  return om;
end $$;

-- ---------------------------------------------------------------- tasks
create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  title           text not null,
  kind            text not null default 'follow_up' check (kind in ('follow_up','research','review','meeting_prep','data_quality','other')),
  status          text not null default 'open' check (status in ('open','done','dismissed','snoozed')),
  due_at          timestamptz,
  organisation_id uuid references public.organisations(id) on delete cascade,
  contact_id      uuid references public.contacts(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  draft_id        uuid references public.outreach_drafts(id) on delete set null,
  source          text not null default 'user' check (source in ('user','system','agent','insight')),
  notes           text,
  assigned_to     uuid references auth.users(id),
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);
create index on public.tasks(workspace_id, status, due_at);

select public._apply_ws_rls('channel_accounts', array['owner']);
select public._apply_ws_rls('conversations');
select public._apply_ws_rls('conversation_events');
select public._apply_ws_rls('outreach_strategies');
select public._apply_ws_rls('outreach_drafts');
select public._apply_ws_rls('draft_versions');
select public._apply_ws_rls('approval_events');
select public._apply_ws_rls('conversation_messages');
select public._apply_ws_rls('conversation_classifications');
select public._apply_ws_rls('manual_channel_events');
select public._apply_ws_rls('tasks');

-- approvals: readable by members; status changes only via decide_approval/request_approval (no direct update policy)
alter table public.approval_requests enable row level security;
create policy approval_requests_sel on public.approval_requests for select using (public.is_workspace_member(workspace_id));
create policy approval_requests_ins on public.approval_requests for insert with check (public.has_workspace_role(workspace_id, array['owner','analyst','reviewer']) and status = 'pending');
-- execution tables: read-only to members, written by gateway (service role / definer functions)
alter table public.send_jobs enable row level security;
create policy send_jobs_sel on public.send_jobs for select using (public.is_workspace_member(workspace_id));
alter table public.send_attempts enable row level security;
create policy send_attempts_sel on public.send_attempts for select using (public.is_workspace_member(workspace_id));
alter table public.outbound_messages enable row level security;
create policy outbound_sel on public.outbound_messages for select using (public.is_workspace_member(workspace_id));
