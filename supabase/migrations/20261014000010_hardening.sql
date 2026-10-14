-- Security hardening (findings from internal review, 2026-10-14)
-- 1. Privileged RPCs were executable by anon/authenticated through the PUBLIC grant.
-- 2. Approval rows could be inserted directly with arbitrary recipient/subject/account.
-- 3. Cross-workspace references were possible via child foreign keys.
-- 4. Opt-out / DNC checks read live draft fields that could be changed after approval.
-- 5. CR/LF in recipient/subject could inject email headers.

-- ---------------------------------------------------------------- no anonymous RPC, ever
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- ---------------------------------------------------------------- same-workspace references
-- Usage: trigger arguments are pairs (parent_table, fk_column).
create or replace function public.enforce_same_workspace() returns trigger
language plpgsql security definer set search_path = public as $$
declare i int := 0; parent_ws uuid; fk text;
begin
  while i < tg_nargs loop
    fk := to_jsonb(new) ->> tg_argv[i + 1];
    if fk is not null then
      execute format('select workspace_id from public.%I where id = $1', tg_argv[i]) into parent_ws using fk::uuid;
      if parent_ws is distinct from new.workspace_id then
        raise exception '%.% references a record outside this workspace', tg_table_name, tg_argv[i + 1] using errcode = '42501';
      end if;
    end if;
    i := i + 2;
  end loop;
  return new;
end $$;
revoke execute on function public.enforce_same_workspace() from authenticated;

create trigger trg_ws_dv before insert or update on public.draft_versions for each row execute function public.enforce_same_workspace('outreach_drafts','draft_id','channel_accounts','sending_account_id','contact_channels','recipient_channel_id');
create trigger trg_ws_od before insert or update on public.outreach_drafts for each row execute function public.enforce_same_workspace('organisations','organisation_id','contacts','contact_id','conversations','conversation_id','outreach_strategies','strategy_id');
create trigger trg_ws_conv before insert or update on public.conversations for each row execute function public.enforce_same_workspace('organisations','organisation_id','contacts','contact_id','channel_accounts','channel_account_id');
create trigger trg_ws_cm before insert or update on public.conversation_messages for each row execute function public.enforce_same_workspace('conversations','conversation_id');
create trigger trg_ws_ev before insert or update on public.evidence_items for each row execute function public.enforce_same_workspace('organisations','organisation_id','contacts','contact_id');
create trigger trg_ws_co before insert or update on public.contact_organisations for each row execute function public.enforce_same_workspace('contacts','contact_id','organisations','organisation_id');
create trigger trg_ws_cc before insert or update on public.contact_channels for each row execute function public.enforce_same_workspace('contacts','contact_id','organisations','organisation_id');
create trigger trg_ws_opp before insert or update on public.opportunities for each row execute function public.enforce_same_workspace('organisations','organisation_id','contacts','contact_id','conversations','conversation_id');
create trigger trg_ws_tasks before insert or update on public.tasks for each row execute function public.enforce_same_workspace('organisations','organisation_id','contacts','contact_id','conversations','conversation_id','outreach_drafts','draft_id');
create trigger trg_ws_notes before insert or update on public.notes for each row execute function public.enforce_same_workspace('conversations','conversation_id','contacts','contact_id','organisations','organisation_id');
create trigger trg_ws_lq before insert or update on public.lead_qualifications for each row execute function public.enforce_same_workspace('organisations','organisation_id','scoring_models','scoring_model_id');
create trigger trg_ws_strat before insert or update on public.outreach_strategies for each row execute function public.enforce_same_workspace('organisations','organisation_id','contacts','recommended_contact_id');
create trigger trg_ws_fin before insert or update on public.organisation_financials for each row execute function public.enforce_same_workspace('organisations','organisation_id');
create trigger trg_ws_risk before insert or update on public.organisation_risk_flags for each row execute function public.enforce_same_workspace('organisations','organisation_id');
create trigger trg_ws_alias before insert or update on public.organisation_aliases for each row execute function public.enforce_same_workspace('organisations','organisation_id');
create trigger trg_ws_omp before insert or update on public.organisation_market_profiles for each row execute function public.enforce_same_workspace('organisations','organisation_id');
create trigger trg_ws_meet before insert or update on public.meetings for each row execute function public.enforce_same_workspace('organisations','organisation_id','contacts','contact_id','conversations','conversation_id','opportunities','opportunity_id');
create trigger trg_ws_sig before insert or update on public.discovery_signals for each row execute function public.enforce_same_workspace('organisations','organisation_id','discovery_campaigns','campaign_id');
create trigger trg_ws_agent before insert or update on public.agent_configurations for each row execute function public.enforce_same_workspace('provider_connections','connection_id');

