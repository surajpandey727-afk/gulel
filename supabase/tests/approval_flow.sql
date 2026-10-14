-- Integration test for approval integrity & idempotent execution (run inside a transaction, rolled back).
-- psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/approval_flow.sql
begin;
do $$
declare
  uid uuid := gen_random_uuid(); ws uuid; org uuid; ct uuid; chn uuid; acc uuid; dr uuid; v1 uuid; ap uuid; ap2 uuid;
  pre jsonb; res text; om uuid; n int;
begin
  insert into auth.users(id, email, instance_id, aud, role) values (uid, 'test-'||uid||'@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  select workspace_id into ws from public.workspace_members where user_id = uid;
  assert ws is not null, 'workspace bootstrapped';
  assert (select count(*) from public.scoring_models where workspace_id = ws and is_active) = 1, 'default scoring model';
  assert (select active_version_id from public.voice_profiles where workspace_id = ws) is not null, 'default voice';

  insert into public.organisations(workspace_id, trading_name, normalised_name, primary_market) values (ws, 'Acme Foods', 'acme foods', 'UK') returning id into org;
  insert into public.contacts(workspace_id, full_name, normalised_name, subscriber_type) values (ws, 'Priya Shah', 'priya shah', 'corporate') returning id into ct;
  insert into public.contact_channels(workspace_id, contact_id, channel, value, email_quality, verification_status) values (ws, ct, 'email', 'priya.shah@acme.test', 'personal_named', 'verified') returning id into chn;
  insert into public.channel_accounts(workspace_id, channel, account_email, status) values (ws, 'gmail', 'founder@nishaan.test', 'connected') returning id into acc;
  insert into public.outreach_drafts(workspace_id, organisation_id, contact_id, channel) values (ws, org, ct, 'gmail') returning id into dr;
  insert into public.draft_versions(workspace_id, draft_id, version_no, channel, sending_account_id, recipient_channel_id, recipient_value, subject, body, source)
    values (ws, dr, 1, 'gmail', acc, chn, 'priya.shah@acme.test', 'Portfolio question', 'Hello Priya, body v1', 'governance') returning id into v1;
  assert (select current_version_id from public.outreach_drafts where id = dr) = v1, 'version becomes current';

  -- act as the founder
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  ap := public.request_approval(dr);
  pre := public.preflight_send(ap, false);
  assert not (pre->>'ok')::boolean and pre->'reasons' ? 'approval_pending', 'cannot send before approval';

  res := public.decide_approval(ap, 'approve', 'looks right');
  assert res = 'approve';

  -- Scenario 5: editing an approved message revokes approval
  insert into public.draft_versions(workspace_id, draft_id, version_no, channel, sending_account_id, recipient_channel_id, recipient_value, subject, body, source)
    values (ws, dr, 2, 'gmail', acc, chn, 'priya.shah@acme.test', 'Portfolio question', 'Hello Priya, body v2', 'user_edit');
  assert (select status from public.approval_requests where id = ap) = 'invalidated', 'edit invalidates approval';
  pre := public.preflight_send(ap, false);
  assert not (pre->>'ok')::boolean, 'invalidated approval cannot send';

  ap2 := public.request_approval(dr);
  perform public.decide_approval(ap2, 'approve', null);

  -- an authenticated user cannot claim a Gmail send job (gateway only)
  pre := public.preflight_send(ap2, true);
  assert pre->'reasons' ? 'claim_requires_gateway', 'user cannot claim send';

  -- act as gateway (service role, no auth.uid)
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  pre := public.preflight_send(ap2, true);
  assert (pre->>'ok')::boolean, 'preflight ok: '||pre::text;
  om := public.complete_send((pre->>'send_job_id')::uuid, 'sent_confirmed', 'gmail-msg-1', 'gmail-thread-1', '{}'::jsonb);
  -- Scenario 6/11: second claim is refused (idempotent)
  pre := public.preflight_send(ap2, true);
  assert not (pre->>'ok')::boolean, 'second send blocked';
  select count(*) into n from public.outbound_messages where approval_id = ap2;
  assert n = 1, 'exactly one outbound message';
  assert (select status from public.conversations where id = (select conversation_id from public.outbound_messages where id = om)) = 'awaiting_response';

  -- suppression blocks
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  insert into public.suppression_entries(workspace_id, kind, value, reason) values (ws, 'domain', 'acme.test', 'opt_out');
  insert into public.outreach_drafts(workspace_id, organisation_id, contact_id, channel) values (ws, org, ct, 'gmail') returning id into dr;
  insert into public.draft_versions(workspace_id, draft_id, version_no, channel, sending_account_id, recipient_value, body, source)
    values (ws, dr, 1, 'gmail', acc, 'priya.shah@acme.test', 'follow-up', 'manual');
  ap := public.request_approval(dr);
  perform public.decide_approval(ap, 'approve', null);
  pre := public.preflight_send(ap, false);
  assert pre->'reasons' ? 'suppressed', 'suppression enforced';
  assert pre->'reasons' ? 'organisation_contacted_recently', 'org pacing enforced';

  -- draft versions are immutable
  begin
    update public.draft_versions set body = 'tamper' where id = v1;
    raise exception 'tamper allowed';
  exception when sqlstate 'P0001' then null;
  end;

  -- KPI denominators
  pre := public.kpi_summary(ws, now() - interval '1 day', now() + interval '1 day', null, false);
  assert (pre->>'unique_people_reached')::int = 1 and (pre->>'messages_sent_confirmed')::int = 1, 'kpis: '||pre::text;
  raise notice 'ALL APPROVAL FLOW ASSERTIONS PASSED';
end $$;
rollback;
