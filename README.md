# Novera — talking website

One-page site for Novera (websites + AI receptionists) with a live Retell voice
agent embedded, plus a booking page wired to Cal.com. Visitors can talk to the
same receptionist Novera sells, and it books consultations onto the real
calendar.

Static Vite build. No backend.

## Run it locally

```bash
npm install
```

```bash
npm run dev
```

<http://localhost:5173> — the dev server binds to all interfaces, so the
terminal also prints a `Network:` address you can open on a phone on the same
Wi-Fi. Note the voice agent needs HTTPS or `localhost`, so it will not work over
that LAN address.

`npm run build` outputs to `dist/`.

## Pages

| File | What it is |
| --- | --- |
| `index.html` | Marketing page — hero, services, live call demo, why, process, reviews, hours/contact |
| `book.html` | Booking page — Cal.com inline calendar |

Both share `src/styles.css`. `src/voice.js` (the assistant) and
`src/analytics.js` (the tracking) are used by both.

## What's wired up

| Piece | Value |
| --- | --- |
| Retell agent | `agent_7dce1cca0d229c36cdeee78121` — "Novera Website Receptionist" |
| Retell LLM | `llm_b978c7729e64010f20fe908a2749` — gpt-4.1, voice `11labs-Marissa` |
| Cal.com event type | `6526761` — "30 min meeting" |
| Phone | (504) 481-3624 |
| Email | buildnovera@gmail.com |

The voice agent is built on Retell's official `retell-client-js-sdk` rather than
the drop-in widget — the widget renders nothing for a voice-only config. Clicking
"Talk to us" runs a microphone preflight, calls `POST /v2/create-web-call` with
the **public** key, then connects with the returned access token.

The SDK (~536 kB) is code-split and only fetched when a visitor is invited to
talk, so first load stays around 25 kB of JavaScript.

## ⚠️ The gotcha that will bite you

**Retell public keys are locked to specific domains.** On any new domain the
agent fails with:

```
401 — "Public key is not allowed for this domain"
```

Fix: Retell dashboard → **Keys** → the public key → add the domain. Keep
`localhost` in the list for local work. The booking calendar is unaffected —
this only blocks voice.

## Analytics — conversion rate and LTV

PostHog measures the funnel; Stripe supplies the money. `src/analytics.js` is a
thin wrapper that no-ops until a project key is set, so an unconfigured build
behaves exactly like the site did before it existed.

**Set the key.** Paste your PostHog project key into `INLINE_KEY` at the top of
`src/analytics.js`, or set `VITE_POSTHOG_KEY` at build time. It is a write-only
ingest key and is safe to commit — the same reasoning as the Retell public key.
Set `INLINE_HOST` (or `VITE_POSTHOG_HOST`) to `https://eu.i.posthog.com` on EU
cloud.

posthog-js is ~243 kB, so it is code-split like the voice SDK and only fetched
once a key is configured. First load stays around 25 kB.

### What is tracked

| Event | Fires when | Properties |
| --- | --- | --- |
| `$pageview` | automatic | — |
| `book_cta_clicked` | any "Book a call" link | `location` (header/hero/body), `page` |
| `phone_clicked` | any `tel:` link | `page` |
| `email_clicked` | any `mailto:` link | `page` |
| `booking_page_viewed` | `book.html` loads | — |
| `booking_confirmed` | **the conversion** — Cal reports a booking | `event_type`, `booking_uid`, `matched_email` |
| `voice_call_requested` | "Talk to us" clicked | `page` |
| `voice_call_connected` | Retell call goes live | `page` |
| `voice_call_ended` | call finishes | `duration_seconds` |
| `voice_call_failed` | mic blocked, offline, 401, dropped | `reason`, `detail` |
| `review_submitted` | review form passes validation | `rating`, `has_website` |

### The funnel

Build it in PostHog as: `$pageview` → `book_cta_clicked` →
`booking_page_viewed` → `booking_confirmed`. Conversion rate is the last step
over unique visitors.

The voice agent is a **parallel route, not a funnel step** — Ava can book
someone who never opens the calendar page, so folding it in would double-count.

### How LTV works

Nothing on the site knows what anything costs (see "No prices anywhere" below),
so LTV is not computed here. Connect Stripe as a PostHog **data warehouse
source** (Data pipeline → Sources → Stripe); PostHog then derives lifetime value
as ARPU ÷ churn from real charges and subscriptions. The Stripe key lives in
PostHog, never in this bundle.

The join between the two halves is email: `booking_confirmed` calls
`identify()` with the attendee's address, which is what lets a Stripe customer
be matched back to the visitor who booked. **Remove that call and LTV has
nothing to attach to.**

⚠️ Cal nests the attendee differently across embed versions, so the email is dug
out defensively from more than one path. It was verified against a synthetic
payload, not a live booking — make one real test booking and confirm
`matched_email` is `true` before trusting the numbers.

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every
push to `main`. Enable it once under repo **Settings → Pages → Source: GitHub
Actions**.

Asset paths are relative (`base: './'` in `vite.config.js`), so the build works
from a domain root or a subpath like `username.github.io/novera-website`.

## Keys

`.env` is gitignored and holds the secrets — the Retell **API** key, the Cal.com
key, the Gemini key. Nothing reads it at runtime; they were only used to create
the agent and read the calendar during setup. See `.env.example` for the shape.

The Retell **public** key and agent id are in `src/voice.js` on purpose. Public
keys are designed to be exposed in frontend code and are restricted by domain.

## Things worth knowing

- **Reviews have nowhere to go.** The star rating and review form are real, but
  with no backend the submission opens the visitor's mail client (with an
  explicit link and a copy-to-clipboard fallback, since `mailto:` fails silently
  when no mail client is configured). Wiring this to Formspree/Supabase/similar
  is the obvious next step.
- **Booking needs only a name and an email.** Cal.com's phone field is optional
  and hidden. The agent used to demand a phone number before booking and it cost
  real bookings — the prompt now forbids asking for one before the appointment
  is confirmed.
- **No prices anywhere.** None were supplied, and the agent is explicitly told
  never to invent or ballpark one — it offers the free consultation instead.
- **No testimonials.** The reviews section says zero on purpose. Nothing is
  fabricated.
- **Location is inferred** from the 504 area code (New Orleans, LA) and appears
  in the title tag and schema. Correct it if wrong.
- The social card `public/og.jpg` is generated, not hand-made. It has the phone
  number baked into the image — regenerate it if the number changes.
