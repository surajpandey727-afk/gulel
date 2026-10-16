# Google OAuth Diagnostics — gulel

## Error

`Error 400: redirect_uri_mismatch` / `Access blocked: This app's request is invalid`

Account: team@nishaan-a.com

## Root cause

The production redirect URI is not listed in the Google Cloud Console OAuth client's authorised redirect URIs.

## Flow identification

| Flow | Status | Implementation |
|------|--------|----------------|
| **Flow A — Sign in with Google** | NOT IMPLEMENTED | Login is email+password only via Supabase Auth. No `signInWithOAuth`, no Google provider in `supabase/config.toml`, no `/auth/callback` route. |
| **Flow B — Connect Gmail** | IMPLEMENTED, CONFIG BLOCKED | Full server-side OAuth for Gmail API access. Code is correct; Google Cloud Console redirect URI is missing. |

## OAuth client involved

- **Client ID**: `931829168497-cd56p13h7gh2di48bfo452jfe2r5vkig.apps.googleusercontent.com`
- **Type**: Web application
- **Source**: `GOOGLE_CLIENT_ID` env var (set in Vercel production and `.env.local`)

## Redirect URI analysis

### Constructed at runtime

```
${NEXT_PUBLIC_APP_URL}/api/gmail/oauth/callback
```

Source: `src/lib/channels/gmail.ts:24-27`

### Expected production URI

```
https://gulel.nishaan-a.com/api/gmail/oauth/callback
```

### Expected Vercel preview URI

```
https://gulel.vercel.app/api/gmail/oauth/callback
```

### Local development URI

```
http://localhost:3000/api/gmail/oauth/callback
```

## Required Google Cloud Console changes

### Step 1 — Authorised redirect URIs

Navigate to: Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs → select client `931829168497-...`

Add these redirect URIs:

```
https://gulel.nishaan-a.com/api/gmail/oauth/callback
https://gulel.vercel.app/api/gmail/oauth/callback
http://localhost:3000/api/gmail/oauth/callback
```

**Critical**: scheme, hostname, path and trailing slash must match exactly. No wildcards.

### Step 2 — Authorised JavaScript origins

Add:

```
https://gulel.nishaan-a.com
https://gulel.vercel.app
http://localhost:3000
```

### Step 3 — OAuth consent screen

The Gmail scopes used are **restricted**:

| Scope | Sensitivity |
|-------|-------------|
| `gmail.compose` | Restricted |
| `gmail.readonly` | Restricted |
| `gmail.send` | Restricted |
| `openid` | Non-sensitive |
| `email` | Non-sensitive |

Until the OAuth consent screen is verified by Google:

- Only users added as **test users** in the consent screen can authorise
- Add `team@nishaan-a.com` as a test user
- Publishing status should be **Testing** (not In production) until verification

### Step 4 — Enable Gmail API

Ensure the Gmail API is enabled in the same Google Cloud project:
APIs & Services → Enabled APIs → search "Gmail API" → Enable

## Verify NEXT_PUBLIC_APP_URL in Vercel

The Vercel production env var `NEXT_PUBLIC_APP_URL` must be:

```
https://gulel.nishaan-a.com
```

No trailing slash. If it has one, the redirect URI will contain `//api/gmail/oauth/callback` and fail.

## Code changes applied

| File | Change | Reason |
|------|--------|--------|
| `src/lib/channels/gmail.ts:24-27` | Strip trailing slash from `NEXT_PUBLIC_APP_URL` | Prevent double-slash in redirect URI if env var has trailing `/` |

## Implementation quality assessment

The existing OAuth implementation is solid:

- State parameter with CSRF protection via cookie
- Scope verification (detects partially granted permissions)
- Encrypted token storage (AES-256-GCM)
- Token refresh with expiry detection
- Workspace ownership verification on both start and callback
- Audit logging of connect/disconnect events
- Integration event tracking
- Middleware allows callback route without auth redirect
- Error states handled: denied, state_mismatch, forbidden, not_configured, error

## Post-fix verification checklist

- [ ] Redirect URIs added in Google Cloud Console
- [ ] Test user added in OAuth consent screen
- [ ] Gmail API enabled in Google Cloud project
- [ ] `NEXT_PUBLIC_APP_URL` verified (no trailing slash)
- [ ] Click "Connect Gmail" → Google consent screen loads (no redirect_uri_mismatch)
- [ ] Grant permissions → redirected to `/settings/integrations?gmail=connected`
- [ ] `channel_accounts` row created with status `connected`
- [ ] Encrypted tokens stored in `channel_account_secrets`
- [ ] Disconnect works → status becomes `disconnected`
- [ ] Reconnect works after disconnect

## Status

| Requirement | Status |
|---|---|
| Code implementation | PASSED — correct and complete |
| Google Cloud Console config | BLOCKED — requires admin to add redirect URIs |
| Gmail API enablement | BLOCKED — requires admin verification |
| OAuth consent screen | BLOCKED — requires adding test user |
