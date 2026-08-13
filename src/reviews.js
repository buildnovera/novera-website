/* ============================================================================
   NOVERA — reviews
   ----------------------------------------------------------------------------
   · a spring-animated star row you can swipe to rate
   · reviews saved to localStorage; the section count and average update
   · a synthesised stadium roar at 5 stars, confetti, and a gold shockwave
   All audio and particles are generated here — no libraries, no media files.
   ========================================================================== */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MAILTO = 'buildnovera@gmail.com';
const STORE = 'novera.reviews.v1';

/* ----------------------------------------------------------- persistence --- */
function loadReviews() {
  try {
    const raw = localStorage.getItem(STORE);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

function saveReview(entry) {
  try {
    const list = loadReviews();
    list.unshift(entry);
    localStorage.setItem(STORE, JSON.stringify(list.slice(0, 50)));
    return list;
  } catch (_) {
    return loadReviews();
  }
}

const STAR_PATH = 'M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.6 6.1 20.6l1.2-6.5L2.5 9.5l6.6-.9z';

function smallStars(n) {
  let out = '';
  for (let i = 1; i <= 5; i++) {
    out += `<svg viewBox="0 0 24 24" class="${i <= n ? 'on' : 'off'}"
      fill="${i <= n ? '#E4C48E' : 'none'}" stroke="${i <= n ? '#E4C48E' : '#9BC1FF'}"
      stroke-width="1"><path d="${STAR_PATH}"/></svg>`;
  }
  return out;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Repaints the count, average and list from what's stored. */
function renderReviews() {
  const list = loadReviews();
  const countEl = document.getElementById('rv-count');
  const avgEl = document.getElementById('rv-average');
  const blurbEl = document.getElementById('rv-blurb');
  const listEl = document.getElementById('rv-list');
  if (!countEl) return list;

  countEl.textContent = String(list.length);

  if (!list.length) {
    if (avgEl) avgEl.hidden = true;
    if (listEl) listEl.innerHTML = '';
    if (blurbEl) {
      blurbEl.textContent = "No reviews yet. We'd rather show you a real one than " +
        'borrow a logo wall — the first review here will be earned. Swipe the stars.';
    }
    return list;
  }

  const avg = list.reduce((s, r) => s + r.rating, 0) / list.length;
  if (avgEl) {
    avgEl.hidden = false;
    avgEl.innerHTML = `<span class="rv-avg-num">${avg.toFixed(1)}</span>
      <span class="rv-avg-stars">${smallStars(Math.round(avg))}</span>
      <span class="rv-avg-of">out of five</span>`;
  }
  if (blurbEl) {
    blurbEl.textContent = list.length === 1
      ? 'One review so far — thank you for being first.'
      : `${list.length} reviews and counting.`;
  }
  if (listEl) {
    listEl.innerHTML = list.slice(0, 6).map((r) => `
      <figure class="rv-item">
        <div class="rv-item-stars">${smallStars(r.rating)}</div>
        <blockquote>${escapeHtml(r.comment)}</blockquote>
        <figcaption>${r.site ? escapeHtml(r.site) : 'Anonymous'} · ${escapeHtml(r.date)}</figcaption>
      </figure>`).join('');
  }
  return list;
}

/* ---------------------------------------------------------------- sound --- */
let audioCtx = null;
const ctx = () => {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
};

function noiseBuffer(ac, seconds) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  // brownish noise — closer to a crowd than white noise, which hisses
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}

/** Champagne-cork pop for a normal submission. */
function popSound() {
  const ac = ctx();
  if (!ac) return;
  const t = ac.currentTime;

  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(880, t);
  osc.frequency.exponentialRampToValueAtTime(170, t + 0.09);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.45, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  osc.connect(g).connect(ac.destination);
  osc.start(t); osc.stop(t + 0.22);

  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.3);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 2500; bp.Q.value = 0.7;
  const ng = ac.createGain();
  ng.gain.setValueAtTime(0.25, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  src.connect(bp).connect(ng).connect(ac.destination);
  src.start(t + 0.004);
}

/**
 * Stadium roar for a five-star review.
 * A crowd is essentially filtered noise with a slow swell and a lot of random
 * movement on top, so it's built from three noise layers plus whistles.
 */
function stadiumCheer() {
  const ac = ctx();
  if (!ac) return;
  const t = ac.currentTime;
  const DUR = 4.2;

  const master = ac.createGain();
  master.gain.value = 0.9;
  master.connect(ac.destination);

  // --- body of the crowd: broad, warm, swelling
  const body = ac.createBufferSource();
  body.buffer = noiseBuffer(ac, DUR);
  const bodyFilter = ac.createBiquadFilter();
  bodyFilter.type = 'bandpass';
  bodyFilter.frequency.setValueAtTime(400, t);
  bodyFilter.frequency.linearRampToValueAtTime(900, t + 0.7);
  bodyFilter.frequency.linearRampToValueAtTime(500, t + DUR);
  bodyFilter.Q.value = 0.55;
  const bodyGain = ac.createGain();
  bodyGain.gain.setValueAtTime(0.0001, t);
  bodyGain.gain.exponentialRampToValueAtTime(0.55, t + 0.55);   // rush in
  bodyGain.gain.setValueAtTime(0.55, t + 1.5);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + DUR);  // die away
  body.connect(bodyFilter).connect(bodyGain).connect(master);
  body.start(t); body.stop(t + DUR);

  // --- brighter layer: the edge that makes it read as voices, not wind
  const air = ac.createBufferSource();
  air.buffer = noiseBuffer(ac, DUR);
  const airFilter = ac.createBiquadFilter();
  airFilter.type = 'bandpass';
  airFilter.frequency.value = 1800;
  airFilter.Q.value = 0.9;
  const airGain = ac.createGain();
  airGain.gain.setValueAtTime(0.0001, t);
  airGain.gain.exponentialRampToValueAtTime(0.3, t + 0.7);
  airGain.gain.exponentialRampToValueAtTime(0.0001, t + DUR * 0.95);
  air.connect(airFilter).connect(airGain).connect(master);
  air.start(t); air.stop(t + DUR);

  // --- surge: slow random swell so the roar breathes instead of sitting flat
  const surge = ac.createOscillator();
  const surgeGain = ac.createGain();
  surge.type = 'sine';
  surge.frequency.value = 0.7;
  surgeGain.gain.value = 0.18;
  surge.connect(surgeGain).connect(bodyGain.gain);
  surge.start(t); surge.stop(t + DUR);

  // --- claps: sharp transients scattered through the first couple of seconds
  for (let i = 0; i < 26; i++) {
    const when = t + 0.15 + Math.random() * 2.4;
    const clap = ac.createBufferSource();
    clap.buffer = noiseBuffer(ac, 0.06);
    const cf = ac.createBiquadFilter();
    cf.type = 'highpass'; cf.frequency.value = 1200;
    const cg = ac.createGain();
    cg.gain.setValueAtTime(0.12 + Math.random() * 0.12, when);
    cg.gain.exponentialRampToValueAtTime(0.0001, when + 0.07);
    clap.connect(cf).connect(cg).connect(master);
    clap.start(when); clap.stop(when + 0.08);
  }

  // --- whistles: two or three rising pitches over the top
  for (let i = 0; i < 3; i++) {
    const when = t + 0.5 + Math.random() * 1.8;
    const w = ac.createOscillator();
    const wg = ac.createGain();
    w.type = 'sine';
    const base = 1900 + Math.random() * 700;
    w.frequency.setValueAtTime(base, when);
    w.frequency.linearRampToValueAtTime(base + 380, when + 0.18);
    w.frequency.linearRampToValueAtTime(base + 120, when + 0.42);
    wg.gain.setValueAtTime(0.0001, when);
    wg.gain.exponentialRampToValueAtTime(0.07, when + 0.06);
    wg.gain.exponentialRampToValueAtTime(0.0001, when + 0.5);
    w.connect(wg).connect(master);
    w.start(when); w.stop(when + 0.55);
  }
}

/** Rising sparkle for a four-star rating. */
function chime() {
  const ac = ctx();
  if (!ac) return;
  const t = ac.currentTime;
  [1046.5, 1318.5, 1568.0].forEach((f, i) => {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    const s = t + i * 0.055;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.16, s + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.3);
    o.connect(g).connect(ac.destination);
    o.start(s); o.stop(s + 0.34);
  });
}

