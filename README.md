# Nishaan-a OS

Commercial intelligence & outreach operating system for Nishaan-a.
**AI researches and prepares. The human authorises and communicates.**

- Next.js 15 (App Router) · TypeScript · Tailwind v4 · Radix · Motion · Recharts
- Supabase (Auth, Postgres + RLS, Storage, pg_cron) — single database
- Anthropic Claude via an internal provider gateway (server-only, metered, per-agent models)
- Gmail (OAuth) as the only API send channel; LinkedIn via manual handoff

## Docs

- [Architecture blueprint](docs/ARCHITECTURE.md) — system, agents, integrations, state machines, trust boundaries
- [Phase 1 spec](docs/PHASE1-SPEC.md)
- [Operations](docs/OPERATIONS.md) — setup, credentials, deploy, security checklist, incidents
- [Progress & test register](docs/PROGRESS.md)

Schema: `supabase/migrations/` · Agent prompts & output contracts: `src/lib/ai/agents/` · Design tokens: `src/app/globals.css`

## Quick start

```bash
npm install && npx supabase start && npx supabase db reset
npm run dev
```

See [docs/OPERATIONS.md](docs/OPERATIONS.md) for environment variables.
