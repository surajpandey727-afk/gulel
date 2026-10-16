-- Additive schema changes to support 24-column source import mapping.
-- No destructive changes. All columns are nullable with defaults.

-- 1. Cohort classification on organisations
ALTER TABLE public.organisations ADD COLUMN IF NOT EXISTS cohort text;

-- 2. SIC codes (UK Standard Industrial Classification, stored as text to preserve formatting)
ALTER TABLE public.organisations ADD COLUMN IF NOT EXISTS primary_sic text;
ALTER TABLE public.organisations ADD COLUMN IF NOT EXISTS secondary_sic text;

-- 3. Structured address fields (complement existing headquarters text field)
ALTER TABLE public.organisations ADD COLUMN IF NOT EXISTS address_line text;
ALTER TABLE public.organisations ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.organisations ADD COLUMN IF NOT EXISTS postcode text;
ALTER TABLE public.organisations ADD COLUMN IF NOT EXISTS country text;

-- 4. Organisation-level LinkedIn URL (stored via contact_channels with channel='linkedin',
--    organisation_id set, contact_id null — already supported by existing CHECK constraint.
--    No schema change needed.)

-- 5. Index for cohort-based filtering
CREATE INDEX IF NOT EXISTS idx_org_cohort ON public.organisations(workspace_id, cohort) WHERE cohort IS NOT NULL AND deleted_at IS NULL;

-- 6. Index for SIC-based lookups
CREATE INDEX IF NOT EXISTS idx_org_primary_sic ON public.organisations(workspace_id, primary_sic) WHERE primary_sic IS NOT NULL AND deleted_at IS NULL;

-- 7. LLM response cache table (saves tokens on repeated identical queries)
CREATE TABLE IF NOT EXISTS public.llm_cache (
  hash        text PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent       text NOT NULL,
  response    jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_llm_cache_expiry ON public.llm_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_llm_cache_ws ON public.llm_cache(workspace_id);

SELECT public._apply_ws_rls('llm_cache');