/** Soft tick as the rating moves under the pointer. */
function tick(level) {
  const ac = ctx();
  if (!ac) return;
  const t = ac.currentTime;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'sine';
  o.frequency.value = 420 + level * 110;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.06, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  o.connect(g).connect(ac.destination);
  o.start(t); o.stop(t + 0.1);
}

/* ------------------------------------------------------------- particles --- */
const canvas = document.getElementById('confetti-canvas');
const c2d = canvas ? canvas.getContext('2d') : null;
let parts = [];
let rings = [];
let rafId = 0;

function sizeCanvas() {
  if (!canvas) return;
  const d = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * d;
  canvas.height = window.innerHeight * d;
  c2d.setTransform(d, 0, 0, d, 0, 0);
}
if (canvas) { sizeCanvas(); window.addEventListener('resize', sizeCanvas); }

const COLORS = ['#E4C48E', '#F6E3C0', '#9BC1FF', '#5227FF', '#FFFFFF'];

function spawnConfetti(x, y, count) {
  for (let i = 0; i < count; i++) {
    const a = (-Math.PI / 2) + (Math.random() - 0.5) * 2.1;
    const sp = 6 + Math.random() * 13;
    parts.push({
      kind: 'confetti', x, y,
      vx: Math.cos(a) * sp * (0.7 + Math.random() * 0.7),
      vy: Math.sin(a) * sp,
      w: 5 + Math.random() * 7, h: 8 + Math.random() * 9,
      rot: Math.random() * Math.PI * 2, vrot: (Math.random() - 0.5) * 0.4,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      life: 1, decay: 0.006 + Math.random() * 0.006,
      round: Math.random() < 0.25
    });
  }
}