-- ---------------------------------------------------------------- header-injection safety
alter table public.draft_versions add constraint dv_no_crlf
  check (position(chr(10) in recipient_value) = 0 and position(chr(13) in recipient_value) = 0
         and position(chr(10) in coalesce(subject,'')) = 0 and position(chr(13) in coalesce(subject,'')) = 0);
alter table public.approval_requests add constraint ar_no_crlf
  check (position(chr(10) in recipient_value) = 0 and position(chr(13) in recipient_value) = 0
         and position(chr(10) in coalesce(subject,'')) = 0 and position(chr(13) in coalesce(subject,'')) = 0);

-- ---------------------------------------------------------------- approvals: snapshot + single creation path
alter table public.approval_requests add column if not exists contact_id uuid references public.contacts(id) on delete set null;
alter table public.approval_requests add column if not exists organisation_id uuid references public.organisations(id) on delete set null;
drop policy if exists approval_requests_ins on public.approval_requests;

create or replace function public.request_approval(p_draft_id uuid, p_proposed_send_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare d record; v record; aid uuid;
begin
  select * into d from public.outreach_drafts where id = p_draft_id for update;
  if d is null then raise exception 'draft not found'; end if;
  if not public.has_workspace_role(d.workspace_id, array['owner','analyst','reviewer']) then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  select * into v from public.draft_versions where id = d.current_version_id;
  if v is null then raise exception 'draft has no version'; end if;
  select id into aid from public.approval_requests
   where draft_id = d.id and draft_version_id = v.id and status in ('pending','snoozed','approved');
  if aid is not null then return aid; end if;
  insert into public.approval_requests(workspace_id, draft_id, draft_version_id, content_fingerprint, channel, recipient_value,
         subject, sending_account_id, approved_action, proposed_send_at, contact_id, organisation_id)
  values (d.workspace_id, d.id, v.id, v.fingerprint, v.channel, v.recipient_value, v.subject, v.sending_account_id,
          case when v.channel = 'linkedin' then 'manual_handoff' else 'send' end, p_proposed_send_at, d.contact_id, d.organisation_id)
  returning id into aid;
  update public.outreach_drafts set status = 'awaiting_approval' where id = d.id;
  insert into public.approval_events(workspace_id, approval_id, event, actor_type, actor_id, content_fingerprint)
  values (d.workspace_id, aid, 'requested', 'user', auth.uid()::text, v.fingerprint);
  return aid;
end $$;

-- Changing who/where a draft targets revokes any open approval.
create or replace function public.on_draft_target_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.contact_id is distinct from old.contact_id or new.organisation_id is distinct from old.organisation_id
     or new.channel is distinct from old.channel or new.conversation_id is distinct from old.conversation_id then
    for r in select id from public.approval_requests where draft_id = new.id and status in ('pending','approved','snoozed') loop
      update public.approval_requests set status = 'invalidated', decision_reason = 'draft_target_changed' where id = r.id;
      insert into public.approval_events(workspace_id, approval_id, event, actor_type, detail)
      values (new.workspace_id, r.id, 'invalidated', 'system', jsonb_build_object('reason','draft_target_changed'));
    end loop;
  end if;
  return new;
end $$;
create trigger trg_od_target after update of contact_id, organisation_id, channel, conversation_id on public.outreach_drafts
  for each row execute function public.on_draft_target_change();

-- ---------------------------------------------------------------- preflight: private core + guarded wrappers
drop function if exists public.preflight_send(uuid, boolean);

create or replace function public._preflight_core(p_approval_id uuid, p_claim boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a record; d record; v record; s record; acc record; ch record;
  reasons text[] := '{}'; warnings text[] := '{}';
  domain text; sent_today int; job_id uuid; recent_org timestamptz;
  cids uuid[]; oid uuid;
begin
  select * into a from public.approval_requests where id = p_approval_id for update;
  if a is null then return jsonb_build_object('ok', false, 'reasons', array['approval_not_found']); end if;
  if p_claim then perform pg_advisory_xact_lock(hashtext('send:' || a.workspace_id::text)); end if; -- serialise caps
  select * into s from public.workspace_settings where workspace_id = a.workspace_id;
  select * into d from public.outreach_drafts where id = a.draft_id;
  select * into v from public.draft_versions where id = d.current_version_id;

  if a.status <> 'approved' then reasons := reasons || ('approval_'||a.status); end if;
  if a.expires_at is not null and a.expires_at < now() then reasons := reasons || 'approval_expired'::text; end if;
  if v.id is distinct from a.draft_version_id then reasons := reasons || 'draft_changed_since_approval'::text; end if;
  if v.fingerprint is distinct from a.content_fingerprint then reasons := reasons || 'fingerprint_mismatch'::text; end if;
  -- the approval row must describe exactly the approved version
  if v.channel is distinct from a.channel or lower(v.recipient_value) is distinct from lower(a.recipient_value)
     or coalesce(v.subject,'') is distinct from coalesce(a.subject,'') or v.sending_account_id is distinct from a.sending_account_id then
    reasons := reasons || 'approval_fields_mismatch'::text;
  end if;
  if exists (select 1 from public.outbound_messages where approval_id = a.id) then reasons := reasons || 'already_sent'::text; end if;
  if a.channel = 'linkedin' and a.approved_action <> 'manual_handoff' then reasons := reasons || 'channel_cannot_send_via_api'::text; end if;

  -- recipient must be a recorded channel in this workspace
  select * into ch from public.contact_channels where workspace_id = a.workspace_id and value = lower(a.recipient_value) limit 1;
  if ch.id is null then reasons := reasons || 'recipient_not_recorded'::text; end if;

  -- every contact / organisation this message could concern: approval snapshot, live draft, recipient owner
  cids := array_remove(array[a.contact_id, d.contact_id, ch.contact_id], null);
  oid := coalesce(a.organisation_id, d.organisation_id);
  domain := lower(split_part(a.recipient_value, '@', 2));
  if exists (select 1 from public.suppression_entries se where se.workspace_id = a.workspace_id and (
       (se.kind in ('email','linkedin') and se.value = lower(a.recipient_value)) or
       (se.kind = 'domain' and domain <> '' and se.value = domain) or
       (se.kind = 'contact' and se.value = any (select x::text from unnest(cids) x)) or
       (se.kind = 'organisation' and se.value in (coalesce(a.organisation_id::text,'-'), coalesce(d.organisation_id::text,'-'), coalesce(ch.organisation_id::text,'-'))))) then
    reasons := reasons || 'suppressed'::text;
  end if;
  if exists (select 1 from public.contacts c where c.id = any (cids) and c.opted_out_at is not null) then reasons := reasons || 'contact_opted_out'::text; end if;
  if exists (select 1 from public.contacts c where c.id = any (cids) and c.deleted_at is not null) then reasons := reasons || 'contact_deleted'::text; end if;
  if s.require_compliance_check and a.channel = 'gmail' and exists (select 1 from public.contacts c where c.id = any (cids) and c.subscriber_type = 'individual' and c.lawful_basis <> 'consent') then
    reasons := reasons || 'compliance_individual_subscriber_without_consent'::text;
  end if;
  if exists (select 1 from public.contacts c where c.id = any (cids) and c.lawful_basis = 'none') then reasons := reasons || 'no_lawful_basis'::text; end if;
  if exists (select 1 from public.contacts c where c.id = any (cids) and c.subscriber_type = 'unknown') then warnings := warnings || 'subscriber_type_unknown'::text; end if;
  if exists (select 1 from public.organisations o where o.id in (a.organisation_id, d.organisation_id) and o.relationship_status = 'do_not_contact') then
    reasons := reasons || 'organisation_do_not_contact'::text;
  end if;
  if ch.id is not null then
    if ch.verification_status = 'invalid' or ch.bounced_at is not null then reasons := reasons || 'recipient_invalid_or_bounced'::text; end if;
    if ch.verification_status <> 'verified' then warnings := warnings || 'recipient_unverified'::text; end if;
    if ch.email_quality = 'role_generic' then warnings := warnings || 'generic_role_inbox'::text; end if;
  end if;

  if d.conversation_id is not null and exists (select 1 from public.conversation_messages m
       where m.conversation_id = d.conversation_id and m.direction = 'inbound' and m.occurred_at > coalesce(a.approved_at, a.created_at)) then
    reasons := reasons || 'new_inbound_reply_since_approval'::text;
  end if;

  if a.channel = 'gmail' then
    select * into acc from public.channel_accounts where id = a.sending_account_id;
    if acc.id is null then reasons := reasons || 'no_sending_account'::text;
    elsif acc.workspace_id <> a.workspace_id then reasons := reasons || 'sending_account_not_in_workspace'::text;
    elsif acc.status <> 'connected' then reasons := reasons || ('sending_account_'||acc.status); end if;
  end if;

  select count(*) into sent_today from public.outbound_messages
   where workspace_id = a.workspace_id and delivery_status = 'sent_confirmed' and sent_at >= date_trunc('day', now());
  if a.channel = 'gmail' and sent_today >= s.daily_send_cap then reasons := reasons || 'daily_send_cap_reached'::text; end if;
  select max(sent_at) into recent_org from public.outbound_messages
   where organisation_id = oid and approval_id <> a.id;
  if recent_org is not null and recent_org > now() - make_interval(hours => s.min_hours_between_org_sends) then
    reasons := reasons || 'organisation_contacted_recently'::text;
  end if;

  if array_length(reasons,1) is null and p_claim then
    insert into public.send_jobs(workspace_id, approval_id, status, attempts)
    values (a.workspace_id, a.id, 'sending', 1)
    on conflict (approval_id) do nothing
    returning id into job_id;
    if job_id is null then
      -- only a definite provider rejection (rate limit) leaves a job re-claimable
      update public.send_jobs set status = 'sending', attempts = attempts + 1
       where approval_id = a.id and status = 'failed' and attempts < 3
      returning id into job_id;
    end if;
    if job_id is null then return jsonb_build_object('ok', false, 'reasons', array['send_job_exists']); end if;
  end if;

  return jsonb_build_object('ok', array_length(reasons,1) is null, 'reasons', to_jsonb(reasons),
                            'warnings', to_jsonb(warnings), 'send_job_id', job_id,
                            'sent_today', sent_today, 'daily_cap', s.daily_send_cap);
end $$;
revoke execute on function public._preflight_core(uuid, boolean) from public, anon, authenticated, service_role;

-- UI dry-run (members) and gateway claim (service role only).
create or replace function public.preflight_send(p_approval_id uuid, p_claim boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  select workspace_id into ws from public.approval_requests where id = p_approval_id;
  if auth.role() is distinct from 'service_role' then
    if p_claim then raise exception 'only the execution gateway can claim a send' using errcode = '42501'; end if;
    if ws is null or not public.is_workspace_member(ws) then raise exception 'not a workspace member' using errcode = '42501'; end if;
  end if;
  return public._preflight_core(p_approval_id, p_claim);
end $$;
revoke execute on function public.preflight_send(uuid, boolean) from public, anon;
grant execute on function public.preflight_send(uuid, boolean) to authenticated, service_role;

create or replace function public.confirm_manual_send(p_approval_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare pre jsonb; om uuid; a record;
begin
  if auth.uid() is null then raise exception 'manual confirmation requires a human' using errcode = '42501'; end if;
  select * into a from public.approval_requests where id = p_approval_id;
  if a is null or not public.has_workspace_role(a.workspace_id, array['owner','reviewer']) then raise exception 'not authorised' using errcode = '42501'; end if;
  if a.channel <> 'linkedin' then raise exception 'manual confirmation is only for manual-handoff channels'; end if;
  pre := public._preflight_core(p_approval_id, true);
  if not (pre->>'ok')::boolean then raise exception 'preflight failed: %', pre->'reasons'; end if;
  om := public.complete_send((pre->>'send_job_id')::uuid, 'manual_confirmed', null, null, jsonb_build_object('confirmed_by', auth.uid()), auth.uid()::text);
  insert into public.manual_channel_events(workspace_id, channel, event, approval_id, conversation_id, contact_id, body, confirmed_by)
  select o.workspace_id, 'linkedin', 'message_sent', p_approval_id, o.conversation_id, o.contact_id, o.body, auth.uid()
    from public.outbound_messages o where o.id = om;
  return om;
end $$;
revoke execute on function public.confirm_manual_send(uuid) from public, anon;

-- ---------------------------------------------------------------- gateway / worker functions: service role only
revoke execute on function public.complete_send(uuid, text, text, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.fail_send(uuid, text, boolean, int) from public, anon, authenticated;
revoke execute on function public.claim_jobs(text, int) from public, anon, authenticated;
revoke execute on function public.finish_job(uuid, boolean, jsonb, text, numeric) from public, anon, authenticated;
grant execute on function public.complete_send(uuid, text, text, text, jsonb, text) to service_role;
grant execute on function public.fail_send(uuid, text, boolean, int) to service_role;
grant execute on function public.claim_jobs(text, int) to service_role;
grant execute on function public.finish_job(uuid, boolean, jsonb, text, numeric) to service_role;
-- internal trigger functions need no direct callers
revoke execute on function public.on_draft_version_insert() from authenticated;
revoke execute on function public.on_draft_target_change() from authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.handle_new_workspace() from authenticated;
