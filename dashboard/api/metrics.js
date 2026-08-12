/* ============================================================================
   Live metrics for the private dashboard.
   ----------------------------------------------------------------------------
   Everything the page needs arrives in one PostHog query. That is a deliberate
   choice, not a micro-optimisation: the HogQL endpoint is rate limited to 120
   requests an hour, so a dashboard that fired one request per tile would run
   out of budget in an afternoon. One query per time range, cached for two
   minutes, keeps a comfortably-refreshed page well inside the limit.

   The personal API key only ever exists here, server-side. The browser sees
   counts, never credentials.
   ========================================================================== */
import { requireAuth } from './_auth.js';

const CACHE_MS = 120 * 1000;
const cache = new Map();               // range → { at, payload }

/** Only these windows are allowed, so the value can never reach SQL unchecked. */
const RANGES = new Set([7, 30, 90]);

const HOST = () =>
  (process.env.POSTHOG_API_HOST || 'https://us.posthog.com').replace(/\/+$/, '');

function envNumber(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Funnel counts and voice engagement in a single pass over events.
 * Counted by person, not by event, so one enthusiastic visitor clicking the
 * same button six times is still one person in the funnel.
 */
const funnelSQL = (days) => `
  SELECT
    uniqIf(person_id, event = '$pageview')            AS visitors,
    uniqIf(person_id, event = 'book_cta_clicked')     AS cta,
    uniqIf(person_id, event = 'booking_page_viewed')  AS page,
    uniqIf(person_id, event = 'booking_confirmed')    AS booked,
    uniqIf(person_id, event = 'voice_call_connected') AS voice,
    medianIf(
      toFloat(properties.duration_seconds),
      event = 'voice_call_ended' AND isNotNull(properties.duration_seconds)
    ) AS call_seconds
  FROM events
  WHERE timestamp >= now() - INTERVAL ${days} DAY
`;

async function runQuery(sql) {
  const key = process.env.POSTHOG_API_KEY;
  const project = process.env.POSTHOG_PROJECT_ID;
  if (!key) throw new Error('POSTHOG_API_KEY is not set');
  if (!project) throw new Error('POSTHOG_PROJECT_ID is not set');

  const res = await fetch(`${HOST()}/api/projects/${project}/query/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: sql } })
  });

  const text = await res.text();
  if (!res.ok) {
    // Pass PostHog's own complaint through. A bad column name or a key missing
    // the query:read scope is far easier to fix when you can read what it said.
    throw new Error(`PostHog ${res.status}: ${text.slice(0, 400)}`);
  }

  let json;
  try { json = JSON.parse(text); }
  catch (e) { throw new Error('PostHog returned a non-JSON body'); }

  const columns = json.columns || [];
  const row = (json.results && json.results[0]) || [];
  const out = {};
  columns.forEach((name, i) => { out[name] = row[i]; });
  return out;
}

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
};
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function build(days) {
  const f = await runQuery(funnelSQL(days));

  // Revenue: by default the commercial assumptions come from configuration,
  // because Stripe's warehouse table names differ between PostHog setups and a
  // guessed table is worse than an honest constant. Point
  // POSTHOG_REVENUE_SQL at a query returning setup / monthly / churn_pct and
  // this switches to live figures instead.
  let value = {
    setup: envNumber('LTV_SETUP_FEE'),
    monthly: envNumber('LTV_MONTHLY'),
    churn_pct: envNumber('LTV_CHURN_PCT'),
    close_pct: envNumber('CLOSE_RATE_PCT'),
    source: 'configured',
    warning: null
  };

  const revenueSQL = process.env.POSTHOG_REVENUE_SQL;
  if (revenueSQL && revenueSQL.trim()) {
    try {
      const r = await runQuery(revenueSQL);
      value = {
        setup: toNum(r.setup) ?? value.setup,
        monthly: toNum(r.monthly) ?? value.monthly,
        churn_pct: toNum(r.churn_pct) ?? value.churn_pct,
        close_pct: toNum(r.close_pct) ?? value.close_pct,
        source: 'live',
        warning: null
      };
    } catch (err) {
      // Falling back is right, but silently falling back is not — the page
      // should be able to say the numbers are stale assumptions.
      console.error('revenue query failed:', err.message);
      value.warning = 'Live revenue query failed, showing configured values. ' + err.message;
    }
  }

  return {
    range_days: days,
    generated_at: new Date().toISOString(),
    funnel: {
      visitors: toInt(f.visitors),
      cta: toInt(f.cta),
      page: toInt(f.page),
      booked: toInt(f.booked)
    },
    voice: {
      conversations: toInt(f.voice),
      median_seconds: toNum(f.call_seconds)
    },
    value
  };
}

async function handler(req, res) {
  // Private data: never let a CDN or proxy hold on to a copy.
  res.setHeader('Cache-Control', 'no-store');

  const days = Number(req.query && req.query.range) || 30;
  if (!RANGES.has(days)) {
    res.status(400).json({ error: 'range must be one of 7, 30, 90' });
    return;
  }

  const hit = cache.get(days);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    res.status(200).json({ ...hit.payload, cached: true });
    return;
  }

  try {
    const payload = await build(days);
    cache.set(days, { at: Date.now(), payload });
    res.status(200).json({ ...payload, cached: false });
  } catch (err) {
    console.error('metrics failed:', err);
    // Serve the last good payload rather than a blank dashboard, but label it.
    if (hit) {
      res.status(200).json({
        ...hit.payload,
        cached: true,
        stale: true,
        error: err.message
      });
      return;
    }
    res.status(502).json({ error: err.message });
  }
}

export default requireAuth(handler);
