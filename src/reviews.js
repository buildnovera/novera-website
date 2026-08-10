/* ============================================================================
   NOVERA — reviews
   ----------------------------------------------------------------------------
   · a star row you can swipe/drag to rate, with a bigger reaction at 4–5
   · a two-field submission panel (website + comment)
   · confetti burst and a synthesised pop on submit
   Confetti and sound are generated here — no libraries, no audio files.
   ========================================================================== */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MAILTO = 'buildnovera@gmail.com';

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

/** Champagne-cork pop: a fast descending body plus a short burst of fizz. */
function popSound() {
  const ac = ctx();
  if (!ac) return;
  const t = ac.currentTime;

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(880, t);
  osc.frequency.exponentialRampToValueAtTime(170, t + 0.09);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.45, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.22);

  const len = Math.floor(ac.sampleRate * 0.3);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  const noise = ac.createBufferSource();
  noise.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2500;
  bp.Q.value = 0.7;
  const ng = ac.createGain();
  ng.gain.value = 0.2;
  noise.connect(bp).connect(ng).connect(ac.destination);
  noise.start(t + 0.004);
}

/** Short ascending sparkle, used when a rating lands on 4 or 5. */
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
    o.start(s);
    o.stop(s + 0.34);
  });
}

/** Soft tick as the rating changes under the pointer. */
function tick(level) {
  const ac = ctx();
  if (!ac) return;
  const t = ac.currentTime;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'sine';
  o.frequency.value = 420 + level * 110;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.07, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + 0.1);
}

/* ------------------------------------------------------------- particles --- */
const canvas = document.getElementById('confetti-canvas');
const c2d = canvas ? canvas.getContext('2d') : null;
let parts = [];
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
      kind: 'confetti',
      x, y,
      vx: Math.cos(a) * sp * (0.7 + Math.random() * 0.7),
      vy: Math.sin(a) * sp,
      w: 5 + Math.random() * 7,
      h: 8 + Math.random() * 9,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.4,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      life: 1,
      decay: 0.006 + Math.random() * 0.006,
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
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 1.2,
      r: 1 + Math.random() * 2.4,
      color: Math.random() < 0.7 ? '#E4C48E' : '#FFFFFF',
      life: 1,
      decay: 0.02 + Math.random() * 0.025
    });
  }
}

function frame() {
  if (!c2d) return;
  c2d.clearRect(0, 0, window.innerWidth, window.innerHeight);

  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= p.decay;
    if (p.life <= 0 || p.y > window.innerHeight + 80) { parts.splice(i, 1); continue; }

    if (p.kind === 'confetti') {
      p.vy += 0.34;            // gravity
      p.vx *= 0.995;           // air drag
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      c2d.save();
      c2d.globalAlpha = Math.min(1, p.life * 1.5);
      c2d.translate(p.x, p.y);
      c2d.rotate(p.rot);
      c2d.fillStyle = p.color;
      if (p.round) {
        c2d.beginPath();
        c2d.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        c2d.fill();
      } else {
        // squash on rotation so the pieces read as tumbling foil
        c2d.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 1.4)));
      }
      c2d.restore();
    } else {
      p.vy += 0.07;
      p.x += p.vx;
      p.y += p.vy;
      c2d.save();
      c2d.globalAlpha = Math.max(0, p.life);
      c2d.fillStyle = p.color;
      c2d.shadowColor = p.color;
      c2d.shadowBlur = 10;
      c2d.beginPath();
      c2d.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      c2d.fill();
      c2d.restore();
    }
  }

  if (parts.length) {
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

function celebrate(fromEl) {
  if (!canvas) return;
  const r = fromEl ? fromEl.getBoundingClientRect() : null;
  const x = r ? r.left + r.width / 2 : window.innerWidth / 2;
  const y = r ? r.top + r.height / 2 : window.innerHeight / 2;
  const n = REDUCED ? 40 : 150;
  spawnConfetti(x, y, n);
  // a couple of offset bursts so it fills the frame rather than one jet
  setTimeout(() => spawnConfetti(x - 150, y + 20, Math.round(n * 0.45)), 110);
  setTimeout(() => spawnConfetti(x + 150, y + 20, Math.round(n * 0.45)), 190);
  runParticles();
  popSound();
}

/* ----------------------------------------------------------- star rating --- */
const STAR_PATH = 'M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.6 6.1 20.6l1.2-6.5L2.5 9.5l6.6-.9z';

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
 * Turns a .stars element into a swipeable rating control.
 * onCommit fires when the user settles on a value.
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
  let value = 0, shown = -1, dragging = false;

  const paint = (n, { pop = false } = {}) => {
    if (n === shown && !pop) return;
    shown = n;
    stars.forEach((s, i) => {
      const lit = i < n;
      s.classList.toggle('lit', lit);
      if (pop && lit) {
        s.classList.remove('pop');
        void s.offsetWidth;              // restart the animation
        s.style.animationDelay = (i * 55) + 'ms';
        s.classList.add('pop');
      }
    });
    el.classList.toggle('rave', n >= 4);
    if (labelEl) {
      labelEl.textContent = LABELS[n] || LABELS[0];
      labelEl.classList.toggle('hot', n >= 4);
    }
    el.setAttribute('aria-valuenow', String(n));
  };

  const fromX = (clientX) => {
    const r = el.getBoundingClientRect();
    const p = (clientX - r.left) / r.width;
    return Math.max(1, Math.min(5, Math.ceil(p * 5)));
  };

  const preview = (n) => { if (n !== shown) { paint(n); if (!REDUCED) tick(n); } };

  const commit = (n) => {
    value = n;
    paint(n, { pop: true });
    if (n >= 4) {
      // the bigger reaction: sparks off every lit star, plus a chime
      chime();
      stars.slice(0, n).forEach((s, i) => setTimeout(() => {
        const r = s.getBoundingClientRect();
        spawnSparks(r.left + r.width / 2, r.top + r.height / 2, REDUCED ? 4 : 16);
        runParticles();
      }, i * 70));
    } else {
      tick(n);
    }
    if (onCommit) onCommit(n);
  };

  el.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' && !dragging) preview(fromX(e.clientX));
    else if (dragging) preview(fromX(e.clientX));
  });
  el.addEventListener('pointerdown', (e) => {
    dragging = true;
    el.setPointerCapture(e.pointerId);
    preview(fromX(e.clientX));
  });
  el.addEventListener('pointerup', (e) => {
    dragging = false;
    try { el.releasePointerCapture(e.pointerId); } catch (_) {}
    commit(fromX(e.clientX));
  });
  el.addEventListener('pointerleave', () => { if (!dragging) paint(value); });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); commit(Math.min(5, (value || 0) + 1)); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); commit(Math.max(1, (value || 1) - 1)); }
    else if (/^[1-5]$/.test(e.key)) { e.preventDefault(); commit(+e.key); }
  });

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
let sectionRating = null;
let lastOpener = null;