function spawnSparks(x, y, count, spread = 26) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1.5 + Math.random() * 4.5;
    parts.push({
      kind: 'spark',
      x: x + (Math.random() - 0.5) * spread,
      y: y + (Math.random() - 0.5) * spread,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2,
      r: 1 + Math.random() * 2.4,
      color: Math.random() < 0.7 ? '#E4C48E' : '#FFFFFF',
      life: 1, decay: 0.02 + Math.random() * 0.025
    });
  }
}

/** Expanding gold ring — the "shockwave" that lands with the roar. */
function spawnRing(x, y, opts = {}) {
  rings.push({
    x, y, r: opts.r0 || 10,
    grow: opts.grow || 9,
    life: 1, decay: opts.decay || 0.018,
    width: opts.width || 3,
    color: opts.color || '#E4C48E'
  });
}

function frame() {
  if (!c2d) return;
  c2d.clearRect(0, 0, window.innerWidth, window.innerHeight);

  for (let i = rings.length - 1; i >= 0; i--) {
    const g = rings[i];
    g.r += g.grow;
    g.grow *= 0.97;
    g.life -= g.decay;
    if (g.life <= 0) { rings.splice(i, 1); continue; }
    c2d.save();
    c2d.globalAlpha = Math.max(0, g.life) * 0.55;
    c2d.strokeStyle = g.color;
    c2d.lineWidth = g.width * g.life;
    c2d.shadowColor = g.color;
    c2d.shadowBlur = 22;
    c2d.beginPath();
    c2d.arc(g.x, g.y, g.r, 0, Math.PI * 2);
    c2d.stroke();
    c2d.restore();
  }

  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= p.decay;
    if (p.life <= 0 || p.y > window.innerHeight + 80) { parts.splice(i, 1); continue; }

    if (p.kind === 'confetti') {
      p.vy += 0.34;
      p.vx *= 0.995;
      p.x += p.vx; p.y += p.vy;
      p.rot += p.vrot;
      c2d.save();
      c2d.globalAlpha = Math.min(1, p.life * 1.5);
      c2d.translate(p.x, p.y);
      c2d.rotate(p.rot);
      c2d.fillStyle = p.color;
      if (p.round) {
        c2d.beginPath(); c2d.arc(0, 0, p.w / 2, 0, Math.PI * 2); c2d.fill();
      } else {
        c2d.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 1.4)));
      }
      c2d.restore();
    } else {
      p.vy += 0.07;
      p.x += p.vx; p.y += p.vy;
      c2d.save();
      c2d.globalAlpha = Math.max(0, p.life);
      c2d.fillStyle = p.color;
      c2d.shadowColor = p.color;
      c2d.shadowBlur = 10;
      c2d.beginPath(); c2d.arc(p.x, p.y, p.r, 0, Math.PI * 2); c2d.fill();
      c2d.restore();
    }
  }

  if (parts.length || rings.length) {
    rafId = requestAnimationFrame(frame);
  } else {
    rafId = 0;
    canvas.classList.remove('on');
  }
}

