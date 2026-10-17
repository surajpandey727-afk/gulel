-- Consolidate all workspaces into the primary production workspace.
-- Handles unique constraints by removing duplicates from non-keeper workspaces
-- before moving data. Idempotent: re-running on a single workspace is a no-op.

do $$
declare
  keeper_id uuid;
begin
  -- Pick the workspace with the most organisations as the keeper
  select workspace_id into keeper_id
  from organisations
  group by workspace_id
  order by count(*) desc
  limit 1;

  -- Fallback: if no orgs exist, pick the oldest workspace
  if keeper_id is null then
    select id into keeper_id from workspaces order by created_at limit 1;
  end if;

  if keeper_id is null then
    raise notice 'No workspaces found, nothing to do';
    return;
  end if;

  -- Exit early if only one workspace exists
  if (select count(*) from workspaces) <= 1 then
    raise notice 'Only one workspace exists, nothing to consolidate';
    -- Still ensure active_workspace_id is set
    update user_preferences set active_workspace_id = keeper_id
    where active_workspace_id is distinct from keeper_id;
    return;
  end if;

  raise notice 'Consolidating into workspace: %', keeper_id;

  -------------------------------------------------------------------
  -- Tables WITH workspace-scoped unique constraints:
  -- Delete from non-keeper where the keeper already has a matching row,
  -- then move the rest.
  -------------------------------------------------------------------

  -- data_sources: unique (workspace_id, key)
  delete from data_sources d
  where d.workspace_id != keeper_id
    and exists (select 1 from data_sources k where k.workspace_id = keeper_id and k.key = d.key);
  update data_sources set workspace_id = keeper_id where workspace_id != keeper_id;

  -- suppression_entries: unique (workspace_id, kind, value)
  delete from suppression_entries s
  where s.workspace_id != keeper_id
    and exists (select 1 from suppression_entries k where k.workspace_id = keeper_id and k.kind = s.kind and k.value = s.value);
  update suppression_entries set workspace_id = keeper_id where workspace_id != keeper_id;

  -- contact_channels: unique (workspace_id, channel, value)
  delete from contact_channels c
  where c.workspace_id != keeper_id
    and exists (select 1 from contact_channels k where k.workspace_id = keeper_id and k.channel = c.channel and k.value = c.value);
  update contact_channels set workspace_id = keeper_id where workspace_id != keeper_id;

  -- agent_configurations: unique (workspace_id, agent)
  delete from agent_configurations a
  where a.workspace_id != keeper_id
    and exists (select 1 from agent_configurations k where k.workspace_id = keeper_id and k.agent = a.agent);
  update agent_configurations set workspace_id = keeper_id where workspace_id != keeper_id;

  -- provider_connections: unique (workspace_id, provider, label)
  delete from provider_connections p
  where p.workspace_id != keeper_id
    and exists (select 1 from provider_connections k where k.workspace_id = keeper_id and k.provider = p.provider and k.label = p.label);
  update provider_connections set workspace_id = keeper_id where workspace_id != keeper_id;

  -- scoring_models: unique (workspace_id, version_no) + partial unique (workspace_id) where is_active
  delete from scoring_models s
  where s.workspace_id != keeper_id
    and exists (select 1 from scoring_models k where k.workspace_id = keeper_id and k.version_no = s.version_no);
  -- Deactivate remaining non-keeper models to avoid partial unique conflict
  update scoring_models set is_active = false where workspace_id != keeper_id and is_active = true;
  update scoring_models set workspace_id = keeper_id where workspace_id != keeper_id;

  -- icps: unique (workspace_id, name, version_no)
  delete from icps i
  where i.workspace_id != keeper_id
    and exists (select 1 from icps k where k.workspace_id = keeper_id and k.name = i.name and k.version_no = i.version_no);
  update icps set workspace_id = keeper_id where workspace_id != keeper_id;

  -- channel_accounts: unique (workspace_id, channel, account_email)
  delete from channel_accounts c
  where c.workspace_id != keeper_id
    and exists (select 1 from channel_accounts k where k.workspace_id = keeper_id and k.channel = c.channel and k.account_email = c.account_email);
  update channel_accounts set workspace_id = keeper_id where workspace_id != keeper_id;

  -- discovery_campaigns: unique (workspace_id, name)
  delete from discovery_campaigns d
  where d.workspace_id != keeper_id
    and exists (select 1 from discovery_campaigns k where k.workspace_id = keeper_id and k.name = d.name);
  update discovery_campaigns set workspace_id = keeper_id where workspace_id != keeper_id;

  -- jobs: unique (workspace_id, type, idempotency_key)
  delete from jobs j
  where j.workspace_id != keeper_id
    and j.idempotency_key is not null
    and exists (select 1 from jobs k where k.workspace_id = keeper_id and k.type = j.type and k.idempotency_key = j.idempotency_key);
  update jobs set workspace_id = keeper_id where workspace_id != keeper_id;

  -- workspace_settings: one per workspace, keep only keeper's
  delete from workspace_settings where workspace_id != keeper_id;

  -------------------------------------------------------------------
  -- Tables WITHOUT workspace-scoped unique constraints:
  -- Safe to move directly.
  -------------------------------------------------------------------

  -- Core entities (orgs have conditional unique indexes on domain/regno,
  -- but cross-workspace duplicates are unlikely; let it error if so)
  update organisations set workspace_id = keeper_id where workspace_id != keeper_id;
  update organisation_aliases set workspace_id = keeper_id where workspace_id != keeper_id;
  update organisation_market_profiles set workspace_id = keeper_id where workspace_id != keeper_id;
  update contacts set workspace_id = keeper_id where workspace_id != keeper_id;
  update contact_organisations set workspace_id = keeper_id where workspace_id != keeper_id;
  update evidence_items set workspace_id = keeper_id where workspace_id != keeper_id;
  update organisation_financials set workspace_id = keeper_id where workspace_id != keeper_id;
  update organisation_brands set workspace_id = keeper_id where workspace_id != keeper_id;
  update organisation_risk_flags set workspace_id = keeper_id where workspace_id != keeper_id;
  update organisation_news set workspace_id = keeper_id where workspace_id != keeper_id;
  update source_records set workspace_id = keeper_id where workspace_id != keeper_id;

  -- Qualification
  update lead_qualifications set workspace_id = keeper_id where workspace_id != keeper_id;
  update qualification_dimensions set workspace_id = keeper_id where workspace_id != keeper_id;

  -- Outreach
  update conversations set workspace_id = keeper_id where workspace_id != keeper_id;
  update outreach_strategies set workspace_id = keeper_id where workspace_id != keeper_id;
  update outreach_drafts set workspace_id = keeper_id where workspace_id != keeper_id;
  update draft_versions set workspace_id = keeper_id where workspace_id != keeper_id;
  update approval_requests set workspace_id = keeper_id where workspace_id != keeper_id;
  update send_jobs set workspace_id = keeper_id where workspace_id != keeper_id;
  update outbound_messages set workspace_id = keeper_id where workspace_id != keeper_id;
  update conversation_messages set workspace_id = keeper_id where workspace_id != keeper_id;
  update tasks set workspace_id = keeper_id where workspace_id != keeper_id;

  -- AI & voice
  update agent_executions set workspace_id = keeper_id where workspace_id != keeper_id;
  update provider_secrets set workspace_id = keeper_id where workspace_id != keeper_id;
  update writing_samples set workspace_id = keeper_id where workspace_id != keeper_id;
  update voice_profiles set workspace_id = keeper_id where workspace_id != keeper_id;
  update voice_profile_versions set workspace_id = keeper_id where workspace_id != keeper_id;
  update voice_feedback set workspace_id = keeper_id where workspace_id != keeper_id;

  -- Discovery
  update discovery_runs set workspace_id = keeper_id where workspace_id != keeper_id;
  update discovery_signals set workspace_id = keeper_id where workspace_id != keeper_id;

  -- Ops & pipeline
  update opportunities set workspace_id = keeper_id where workspace_id != keeper_id;
  update opportunity_events set workspace_id = keeper_id where workspace_id != keeper_id;
  update meetings set workspace_id = keeper_id where workspace_id != keeper_id;
  update insights set workspace_id = keeper_id where workspace_id != keeper_id;
  update notes set workspace_id = keeper_id where workspace_id != keeper_id;
  update system_errors set workspace_id = keeper_id where workspace_id != keeper_id;
  update integration_events set workspace_id = keeper_id where workspace_id != keeper_id;

  -- Triggers
  update organisation_snapshots set workspace_id = keeper_id where workspace_id != keeper_id;
  update trigger_events set workspace_id = keeper_id where workspace_id != keeper_id;

  -- Import
  update import_batches set workspace_id = keeper_id where workspace_id != keeper_id;
  update import_rows set workspace_id = keeper_id where workspace_id != keeper_id;

  -- Audit logs
  update audit_logs set workspace_id = keeper_id where workspace_id != keeper_id;

  -------------------------------------------------------------------
  -- Consolidate memberships and clean up
  -------------------------------------------------------------------

  -- Ensure every user is a member of the keeper workspace
  insert into workspace_members (workspace_id, user_id, role)
  select keeper_id, wm.user_id, wm.role
  from workspace_members wm
  where wm.workspace_id != keeper_id
    and not exists (
      select 1 from workspace_members existing
      where existing.workspace_id = keeper_id and existing.user_id = wm.user_id
    )
  on conflict do nothing;

  -- Remove memberships in non-keeper workspaces
  delete from workspace_members where workspace_id != keeper_id;

  -- Point all users to the keeper workspace
  update user_preferences set active_workspace_id = keeper_id;

  -- Delete the empty workspace shells
  delete from workspaces where id != keeper_id;

  raise notice 'Consolidation complete. All data now in workspace %', keeper_id;
end $$;