function openModal(preset) {
  if (!modal) return;
  modal.classList.add('on');
  modal.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
  if (preset && modalRating) modalRating.set(preset);
  setTimeout(() => (preset ? commentInput : commentInput).focus({ preventScroll: true }), 420);
}

function closeModal() {
  if (!modal) return;
  modal.classList.remove('on');
  document.body.style.overflow = '';
  setTimeout(() => modal.setAttribute('hidden', ''), 420);
  if (lastOpener) lastOpener.focus({ preventScroll: true });
}

function submit() {
  const rating = modalRating ? modalRating.value : 0;
  const comment = (commentInput.value || '').trim();
  const site = (siteInput.value || '').trim();

  if (!rating) { showError('Pick a star rating first — swipe across the stars.'); return; }
  if (comment.length < 3) { showError('Add a line or two about how it went.'); return; }
  errorEl.hidden = true;

  // No backend on a static site, so the review is handed to the mail client.
  const subject = `Novera review — ${rating} star${rating === 1 ? '' : 's'}`;
  const body =
    `Rating: ${rating}/5\n` +
    `Website: ${site || '(not given)'}\n\n` +
    `${comment}\n`;
  const href = `mailto:${MAILTO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  celebrate(submitBtn);

  panelBody.hidden = true;
  doneBox.hidden = false;
  const msg = document.getElementById('rv-done-msg');
  if (msg) {
    msg.textContent = rating >= 4
      ? `${rating} stars — that genuinely makes our week. Your mail app should be opening with the review ready to send.`
      : 'Thanks for being straight with us. Your mail app should be opening with the review ready to send.';
  }

  // mailto can silently do nothing when no mail client is configured, so the
  // review is also offered as an explicit link and as copyable text.
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
        // clipboard blocked — fall back to selecting it for a manual copy
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

  // Fired from within the click handler so the browser treats it as a gesture.
  setTimeout(() => { window.location.href = href; }, 600);
}

function showError(msg) {
  if (!errorEl) return;
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

/* ------------------------------------------------------------------ wire --- */
if (modal) {
  modalRating = makeRating(document.getElementById('rv-stars'), { labelEl });

  // The stars in the reviews section are ratable too — swiping them opens the
  // panel with that rating already carried across.
  const secStars = document.querySelector('#reviews .stars');
  if (secStars) {
    sectionRating = makeRating(secStars, {
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
