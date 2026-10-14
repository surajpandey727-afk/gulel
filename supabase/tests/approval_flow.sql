-- Integration test for approval integrity, idempotent execution and tenant isolation.
-- Runs inside a transaction that is rolled back. Switches real roles so RLS and grants apply.
-- psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/approval_flow.sql
begin;
do $$
declare
  uid uuid := gen_random_uuid(); uid2 uuid := gen_random_uuid(); ws uuid; ws2 uuid; org uuid; org2 uuid; ct uuid; chn uuid; acc uuid;
  dr uuid; dr2 uuid; v1 uuid; ap uuid; ap2 uuid; pre jsonb; res text; om uuid; n int;
begin
  -- fixtures (as superuser)
  insert into auth.users(id, email, instance_id, aud, role) values
    (uid, 'test-'||uid||'@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (uid2, 'test-'||uid2||'@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  select workspace_id into ws from public.workspace_members where user_id = uid;
  select workspace_id into ws2 from public.workspace_members where user_id = uid2;
  assert ws is not null and ws2 is not null and ws <> ws2, 'separate workspaces bootstrapped';
  assert (select count(*) from public.scoring_models where workspace_id = ws and is_active) = 1, 'default scoring model';
  assert (select active_version_id from public.voice_profiles where workspace_id = ws) is not null, 'default voice';

  insert into public.organisations(workspace_id, trading_name, normalised_name, primary_market) values (ws, 'Acme Foods', 'acme foods', 'UK') returning id into org;
  insert into public.organisations(workspace_id, trading_name, normalised_name, primary_market) values (ws2, 'Other Co', 'other co', 'UK') returning id into org2;
  insert into public.contacts(workspace_id, full_name, normalised_name, subscriber_type) values (ws, 'Priya Shah', 'priya shah', 'corporate') returning id into ct;
  insert into public.contact_channels(workspace_id, contact_id, channel, value, email_quality, verification_status) values (ws, ct, 'email', 'priya.shah@acme.test', 'personal_named', 'verified') returning id into chn;
  insert into public.channel_accounts(workspace_id, channel, account_email, status) values (ws, 'gmail', 'founder@nishaan.test', 'connected') returning id into acc;
  insert into public.outreach_drafts(workspace_id, organisation_id, contact_id, channel) values (ws, org, ct, 'gmail') returning id into dr;
  insert into public.outreach_drafts(workspace_id, organisation_id, channel) values (ws2, org2, 'gmail') returning id into dr2;
  insert into public.draft_versions(workspace_id, draft_id, version_no, channel, sending_account_id, recipient_channel_id, recipient_value, subject, body, source)
    values (ws, dr, 1, 'gmail', acc, chn, 'priya.shah@acme.test', 'Portfolio question', 'Hello Priya, body v1', 'governance') returning id into v1;
  assert (select current_version_id from public.outreach_drafts where id = dr) = v1, 'version becomes current';

  -- ===== act as the founder (authenticated role, RLS on)
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  ap := public.request_approval(dr);
  pre := public.preflight_send(ap, false);
  assert not (pre->>'ok')::boolean and pre->'reasons' ? 'approval_pending', 'cannot send before approval';
  res := public.decide_approval(ap, 'approve', 'looks right');
  assert res = 'approve';

  -- editing an approved message revokes approval
  insert into public.draft_versions(workspace_id, draft_id, version_no, channel, sending_account_id, recipient_channel_id, recipient_value, subject, body, source)
    values (ws, dr, 2, 'gmail', acc, chn, 'priya.shah@acme.test', 'Portfolio question', 'Hello Priya, body v2', 'user_edit');
  assert (select status from public.approval_requests where id = ap) = 'invalidated', 'edit invalidates approval';

  -- retargeting a draft revokes approval
  ap2 := public.request_approval(dr);
  perform public.decide_approval(ap2, 'approve', null);
  update public.outreach_drafts set contact_id = null where id = dr;
  assert (select status from public.approval_requests where id = ap2) = 'invalidated', 'retarget invalidates approval';
  update public.outreach_drafts set contact_id = ct where id = dr;
  ap2 := public.request_approval(dr);
  perform public.decide_approval(ap2, 'approve', null);

  -- users cannot claim, complete or fail sends, nor run jobs
  begin pre := public.preflight_send(ap2, true); raise exception 'user claim allowed'; exception when insufficient_privilege then null; end;
  begin perform public.complete_send(gen_random_uuid(), 'sent_confirmed', 'x', 'y', '{}'::jsonb); raise exception 'complete_send callable'; exception when insufficient_privilege then null; end;
  begin perform public.fail_send(gen_random_uuid(), 'x', true, 500); raise exception 'fail_send callable'; exception when insufficient_privilege then null; end;
  begin perform public.claim_jobs('x', 5); raise exception 'claim_jobs callable'; exception when insufficient_privilege then null; end;

  -- approval rows cannot be inserted directly (forged recipient)
  begin
    insert into public.approval_requests(workspace_id, draft_id, draft_version_id, content_fingerprint, channel, recipient_value)
    values (ws, dr, (select current_version_id from public.outreach_drafts where id = dr), 'x', 'gmail', 'attacker@evil.test');
    raise exception 'direct approval insert allowed';
  exception when insufficient_privilege then null;
  end;

  -- header injection rejected
  begin
    insert into public.draft_versions(workspace_id, draft_id, version_no, channel, recipient_value, body, source)
    values (ws, dr, 99, 'gmail', 'a@acme.test' || chr(13) || chr(10) || 'Bcc: x@y.test', 'b', 'manual');
    raise exception 'crlf allowed';
  exception when check_violation then null;
  end;

  -- cross-workspace hijack rejected (own workspace_id, foreign draft_id)
  begin
    insert into public.draft_versions(workspace_id, draft_id, version_no, channel, recipient_value, body, source)
    values (ws, dr2, 5, 'gmail', 'priya.shah@acme.test', 'hijack', 'manual');
    raise exception 'cross-workspace version allowed';
  exception when insufficient_privilege then null;
  end;
  assert (select current_version_id from public.outreach_drafts where id = dr2) is null, 'foreign draft untouched';

  -- ===== act as the gateway (service role)
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('role', 'service_role', true);
  pre := public.preflight_send(ap2, true);
  assert (pre->>'ok')::boolean, 'preflight ok: '||pre::text;
  om := public.complete_send((pre->>'send_job_id')::uuid, 'sent_confirmed', 'gmail-msg-1', 'gmail-thread-1', '{}'::jsonb);
  pre := public.preflight_send(ap2, true);
  assert not (pre->>'ok')::boolean, 'second send blocked';
  select count(*) into n from public.outbound_messages where approval_id = ap2;
  assert n = 1, 'exactly one outbound message';
  assert (select status from public.conversations where id = (select conversation_id from public.outbound_messages where id = om)) = 'awaiting_response';

  -- ===== back to the founder: suppression, pacing, opt-out via recipient owner
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.suppression_entries(workspace_id, kind, value, reason) values (ws, 'domain', 'acme.test', 'opt_out');
  insert into public.outreach_drafts(workspace_id, organisation_id, channel) values (ws, org, 'gmail') returning id into dr;  -- no contact on the draft
  insert into public.draft_versions(workspace_id, draft_id, version_no, channel, sending_account_id, recipient_value, body, source)
    values (ws, dr, 1, 'gmail', acc, 'priya.shah@acme.test', 'follow-up', 'manual');
  ap := public.request_approval(dr);
  perform public.decide_approval(ap, 'approve', null);
  update public.contacts set opted_out_at = now() where id = ct;
  pre := public.preflight_send(ap, false);
  assert pre->'reasons' ? 'suppressed', 'suppression enforced';
  assert pre->'reasons' ? 'organisation_contacted_recently', 'org pacing enforced';
  assert pre->'reasons' ? 'contact_opted_out', 'opt-out found via recipient channel even without contact on draft';

  -- other tenant's data is invisible
  assert (select count(*) from public.organisations where workspace_id = ws2) = 0, 'RLS hides other workspace';

  -- draft versions are immutable
  begin
    update public.draft_versions set body = 'tamper' where id = v1;
    raise exception 'tamper allowed';
  exception when sqlstate 'P0001' then null;
  end;

  pre := public.kpi_summary(ws, now() - interval '1 day', now() + interval '1 day', null, false);
  assert (pre->>'unique_people_reached')::int = 1 and (pre->>'messages_sent_confirmed')::int = 1, 'kpis: '||pre::text;

  -- ===== anonymous callers can execute nothing
  perform set_config('role', 'postgres', true);
  assert not has_function_privilege('anon', 'public.preflight_send(uuid,boolean)', 'execute'), 'anon preflight';
  assert not has_function_privilege('anon', 'public.complete_send(uuid,text,text,text,jsonb,text)', 'execute'), 'anon complete';
  assert not has_function_privilege('anon', 'public.claim_jobs(text,integer)', 'execute'), 'anon jobs';
  assert not has_function_privilege('anon', 'public.decide_approval(uuid,text,text,timestamptz)', 'execute'), 'anon decide';
  raise notice 'ALL APPROVAL FLOW ASSERTIONS PASSED';
end $$;
rollback;