function runParticles() {
  if (!canvas) return;
  canvas.classList.add('on');
  if (!rafId) rafId = requestAnimationFrame(frame);
}

/** Warm full-screen flash, used with the five-star roar. */
function goldFlash() {
  const el = document.getElementById('gold-flash');
  if (!el || REDUCED) return;
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
  setTimeout(() => el.classList.remove('on'), 1400);
}

function celebrate(fromEl, rating) {
  if (!canvas) return;
  const r = fromEl ? fromEl.getBoundingClientRect() : null;
  const x = r ? r.left + r.width / 2 : window.innerWidth / 2;
  const y = r ? r.top + r.height / 2 : window.innerHeight / 2;

  const big = rating >= 5;
  const n = REDUCED ? 40 : (big ? 260 : 150);
  spawnConfetti(x, y, n);
  setTimeout(() => spawnConfetti(x - 150, y + 20, Math.round(n * 0.45)), 110);
  setTimeout(() => spawnConfetti(x + 150, y + 20, Math.round(n * 0.45)), 190);

  if (big) {
    spawnRing(x, y, { grow: 13, decay: 0.014, width: 4 });
    setTimeout(() => spawnRing(x, y, { grow: 10, decay: 0.017, width: 3, color: '#F6E3C0' }), 160);
    setTimeout(() => spawnRing(x, y, { grow: 8, decay: 0.02, width: 2, color: '#9BC1FF' }), 320);
    goldFlash();
    stadiumCheer();
  } else {
    spawnRing(x, y);
    popSound();
  }
  runParticles();
}

/* ----------------------------------------------------------- star rating --- */
function starMarkup(i) {
  return `<span class="star" data-i="${i}">
    <svg class="s-off" viewBox="0 0 24 24" fill="none" stroke="#9BC1FF" stroke-width="1"><path d="${STAR_PATH}"/></svg>
    <svg class="s-on" viewBox="0 0 24 24" fill="#E4C48E" stroke="#E4C48E" stroke-width="1"><path d="${STAR_PATH}"/></svg>
  </span>`;
}

const LABELS = {
  0: 'Swipe to rate',
  1: 'Rough — tell us what went wrong',
  2: 'Below par',
  3: 'Solid',
  4: 'Really good',
  5: 'The best kind of review'
};

/**
 * Swipeable rating control with per-star spring physics.
 *
 * Each star keeps its own scale/lift/rotation and eases toward a target every
 * frame, with the pull falling off by distance from the pointer. That gives the
 * row a soft magnetic feel rather than snapping between discrete states.
 */
