/* ============================================================================
   NOVERA — booking page
   ----------------------------------------------------------------------------
   The calendar is Cal.com's official inline embed pointed at the same event
   type the voice agent books into, so a booking made here and one made by Ava
   land on the same calendar and respect the same availability.
   ========================================================================== */
import './voice.js';

const CAL_LINK = 'noah-trinh-8paljc/30min';
const NAMESPACE = '30min';

/* ---------- Cal.com inline embed ---------- */
(function () {
  const mount = document.getElementById('novera-cal');
  const fallback = document.getElementById('cal-fallback');
  if (!mount) return;

  // Official Cal.com embed loader.
  (function (C, A, L) {
    let p = function (a, ar) { a.q.push(ar); };
    let d = C.document;
    C.Cal = C.Cal || function () {
      let cal = C.Cal; let ar = arguments;
      if (!cal.loaded) { cal.ns = {}; cal.q = cal.q || []; d.head.appendChild(d.createElement('script')).src = A; cal.loaded = true; }
      if (ar[0] === L) {
        const api = function () { p(api, arguments); };
        const namespace = ar[1];
        api.q = api.q || [];
        if (typeof namespace === 'string') {
          cal.ns[namespace] = cal.ns[namespace] || api;
          p(cal.ns[namespace], ar);
          p(cal, ['initNamespace', namespace]);
        } else p(cal, ar);
        return;
      }
      p(cal, ar);
    };
  })(window, 'https://app.cal.com/embed/embed.js', 'init');

  Cal('init', NAMESPACE, { origin: 'https://app.cal.com' });

  // theme goes in the inline config too — passing it only to ui() does not
  // reach the iframe, and the calendar renders light against the dark page.
  Cal.ns[NAMESPACE]('inline', {
    elementOrSelector: '#novera-cal',
    config: { layout: 'month_view', theme: 'dark' },
    calLink: CAL_LINK
  });

  Cal.ns[NAMESPACE]('ui', {
    theme: 'dark',
    cssVarsPerTheme: {
      dark: {
        'cal-brand': '#E4C48E',
        'cal-bg': 'transparent',
        'cal-bg-emphasis': 'rgba(255,255,255,.05)',
        'cal-border': 'rgba(180,200,255,.16)',
        'cal-border-emphasis': 'rgba(228,196,142,.4)',
        'cal-text': '#E4EBFF',
        'cal-text-emphasis': '#FFFFFF',
        'cal-text-subtle': '#8791AB'
      }
    },
    hideEventTypeDetails: false,
    layout: 'month_view'
  });

  // Hide the loading state once the embed has actually put something on screen.
  const settle = () => {
    if (mount.querySelector('iframe') || mount.children.length) {
      fallback && fallback.classList.add('gone');
      return true;
    }
    return false;
  };
  if (!settle()) {
    const mo = new MutationObserver(() => { if (settle()) mo.disconnect(); });
    mo.observe(mount, { childList: true, subtree: true });
    // If it never loads, leave the message up with the direct link and phone.
    setTimeout(() => mo.disconnect(), 15000);
  }
})();

/* ---------- lightweight versions of the site's pointer flourishes ---------- */
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const $$ = (s) => [].slice.call(document.querySelectorAll(s));

  const orb = document.getElementById('orb');
  if (orb) {
    const o = { x: innerWidth / 2, y: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2 };
    addEventListener('pointermove', (e) => { o.tx = e.clientX; o.ty = e.clientY; }, { passive: true });
    $$('a, button').forEach((el) => {
      el.addEventListener('pointerenter', () => orb.classList.add('wide'));
      el.addEventListener('pointerleave', () => orb.classList.remove('wide'));
    });
    const tick = () => {
      o.x += (o.tx - o.x) * 0.16; o.y += (o.ty - o.y) * 0.16;
      orb.style.transform = `translate3d(${o.x - 13}px,${o.y - 13}px,0)`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  $$('.magnetic').forEach((el) => {
    let raf = 0, tx = 0, ty = 0, x = 0, y = 0;
    const follow = () => {
      x += (tx - x) * 0.18; y += (ty - y) * 0.18;
      el.style.transform = `translate3d(${x}px,${y}px,0)`;
      if (Math.abs(tx - x) > 0.2 || Math.abs(ty - y) > 0.2) raf = requestAnimationFrame(follow);
      else raf = 0;
    };
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      tx = (e.clientX - (r.left + r.width / 2)) * 0.24;
      ty = (e.clientY - (r.top + r.height / 2)) * 0.3;
      if (!raf) raf = requestAnimationFrame(follow);
    });
    el.addEventListener('pointerleave', () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      tx = 0; ty = 0; x = 0; y = 0;
      el.style.transition = 'transform .6s cubic-bezier(.16,1,.3,1)';
      el.style.transform = 'translate3d(0,0,0)';
      setTimeout(() => { el.style.transition = ''; }, 600);
    });
  });
})();
