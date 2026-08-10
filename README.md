# Novera — talking website

One-page site for Novera (websites + AI receptionists) with a live Retell voice
agent embedded. Visitors can talk to the same receptionist Novera sells, and it
books consultations straight onto the Cal.com calendar.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Then open <http://localhost:5173>.

Build for production with `npm run build` (output goes to `dist/`).

## What's wired up

| Piece | Value |
| --- | --- |
| Retell agent | `agent_7dce1cca0d229c36cdeee78121` ("Novera Website Receptionist") |
| Retell LLM | `llm_b978c7729e64010f20fe908a2749` (gpt-4.1, voice `11labs-Marissa`) |
| Booking | Cal.com event type `6526761` — "30 min meeting", real availability |
| Phone | (504) 481-3624, click-to-call throughout |
| Booking page | `/book.html` — Cal.com inline embed, same event type as the agent |

Two pages: `index.html` (marketing) and `book.html` (booking). Both share
`src/styles.css` and `src/voice.js`, so the voice agent and the design system
live in one place. `vite.config.js` registers both as build entry points.

The booking page embeds Cal.com's official inline calendar pointed at the same
event type (`6526761`) the voice agent books into — so a self-service booking
and one Ava makes land on the same calendar and respect the same availability.

The voice agent is built on Retell's official `retell-client-js-sdk`. Clicking
"Talk to us" runs a microphone preflight, calls `POST /v2/create-web-call` with
the **public** key, then connects with the returned access token.

The SDK (~536 kB) is code-split and only fetched when a visitor is actually
invited to talk, so the initial page load stays at ~24 kB of JavaScript.

## Keys

`.env` is gitignored and holds the secret keys (Retell API key, Cal.com key,
Gemini key). Nothing reads it at runtime — those keys were only used to create
the agent and read the calendar during setup.

The Retell **public** key and agent ID are in `src/main.js` on purpose. Public
keys are designed to be exposed in frontend code; they can only start a web call
for that agent.

## Deploying to Vercel (no command line)

1. Put this folder on GitHub — GitHub Desktop, or "Add file → Upload files" on a
   new empty repo. Do **not** upload `.env` (`.gitignore` already excludes it).
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo.
3. Vercel detects Vite automatically. Confirm:
   - Build command `npm run build`
   - Output directory `dist`
   - No environment variables needed.
4. Click **Deploy**.
5. Add the custom domain under **Settings → Domains**.

### After deploying — required

Add the live domain to the Retell public key's allowed domains, or the voice
agent will not connect from production:

Retell dashboard → **Keys** → the public key → add your Vercel domain
(e.g. `novera.vercel.app`) and your custom domain. Keep `localhost` there for
local testing.

## Notes

- Voice needs HTTPS. Vercel provides it; `localhost` is also treated as secure.
- If a visitor has no microphone or blocks permission, the site shows a friendly
  message with the phone number instead of throwing.