function makeRating(el, { onCommit, labelEl } = {}) {
  if (!el || el.dataset.wired) return null;
  el.dataset.wired = '1';
  el.classList.add('interactive');
  el.innerHTML = [1, 2, 3, 4, 5].map(starMarkup).join('') + '<i class="glow"></i>';
  el.setAttribute('role', 'slider');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', 'Rating out of five');
  el.setAttribute('aria-valuemin', '1');
  el.setAttribute('aria-valuemax', '5');

  const stars = [...el.querySelectorAll('.star')];
  const state = stars.map(() => ({ s: 1, ts: 1, r: 0, tr: 0, y: 0, ty: 0 }));
  let value = 0, shown = 0, dragging = false, pointerX = null, raf = 0, settled = true;

  const setTargets = () => {
    stars.forEach((star, i) => {
      const st = state[i];
      const lit = i < shown;
      let pull = 0;
      if (pointerX !== null) {
        const r = star.getBoundingClientRect();
        const d = Math.abs(pointerX - (r.left + r.width / 2));
        pull = Math.max(0, 1 - d / 110);        // magnetic falloff
      }
      st.ts = (lit ? 1.18 : 1) + pull * 0.22;
      st.tr = lit ? -5 : 0;
      st.tr += pull * (pointerX !== null ? 4 : 0);
      st.ty = lit ? -4 : 0;
      st.ty -= pull * 5;
    });
  };

  const tickAnim = () => {
    let moving = false;
    stars.forEach((star, i) => {
      const st = state[i];
      st.s += (st.ts - st.s) * 0.18;
      st.r += (st.tr - st.r) * 0.16;
      st.y += (st.ty - st.y) * 0.18;
      if (Math.abs(st.ts - st.s) > 0.002 || Math.abs(st.tr - st.r) > 0.05 ||
          Math.abs(st.ty - st.y) > 0.05) moving = true;
      star.style.transform =
        `translate3d(0,${st.y.toFixed(2)}px,0) scale(${st.s.toFixed(3)}) rotate(${st.r.toFixed(2)}deg)`;
    });
    if (moving || !settled) raf = requestAnimationFrame(tickAnim);
    else raf = 0;
  };
  const kick = () => { settled = false; if (!raf) raf = requestAnimationFrame(tickAnim); setTimeout(() => { settled = true; }, 60); };

  const paint = (n) => {
    shown = n;
    stars.forEach((s, i) => s.classList.toggle('lit', i < n));
    el.classList.toggle('rave', n >= 4);
    el.classList.toggle('rave-max', n >= 5);
    if (labelEl) {
      labelEl.textContent = LABELS[n] || LABELS[0];
      labelEl.classList.toggle('hot', n >= 4);
    }
    el.setAttribute('aria-valuenow', String(n));
    setTargets();
    kick();
  };

  const fromX = (clientX) => {
    const r = el.getBoundingClientRect();
    return Math.max(1, Math.min(5, Math.ceil(((clientX - r.left) / r.width) * 5)));
  };

  const preview = (n) => { if (n !== shown) { paint(n); if (!REDUCED) tick(n); } };

  const commit = (n) => {
    value = n;
    paint(n);
    if (n >= 4) {
      chime();
      stars.slice(0, n).forEach((s, i) => setTimeout(() => {
        const r = s.getBoundingClientRect();
        spawnSparks(r.left + r.width / 2, r.top + r.height / 2, REDUCED ? 4 : 18);
        runParticles();
      }, i * 70));
      if (n >= 5) {
        const r = el.getBoundingClientRect();
        spawnRing(r.left + r.width / 2, r.top + r.height / 2, { grow: 11, decay: 0.016, width: 3 });
        runParticles();
      }
    } else {
      tick(n);
    }
    if (onCommit) onCommit(n);
  };

  el.addEventListener('pointermove', (e) => {
    pointerX = e.clientX;
    if (e.pointerType === 'mouse' || dragging) preview(fromX(e.clientX));
    else { setTargets(); kick(); }
  });
  el.addEventListener('pointerdown', (e) => {
    dragging = true; pointerX = e.clientX;
    el.setPointerCapture(e.pointerId);
    preview(fromX(e.clientX));
  });
  el.addEventListener('pointerup', (e) => {
    dragging = false;
    try { el.releasePointerCapture(e.pointerId); } catch (_) {}
    commit(fromX(e.clientX));
  });
  el.addEventListener('pointerleave', () => {
    pointerX = null;
    if (!dragging) paint(value);
    else { setTargets(); kick(); }
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); commit(Math.min(5, (value || 0) + 1)); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); commit(Math.max(1, (value || 1) - 1)); }
    else if (/^[1-5]$/.test(e.key)) { e.preventDefault(); commit(+e.key); }
  });

  paint(0);
  return { get value() { return value; }, set: commit };
}

