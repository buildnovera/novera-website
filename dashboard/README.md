# Novera — private metrics dashboard

Conversion rate and lifetime value, read live from PostHog, behind a password.

This is **deliberately a separate deployment** from the marketing site. The
marketing site is static and lives on GitHub Pages, which cannot run
server-side code and serves everything publicly. This needs both: a server to
hold the PostHog key, and a lock on the front door.

Nothing here is built by `npm run build` at the repo root, so the dashboard can
never be published to the public Pages site by accident.

## Shape of it

| Path | What it does |
| --- | --- |
| `index.html` | The whole UI — login gate and dashboard in one page, no framework |
| `api/_auth.js` | Password check and signed session cookie (`_` prefix keeps it off the router) |
| `api/login.js` | `GET` reports whether you have a session, `POST` exchanges the password for one |
| `api/logout.js` | Clears the cookie |
| `api/metrics.js` | Queries PostHog and returns the numbers |
| `vercel.json` | Security headers and `no-store` on the page |

## Deploy

Any host that runs Node serverless functions works. On Vercel:

1. **New Project** → import this repo.
2. Set **Root Directory** to `dashboard`. This is the important step — it stops
   Vercel from also deploying the marketing site.
3. Framework preset: **Other**. There is no build step.
4. Add the environment variables from `.env.example`.
5. Deploy.

The dashboard is then at your Vercel URL. Add a custom domain if you want
something memorable — a subdomain like `metrics.novera.studio` is fine, since
being guessable costs nothing when the page is locked.

## The PostHog key is not the one on the website

Two different keys, and mixing them up is the most likely setup mistake:

| Key | Where it lives | What it does |
| --- | --- | --- |
| Project key (`phc_…`) | `src/analytics.js`, shipped to browsers | Write-only. Sends events in. |
| Personal API key (`phx_…`) | `POSTHOG_API_KEY` here, server-only | Reads data back out. **Never ship this to a browser.** |

Create the personal key under **Settings → Personal API keys** with the
`query:read` scope. Anything more is unnecessary.

## Rate limits shape the design

PostHog allows **120 query requests per hour**. So:

- All funnel counts arrive in **one** query, not one per tile.
- The server caches each time range for **two minutes**.
- The page polls every 60 seconds and pauses while the tab is hidden, so a
  refresh usually lands on cache.

Worst case is roughly 30 upstream queries an hour — comfortably inside the
budget with room for a second time range.

If a refresh fails, the last good numbers stay on screen labelled **Stale**
rather than collapsing to zeros, because a dashboard showing 0% conversion is
worse than one admitting it could not reach the API.

## LTV, and why it is configured rather than measured

The funnel is measured. The commercial figures are not, because nothing on the
website knows what anything costs.

By default LTV comes from `LTV_SETUP_FEE`, `LTV_MONTHLY` and `LTV_CHURN_PCT`,
combined as `setup + (monthly ÷ churn)` — PostHog's ARPU ÷ churn, plus the
one-off build fee that Novera's model actually has. The page marks these
`CONFIGURED` so they are never mistaken for observed revenue.

To make them live, connect Stripe as a PostHog data warehouse source and set
`POSTHOG_REVENUE_SQL` to a query returning one row with columns `setup`,
`monthly`, `churn_pct`. Confirm your Stripe table names in PostHog first — they
differ between setups, which is why nothing is guessed here. If the query
fails, the dashboard falls back to the constants and says so on screen instead
of going blank.

Leave everything empty and the funnel still works; LTV simply reads as unset.

## Security, honestly

What is protected: the PostHog key never leaves the server, the session cookie
is `HttpOnly` `Secure` `SameSite=Lax` and carries only a signed expiry, the
password and signature comparisons are constant-time, `no-store` keeps private
numbers out of caches, and the CSP allows no external hosts.

What is not: **there is no rate limiting on login attempts.** Serverless
functions have no shared memory to count them in. A wrong password costs the
attacker 600ms and nothing else. That is fine for a long random password and
not fine for `novera2024`. If this ever holds anything more sensitive than
funnel counts, put the host's own access control in front of it or add a proper
store-backed lockout.

Sessions last 12 hours. Changing `DASH_SECRET` invalidates all of them.

## Running it locally

`vercel dev` from this directory, with the environment variables set. Plain
`npx serve` will serve the page but every `/api/*` call will 404, so the login
will appear broken.
