/* ============================================================================
   5. ANALYTICS — PostHog
   ----------------------------------------------------------------------------
   Two questions this is here to answer:

     · conversion rate — of the people who land, how many actually book?
     · lifetime value  — what is a booked customer worth over time?

   The funnel is measured here. The money is not: revenue arrives in PostHog
   straight from Stripe as a data-warehouse source, so no key and no dollar
   figure ever touches this bundle. The one thing the frontend has to do is
   identify a booking by email, because email is what joins a visitor in
   PostHog to a customer in Stripe. Without that call, LTV has nothing to
   attach itself to.

   The project key is a write-only ingest key — safe in frontend code, exactly
   like the Retell public key in voice.js. Until one is set every function
   here is an inert no-op, so an unconfigured build behaves like today's site
   rather than throwing.

   posthog-js is ~60 kB, so it is code-split and fetched alongside the page
   rather than shipped in the initial bundle. Events fired before it lands are
   queued and flushed on arrival, which matters because the first CTA click
   can easily beat the network.
   ========================================================================== */

const INLINE_KEY = '';                       // ← paste your PostHog project key
const INLINE_HOST = 'https://us.i.posthog.com';  // EU cloud: https://eu.i.posthog.com

const KEY = (INLINE_KEY || import.meta.env.VITE_POSTHOG_KEY || '').trim();
const HOST = (import.meta.env.VITE_POSTHOG_HOST || INLINE_HOST).trim();

/** True when a project key is configured — handy for debugging in the console. */
export const enabled = Boolean(KEY);

let hog = null;          // the live posthog instance, once it has loaded
let loading = null;      // in-flight import, so we only ever load it once
const pending = [];      // events fired before the SDK arrived

function drain() {
  while (hog && pending.length) {
    const [kind, a, b] = pending.shift();
    try {
      if (kind === 'identify') hog.identify(a, b);
      else hog.capture(a, b);
    } catch (err) {
      console.warn('Analytics call failed:', err);
    }
  }
}

function boot() {
  if (!KEY || loading) return loading;
  loading = import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(KEY, { api_host: HOST });
      hog = posthog;
      drain();
      return posthog;
    })
    .catch((err) => {
      // Blocked by an ad blocker, offline, whatever — analytics is never
      // allowed to be the reason something on the page breaks.
      console.warn('Analytics failed to load:', err);
      pending.length = 0;
      return null;
    });
  return loading;
}

/** Start the SDK loading. Safe to call more than once. */
export function init() { boot(); }

/** Record an event. Silently does nothing until a key is configured. */
export function track(event, props) {
  if (!KEY) return;
  pending.push(['capture', event, props]);
  if (hog) drain(); else boot();
}

/**
 * Tie everything this browser has done to a person, keyed by email.
 * This is the join key for Stripe revenue, so it is the difference between
 * having LTV and not having it.
 */
export function identify(email, props) {
  if (!KEY || !email) return;
  pending.push(['identify', email, { email, ...props }]);
  if (hog) drain(); else boot();
}

/**
 * Delegated tracking for the links that appear on both pages. One listener on
 * the document rather than a listener per link, so nothing has to be re-wired
 * when markup moves around.
 */
export function wireCommonLinks() {
  if (!KEY) return;

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href') || '';

    if (/book\.html/.test(href)) {
      track('book_cta_clicked', {
        // Which of the several Book buttons did the work — the sticky header,
        // the hero, or the one down in the contact block.
        location: link.closest('header') ? 'header'
          : link.closest('.hero') ? 'hero'
          : 'body',
        page: location.pathname
      });
    } else if (href.startsWith('tel:')) {
      track('phone_clicked', { page: location.pathname });
    } else if (href.startsWith('mailto:')) {
      track('email_clicked', { page: location.pathname });
    }
  }, { passive: true });
}