/* ------------------------------------------------------------ the modal --- */
const modal = document.getElementById('review-modal');
const panelBody = document.getElementById('rv-body');
const doneBox = document.getElementById('rv-done');
const siteInput = document.getElementById('rv-site');
const commentInput = document.getElementById('rv-comment');
const errorEl = document.getElementById('rv-error');
const submitBtn = document.getElementById('rv-submit');
const labelEl = document.getElementById('rv-rating-label');

let modalRating = null;
let lastOpener = null;

function openModal(preset) {
  if (!modal) return;
  modal.classList.add('on');
  modal.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
  if (preset && modalRating) modalRating.set(preset);
  setTimeout(() => commentInput.focus({ preventScroll: true }), 420);
}

function closeModal() {
  if (!modal) return;
  modal.classList.remove('on');
  document.body.style.overflow = '';
  setTimeout(() => {
    modal.setAttribute('hidden', '');
    // reset for the next visitor
    panelBody.hidden = false;
    doneBox.hidden = true;
    commentInput.value = '';
    siteInput.value = '';
    errorEl.hidden = true;
  }, 420);
  if (lastOpener) lastOpener.focus({ preventScroll: true });
}

function showError(msg) {
  if (!errorEl) return;
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

function submit() {
  const rating = modalRating ? modalRating.value : 0;
  const comment = (commentInput.value || '').trim();
  const site = (siteInput.value || '').trim();

  if (!rating) { showError('Pick a star rating first — swipe across the stars.'); return; }
  if (comment.length < 3) { showError('Add a line or two about how it went.'); return; }
  errorEl.hidden = true;

  const date = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  saveReview({ rating, site, comment, date });
  renderReviews();

  const subject = `Novera review — ${rating} star${rating === 1 ? '' : 's'}`;
  const body = `Rating: ${rating}/5\nWebsite: ${site || '(not given)'}\n\n${comment}\n`;
  const href = `mailto:${MAILTO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  celebrate(submitBtn, rating);

  panelBody.hidden = true;
  doneBox.hidden = false;
  const msg = document.getElementById('rv-done-msg');
  if (msg) {
    msg.textContent = rating >= 5
      ? 'Five stars. That is the whole stadium on its feet — thank you. Your mail app should be opening with the review ready to send.'
      : rating === 4
        ? 'Four stars — that genuinely makes our week. Your mail app should be opening with the review ready to send.'
        : 'Thanks for being straight with us. Your mail app should be opening with the review ready to send.';
  }

  const mailBtn = document.getElementById('rv-mailto');
  if (mailBtn) mailBtn.href = href;

  const copyBtn = document.getElementById('rv-copy');
  if (copyBtn) {
    copyBtn.onclick = async () => {
      const text = `${subject}\n\n${body}`;
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.querySelector('span').textContent = 'Copied';
      } catch (_) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); copyBtn.querySelector('span').textContent = 'Copied'; }
        catch (e) { copyBtn.querySelector('span').textContent = 'Press Ctrl+C'; }
        setTimeout(() => ta.remove(), 400);
      }
      setTimeout(() => { copyBtn.querySelector('span').textContent = 'Copy the review'; }, 2600);
    };
  }

  setTimeout(() => { window.location.href = href; }, 900);
}

/* ------------------------------------------------------------------ wire --- */
renderReviews();

if (modal) {
  modalRating = makeRating(document.getElementById('rv-stars'), { labelEl });

  const secStars = document.getElementById('section-stars');
  if (secStars) {
    makeRating(secStars, {
      onCommit: (n) => {
        lastOpener = secStars;
        setTimeout(() => openModal(n), 520);
      }
    });
    secStars.setAttribute('aria-label', 'Rate Novera out of five');
  }

  document.querySelectorAll('[data-review-open]').forEach((b) => {
    b.addEventListener('click', () => { lastOpener = b; openModal(); });
  });

  document.getElementById('rv-close').addEventListener('click', closeModal);
  document.getElementById('rv-done-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('on')) closeModal();
  });
  submitBtn.addEventListener('click', submit);
  [siteInput, commentInput].forEach((el) =>
    el.addEventListener('input', () => { errorEl.hidden = true; }));
}
