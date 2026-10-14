# Operations guide

## 1. Local development

```bash
npm install
npx supabase start          # Docker required; prints local URL/keys
npx supabase db reset       # applies supabase/migrations/*
cp .env.example .env.local  # then fill values (see below)
node --env-file=.env.local scripts/create-dev-user.mjs     # local test founder account
node --env-file=.env.local scripts/bootstrap-provider.mjs  # moves ANTHROPIC_API_KEY into encrypted storage
npm run dev                 # http://localhost:3000
```

Tests: `npm test` (unit) · `npm run test:sql` (database integrity) · `npm run typecheck`.
Web fonts: `bash scripts/build-fonts.sh` rebuilds `public/fonts/*.woff2` from the licensed OTF folder.

## 2. Credentials needed to finish Phase 1

| What | Where it goes | Why |
|---|---|---|
| **Anthropic workspace ID** (`wrkspc_…`), or a workspace-scoped API key | Settings → Claude & AI providers → Rotate / edit | The supplied key is organisation-level; Anthropic rejects it without the `anthropic-workspace-id` header. Find the ID in Console → Settings → Workspaces. |
| **Google OAuth client** (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) | `.env.local` / host env | Gmail connect, drafts, send, sync. Steps are shown in Settings → Gmail & LinkedIn. |
| **Supabase database password** for project `pseaaaltdzbzlpdlsjkv` | your terminal only | To push migrations to the cloud project (see §3). The publishable and secret keys can't run DDL. |

Rotate the Anthropic key and the Supabase secret key: both were shared in chat. Never paste account passwords into chats or tools.

## 3. Deploying to the cloud Supabase project

```bash
npx supabase link --project-ref pseaaaltdzbzlpdlsjkv   # prompts for the DB password
npx supabase db push                                    # applies all migrations
```

Then in the Supabase dashboard:
1. Auth → Providers → Email: **disable public sign-ups** after creating the founder account (single-founder workspace).
2. Auth → URL configuration: site URL = production URL; redirect `https://<app>/auth/callback`.
3. Database → Extensions: enable `pg_cron` and `pg_net`, then schedule the worker:

```sql
select cron.schedule('nishaan-jobs', '* * * * *', $$
  select net.http_post(url := 'https://<app>/api/jobs/tick',
    headers := jsonb_build_object('Authorization', 'Bearer <JOBS_SECRET>'));
$$);
```

App hosting (Vercel/Render): set every variable from `.env.example`. `SUPABASE_SECRET_KEY`, `CREDENTIALS_ENCRYPTION_KEY`, `JOBS_SECRET` and the Google/Anthropic values are server-only. Never prefix them with `NEXT_PUBLIC_`. Keep `CREDENTIALS_ENCRYPTION_KEY` in a secret manager: losing it makes stored keys and tokens unreadable, and you would need to re-enter them.

## 4. Security checklist

- [x] RLS on every table; secret tables (`provider_secrets`, `channel_account_secrets`) have no client policies
- [x] Keys and OAuth tokens encrypted at rest (AES-256-GCM), masked in UI, redacted from logs and errors
- [x] Only `lib/execution/gateway.ts` sends; DB refuses Gmail send claims from user sessions
- [x] Approvals are fingerprinted (sha256 of channel, account, recipient, subject, body); any new version invalidates them
- [x] External content wrapped as `<untrusted_evidence>`; agent output zod-validated; recipients and citations checked against the package
- [x] Central suppression list checked at draft time and send time; PECR individual-subscriber block
- [x] Security headers (frame deny, nosniff, referrer, permissions)
- [ ] Disable public sign-up in production
- [ ] Commercial font licence confirmed
- [ ] Google OAuth app verification before adding team members

## 5. Incidents & retries

| Situation | What happens | What to do |
|---|---|---|
| Gmail returns 429/5xx | send job → `failed`, retry allowed up to 3 attempts | Re-open the approval and press Send again; preflight re-runs every check |
| Network timeout / unknown outcome | send job → `dead`, never auto-retried | Check Gmail Sent folder; if not sent, request a new approval |
| Sent but recording failed | `system_errors` entry `sent_but_record_failed` | Do **not** resend; reconcile from Gmail Sent (Operations shows the provider id) |
| Token refresh failed | account → `awaiting_user_action` | Settings → Gmail → Reconnect |
| Budget exhausted | agent execution `blocked_budget` | Raise budget in Settings → AI providers, or wait for month rollover |
| Job dead-lettered | visible in Settings → Operations | Fix cause, press Retry |
| Bad import | Data Centre → Import history → Reverse | Records already used in outreach are kept and listed |

## 6. Backlog (next)

1. Phase 2 discovery: campaigns + Companies House adapter + news via cited web search; scheduled discovery runs with spend caps.
2. Follow-up draft generation from reminders (still approval-gated).
3. Gmail Pub/Sub push instead of polling (Supabase Edge Function webhook).
4. Team roles UI (analyst / reviewer / viewer), invitations.
5. Proposal & meeting prep briefs; win/loss capture → qualification calibration.
6. Messaging-performance analytics once sample sizes allow.
