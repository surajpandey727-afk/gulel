# Supabase Schema Mapping — 24-Column Source Format

## Existing schema coverage

The database already has a well-normalised entity model in `20261014000003_entities.sql`. Most of the 24-column source maps directly to existing tables.

## Source-to-schema mapping

| # | Source Column | Target Table | Target Column(s) | Status |
|---|---|---|---|---|
| 1 | Company Name | `organisations` | `trading_name` | MAPPED |
| 2 | Cohort | `organisations` | — | GAP — no `cohort` column |
| 3 | Industry | `organisations` | `sector` | MAPPED |
| 4 | Sub-Industry | `organisations` | `sub_sector` | MAPPED |
| 5 | Domain of Work | `organisations` | `needs` (text array) | MAPPED (closest fit) |
| 6 | Primary SIC | `organisations` | — | GAP — no SIC columns |
| 7 | Secondary SIC | `organisations` | — | GAP — no SIC columns |
| 8 | Address | `organisations` | `headquarters` (text) | PARTIAL — unstructured |
| 9 | Town / City | `organisations` | — | GAP — no structured address |
| 10 | Postcode | `organisations` | — | GAP — no structured address |
| 11 | Country | `organisations` | `primary_market` | MAPPED (UK/IN enum) |
| 12 | Company No. | `organisations` | `registration_number` (text) | MAPPED |
| 13 | Incorporated | `organisations` | `incorporation_date` (date) | MAPPED |
| 14 | Status | `organisations` | `operating_status` | MAPPED (enum: active/dissolved/liquidation/dormant/unknown) |
| 15 | Email | `contact_channels` | `value` (channel='email', org-level) | MAPPED |
| 16 | Email 2 | `contact_channels` | `value` (channel='email', org-level) | MAPPED |
| 17 | Email 3 | `contact_channels` | `value` (channel='email', org-level) | MAPPED |
| 18 | Phone / Mobile | `contact_channels` | `value` (channel='phone', org-level) | MAPPED |
| 19 | Website | `organisations` | `website` | MAPPED |
| 20 | LinkedIn | `contact_channels` | `value` (channel='linkedin', org-level) | MAPPED (org-level via `organisation_id`) |
| 21 | Decision Maker | `contacts` + `contact_organisations` | `full_name` + link | MAPPED |
| 22 | DM Title | `contact_organisations` | `title` | MAPPED |
| 23 | Team Size | `organisations` | `employee_count` | MAPPED |
| 24 | Markets Served | `organisation_market_profiles` | one row per market | MAPPED |

### Key architectural notes

`contact_channels` supports org-level records without a contact:
```sql
CHECK (contact_id IS NOT NULL OR organisation_id IS NOT NULL)
```

This allows storing org-level emails (hello@, info@, sales@) directly on the organisation, and named-person emails on the contact. The `email_quality` column classifies them: `personal_named`, `personal_unknown`, `role_generic`, `free_mail`.

## Gaps requiring additive migration

### 1. Cohort classification

No `cohort` column exists. Add to `organisations`.

### 2. SIC codes

No SIC classification storage. Add `primary_sic` and `secondary_sic` text columns to `organisations`. These are UK Standard Industrial Classification codes (5-digit text, e.g., "62020").

### 3. Structured address

`headquarters` is a single text field. For proper import mapping, add structured address columns.

### 4. Organisation LinkedIn URL

Already supported via `contact_channels` with `channel='linkedin'` and `organisation_id` set. No schema change needed.

## Existing import infrastructure

The schema already provides:

- **`import_batches`** — tracks file uploads, mapping config (JSONB), status workflow, stats
- **`import_rows`** — per-row tracking with raw JSONB, normalised JSONB, action (create/merge/skip/error), status, error/warning arrays, links to created org/contact
- **`entity_resolution_matches`** — dedup scoring with signals JSONB, decision workflow
- **`data_sources`** — provenance tracking

This covers most of Priority 5's import management requirements at the data layer.

## Existing contact/people architecture

- **`contacts`** — full name, first/last, LinkedIn, verification, compliance (lawful_basis, subscriber_type, opt-out)
- **`contact_organisations`** — many-to-many with title, role_category (founder/ceo_md/cco/cmo/etc.), buyer_relevance score, is_current flag
- **`contact_channels`** — unlimited emails/phones/linkedin per contact or org, with quality classification, verification status/method, confidence score, bounce tracking

This fully supports the spec's requirements for multiple people per org, role history, and contact verification.

## Migration plan

See `supabase/migrations/20261016000001_import_schema_gaps.sql` for the additive changes.
