-- Meeting / proposal preparation brief (AI-generated, evidence-cited) and stakeholder map
alter table public.opportunities add column if not exists prep_brief jsonb;
alter table public.opportunities add column if not exists proposal_status text check (proposal_status in ('not_started','drafting','sent','accepted','declined') or proposal_status is null);
