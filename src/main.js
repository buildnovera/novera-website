import './voice.js';
import './reviews.js';

/* ============================================================================
   NOVERA — site behaviour
   ----------------------------------------------------------------------------
   1. Lightfall  — WebGL ambient shader
   2. Beams      — SVG light paths behind the reviews panel
   3. Interaction— anime.js driven entrance, reveals, tilt, magnetic buttons
   4. Voice      — see ./voice.js (shared with the booking page)
   ========================================================================== */

/* ============================================================================
   1. LIGHTFALL — ported to raw WebGL (no ogl dependency)
   ========================================================================== */
(function () {
  const host = document.getElementById('lightfall');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduce) {
    host.style.background =
      'radial-gradient(90% 60% at 50% 8%, rgba(82,39,255,.17), transparent 62%),' +
      'radial-gradient(70% 50% at 78% 22%, rgba(155,193,255,.08), transparent 60%)';
    host.classList.add('on');
    return;
  }

  const CFG = {
    colors: ['#9BC1FF', '#5227FF', '#E4C48E'],
    backgroundColor: '#0A1440',
    speed: 0.45,
    streakCount: 5,
    streakWidth: 1.0,
    streakLength: 1.15,
    glow: 0.5,
    density: 0.55,
    twinkle: 0.65,
    zoom: 3.2,
    backgroundGlow: 0.3,
    opacity: 0.7,
    mouseInteraction: true,
    mouseStrength: 0.7,
    mouseRadius: 0.9,
    mouseDampening: 0.15
  };

  const MAX_COLORS = 8;
  const hexToRGB = (hex) => {
    const c = hex.replace('#', '').padEnd(6, '0');
    return [
      parseInt(c.slice(0, 2), 16) / 255,
      parseInt(c.slice(2, 4), 16) / 255,
      parseInt(c.slice(4, 6), 16) / 255
    ];
  };
  const prepColors = (input) => {
    const base = input.slice(0, MAX_COLORS);
    const arr = [];
    for (let i = 0; i < MAX_COLORS; i++) arr.push(hexToRGB(base[Math.min(i, base.length - 1)]));
    const avg = [0, 0, 0];
    for (let i = 0; i < base.length; i++) { avg[0] += arr[i][0]; avg[1] += arr[i][1]; avg[2] += arr[i][2]; }
    avg[0] /= base.length; avg[1] /= base.length; avg[2] /= base.length;
    return { arr, count: base.length, avg };
  };

  const VERT = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }`;

  const FRAG = `
precision highp float;
uniform vec3 iResolution;
uniform vec2 iMouse;
uniform float iTime;
uniform vec3 uColor0; uniform vec3 uColor1; uniform vec3 uColor2; uniform vec3 uColor3;
uniform vec3 uColor4; uniform vec3 uColor5; uniform vec3 uColor6; uniform vec3 uColor7;
uniform int uColorCount;
uniform vec3 uBgColor;
uniform vec3 uMouseColor;
uniform float uSpeed;
uniform int uStreakCount;
uniform float uStreakWidth;
uniform float uStreakLength;
uniform float uGlow;
uniform float uDensity;
uniform float uTwinkle;
uniform float uZoom;
uniform float uBgGlow;
uniform float uOpacity;
uniform float uMouseEnabled;
uniform float uMouseStrength;
uniform float uMouseRadius;
varying vec2 vUv;

vec3 palette(float h){
  int count = uColorCount;
  if (count < 1) count = 1;
  int idx = int(floor(clamp(h, 0.0, 0.999999) * float(count)));
  if (idx <= 0) return uColor0;
  if (idx == 1) return uColor1;
  if (idx == 2) return uColor2;
  if (idx == 3) return uColor3;
  if (idx == 4) return uColor4;
  if (idx == 5) return uColor5;
  if (idx == 6) return uColor6;
  return uColor7;
}
vec3 tanhv(vec3 x){ vec3 e = exp(-2.0 * x); return (1.0 - e) / (1.0 + e); }

vec2 sceneC(vec2 frag, vec2 r){
  vec2 P = (frag + frag - r) / r.x;
  float z = 0.0;
  float d = 1e3;
  vec4 O = vec4(0.0);
  for (int k = 0; k < 39; k++){
    if (d <= 1e-4) break;
    O = z * normalize(vec4(P, uZoom, 0.0)) - vec4(0.0, 4.0, 1.0, 0.0) / 4.5;
    d = 1.0 - sqrt(length(O * O));
    z += d;
  }
  return vec2(O.x, atan(O.z, O.y));
}

void mainImage(out vec4 o, vec2 C){
  vec2 r = iResolution.xy;
  vec2 uv0 = (C + C - r) / r.x;
  float T = 0.1 * iTime * uSpeed + 9.0;
  float angRings = max(1.0, floor(6.28318530718 * max(uDensity, 0.05) + 0.5));
  vec2 Y = vec2(5e-3, 6.28318530718 / angRings);

  vec2 c0 = sceneC(C, r);
  vec2 cdx = sceneC(C + vec2(1.0, 0.0), r);
  vec2 cdy = sceneC(C + vec2(0.0, 1.0), r);
  vec2 dCx = cdx - c0;
  vec2 dCy = cdy - c0;
  dCx.y -= 6.28318530718 * floor(dCx.y / 6.28318530718 + 0.5);
  dCy.y -= 6.28318530718 * floor(dCy.y / 6.28318530718 + 0.5);
  vec2 fw = abs(dCx) + abs(dCy);
  C = c0;

  vec2 P = vec2(2.0, 1.0) * uv0 - (r / r.x) * vec2(0.0, 1.0);
  vec4 O = vec4(uBgColor * 90.0 * uBgGlow / (1e3 * dot(P, P) + 6.0), 0.0);

  float mGlow = 0.0;
  if (uMouseEnabled > 0.5){
    vec2 mN = (iMouse + iMouse - r) / r.x;
    float md = length(uv0 - mN);
    mGlow = exp(-md * md / max(uMouseRadius * uMouseRadius, 1e-4)) * uMouseStrength;
    O.rgb += uMouseColor * mGlow * 0.25;
  }

  float zr = 5e-4 * uStreakWidth;
  vec2 rr = vec2(max(length(fw), 1e-5));
  float tail = 19.0 / max(uStreakLength, 0.05);

  for (int m = 0; m < 16; m++){
    if (m >= uStreakCount) break;
    float jf = float(m) + 1.0;
    float ic = fract(sin(dot(vec2(jf, floor(C.x / Y.x + 0.5)), vec2(7.0, 11.0)) * 73.0));
    vec2 Pp = C - (T + T * ic) * vec2(0.0, 1.0);
    Pp -= floor(Pp / Y + 0.5) * Y;
    float h = fract(8663.0 * ic);
    vec3 col = palette(h);
    float weight = mix(1.5, 1.0 + sin(T + 7.0 * h + 4.0), uTwinkle);
    weight *= (1.0 + mGlow * 2.0);
    vec2 inner = vec2(length(max(Pp, vec2(-1.0, 0.0))), length(Pp) - zr) - zr;
    vec2 sm = vec2(1.0) - smoothstep(-rr, rr, inner);
    O.rgb += dot(sm, vec2(exp(tail * Pp.y), 3.0)) * col * weight;
    C.x += Y.x / 8.0;
  }

  vec3 colr = sqrt(tanhv(max(O.rgb * uGlow - vec3(0.04, 0.08, 0.02), 0.0)));
  o = vec4(colr, uOpacity);
}
void main(){ vec4 c; mainImage(c, vUv * iResolution.xy); gl_FragColor = c; }`;

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false });
  if (!gl) {
    host.style.background = 'radial-gradient(90% 60% at 50% 8%, rgba(82,39,255,.16), transparent 62%)';
    host.classList.add('on');
    return;
  }
  host.appendChild(canvas);

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 0, 0,
     3, -1, 2, 0,
    -1,  3, 0, 2
  ]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'position');
  const aUv = gl.getAttribLocation(prog, 'uv');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(aUv);
  gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);

  const U = (n) => gl.getUniformLocation(prog, n);
  const { arr, count, avg } = prepColors(CFG.colors);
  for (let i = 0; i < MAX_COLORS; i++) gl.uniform3fv(U('uColor' + i), arr[i]);
  gl.uniform1i(U('uColorCount'), count);
  gl.uniform3fv(U('uBgColor'), hexToRGB(CFG.backgroundColor));
  gl.uniform3fv(U('uMouseColor'), avg);
  gl.uniform1f(U('uSpeed'), CFG.speed);
  gl.uniform1i(U('uStreakCount'), Math.max(1, Math.min(16, Math.round(CFG.streakCount))));
  gl.uniform1f(U('uStreakWidth'), CFG.streakWidth);
  gl.uniform1f(U('uStreakLength'), CFG.streakLength);
  gl.uniform1f(U('uGlow'), CFG.glow);
  gl.uniform1f(U('uDensity'), CFG.density);
  gl.uniform1f(U('uTwinkle'), CFG.twinkle);
  gl.uniform1f(U('uZoom'), CFG.zoom);
  gl.uniform1f(U('uBgGlow'), CFG.backgroundGlow);
  gl.uniform1f(U('uOpacity'), CFG.opacity);
  gl.uniform1f(U('uMouseEnabled'), CFG.mouseInteraction ? 1 : 0);
  gl.uniform1f(U('uMouseStrength'), CFG.mouseStrength);
  gl.uniform1f(U('uMouseRadius'), CFG.mouseRadius);
  const uRes = U('iResolution'), uMouse = U('iMouse'), uTime = U('iTime');

  const dpr = Math.min(window.devicePixelRatio || 1, 1.35);
  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform3f(uRes, canvas.width, canvas.height, 1);
  };
  resize();
  window.addEventListener('resize', resize);

  const target = [canvas.width * 0.5, canvas.height * 0.62];
  const cur = [target[0], target[1]];
  if (CFG.mouseInteraction) {
    window.addEventListener('pointermove', (e) => {
      target[0] = e.clientX * dpr;
      target[1] = (host.clientHeight - e.clientY) * dpr;
    }, { passive: true });
  }

  let last = 0, visible = true;
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; });

  const loop = (t) => {
    requestAnimationFrame(loop);
    if (!visible) return;
    if (!last) last = t;
    const dt = (t - last) / 1000; last = t;
    const f = Math.min(1, 1 - Math.exp(-dt / Math.max(1e-4, CFG.mouseDampening)));
    cur[0] += (target[0] - cur[0]) * f;
    cur[1] += (target[1] - cur[1]) * f;
    gl.uniform2f(uMouse, cur[0], cur[1]);
    gl.uniform1f(uTime, t * 0.001);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  requestAnimationFrame(loop);
  requestAnimationFrame(() => host.classList.add('on'));
})();


/* ============================================================================
   2. BACKGROUND BEAMS — plain SVG, travelling light via SMIL
   ========================================================================== */
(function () {
  const hosts = document.querySelectorAll('[data-beams]');
  if (!hosts.length) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const seg = (i) => {
    const x = 7 * i, y = -8 * i;
    return 'M' + (-380 + x) + ' ' + (-189 + y) +
           'C' + (-380 + x) + ' ' + (-189 + y) + ' ' + (-312 + x) + ' ' + (216 + y) + ' ' + (152 + x) + ' ' + (343 + y) +
           'C' + (616 + x) + ' ' + (470 + y) + ' ' + (684 + x) + ' ' + (875 + y) + ' ' + (684 + x) + ' ' + (875 + y);
  };

  const BEAMS = 51;
  const rnd = (a, b) => a + Math.random() * (b - a);

  let backdrop = '';
  for (let i = 0; i < 58; i++) backdrop += seg(i);

  let paths = '', defs = '';
  for (let i = 0; i < BEAMS; i++) {
    paths += '<path d="' + seg(i) + '" stroke="url(#nv-beam-' + i + ')" stroke-opacity="0.22" stroke-width="0.5" fill="none"/>';

    const dur = rnd(10, 20).toFixed(1) + 's';
    const begin = (-rnd(0, 10)).toFixed(1) + 's';
    const y2end = (93 + Math.random() * 8).toFixed(1) + '%';
    const anim = (name, from, to) =>
      '<animate attributeName="' + name + '" values="' + from + ';' + to + '" dur="' + dur +
      '" begin="' + begin + '" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="0.42 0 0.58 1"/>';

    defs += '<linearGradient id="nv-beam-' + i + '" x1="0%" x2="0%" y1="0%" y2="0%">' +
      (reduce ? '' : anim('x1', '0%', '100%') + anim('x2', '0%', '95%') + anim('y1', '0%', '100%') + anim('y2', '0%', y2end)) +
      '<stop stop-color="#9BC1FF" stop-opacity="0"/>' +
      '<stop stop-color="#9BC1FF"/>' +
      '<stop offset="32.5%" stop-color="#5227FF"/>' +
      '<stop offset="100%" stop-color="#E4C48E" stop-opacity="0"/>' +
      '</linearGradient>';
  }

  const svg =
    '<svg viewBox="0 0 696 316" preserveAspectRatio="xMidYMid slice" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="' + backdrop + '" stroke="url(#nv-beam-backdrop)" stroke-opacity="0.05" stroke-width="0.5" fill="none"/>' +
      paths +
      '<defs>' + defs +
        '<radialGradient id="nv-beam-backdrop" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" ' +
        'gradientTransform="translate(352 34) rotate(90) scale(555 1560.62)">' +
          '<stop offset="0.0666667" stop-color="#9BC1FF"/>' +
          '<stop offset="0.243243" stop-color="#9BC1FF"/>' +
          '<stop offset="0.43594" stop-color="#ffffff" stop-opacity="0"/>' +
        '</radialGradient>' +
      '</defs>' +
    '</svg>';

  hosts.forEach((host) => { host.innerHTML = svg; });
})();


/* ============================================================================
   3. INTERACTION LAYER — anime.js v4, with graceful no-library fallback
   ========================================================================== */
(async function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $$ = (s, r) => [].slice.call((r || document).querySelectorAll(s));

  const loadAnime = async () => {
    const withTimeout = (p, ms) =>
      Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
    try {
      return await withTimeout(import('https://cdn.jsdelivr.net/npm/animejs@4/+esm'), 2500);
    } catch (e) { /* fall through */ }
    try {
      await withTimeout(new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/animejs@4/dist/bundles/anime.umd.min.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      }), 2500);
      return window.anime || null;
    } catch (e) { return null; }
  };

  const A = reduce ? null : await loadAnime();
  const useAnime = !!(A && A.animate);
  if (useAnime) document.documentElement.classList.add('anime');

  const animate = useAnime ? A.animate : null;
  const createTimeline = useAnime ? A.createTimeline : null;
  const stagger = useAnime ? A.stagger : null;
  // anime v4.1 renamed createSpring() to spring(); support whichever we got.
  const createSpring = useAnime ? (A.spring || A.createSpring) : null;
  const onScroll = useAnime ? A.onScroll : null;
  const utils = useAnime ? A.utils : null;

  const springSoft = () => createSpring({ stiffness: 90, damping: 14, mass: 1 });
  const springSnap = () => createSpring({ stiffness: 140, damping: 12, mass: 1 });

  /* ---------- nav ---------- */
  const nav = document.getElementById('nav');
  const onScrollNav = () => nav.classList.toggle('stuck', window.scrollY > 40);
  onScrollNav();
  window.addEventListener('scroll', onScrollNav, { passive: true });

  /* ---------- hero entrance ---------- */
  const words = $$('#headline .w');

  if (useAnime) {
    createTimeline({ defaults: { duration: 900, ease: 'out(3)' } })
      .add('.hero .status', { opacity: [0, 1], y: [14, 0], duration: 800 }, 150)
      .add(words, { translateY: ['110%', '0%'], opacity: [0, 1], duration: 1100, ease: 'out(4)' }, stagger(70, { start: 260 }))
      .add('.mono-stack span', { opacity: [0, 1], duration: 1400, ease: 'out(2)' }, stagger(110, { start: 300 }))
      .add('.hero .lede', { opacity: [0, 1], y: [22, 0] }, '-=700')
      .add('.hero-cta', { opacity: [0, 1], y: [22, 0] }, '-=740')
      .add('.hero-meta', { opacity: [0, 1], y: [22, 0] }, '-=780');
  } else {
    words.forEach((w, i) => {
      w.style.transition = 'transform 1.1s cubic-bezier(.16,1,.3,1), opacity 1.1s cubic-bezier(.16,1,.3,1)';
      w.style.transitionDelay = (0.28 + i * 0.075) + 's';
    });
    requestAnimationFrame(() => words.forEach((w) => { w.style.transform = 'translateY(0)'; w.style.opacity = '1'; }));
  }

  /* ---------- nav wordmark: splitText bounce ---------- */
  const LOGO_LOOP = true;
  const LOGO_LIFT = '-1.1rem';
  const markEl = document.querySelector('.nav-mark b');

  if (useAnime && markEl) {
    markEl.setAttribute('aria-label', markEl.textContent.trim());

    const animateChars = (chars) => animate(chars, {
      y: [
        { to: LOGO_LIFT, ease: 'outExpo', duration: 600 },
        { to: 0, ease: 'outBounce', duration: 800, delay: 100 }
      ],
      rotate: { from: '-1turn', delay: 0 },
      delay: stagger(50),
      ease: 'inOutCirc',
      loopDelay: 1000,
      loop: LOGO_LOOP
    });

    setTimeout(() => {
      let charAnim = null;
      if (typeof A.splitText === 'function') {
        A.splitText(markEl, { words: false, chars: true })
          .addEffect(({ chars }) => (charAnim = animateChars(chars)));
      } else {
        const src = markEl.textContent;
        markEl.textContent = '';
        const chars = [].map.call(src, (ch) => {
          const s = document.createElement('span');
          s.textContent = ch;
          s.style.display = 'inline-block';
          markEl.appendChild(s);
          return s;
        });
        charAnim = animateChars(chars);
      }
      if (!LOGO_LOOP) {
        document.querySelector('.nav-mark')
          .addEventListener('pointerenter', () => { if (charAnim) charAnim.restart(); });
      }
    }, 800);
  }

  /* ---------- scroll reveals ---------- */
  // Driven by a plain IntersectionObserver whether or not anime.js loaded.
  // anime's onScroll() autoplay was leaving most of the page stuck at
  // opacity 0, which blanked every section below the hero.
  const revealables = $$('.reveal').filter((el) => !el.closest('.hero'));

  const revealNow = (el) => {
    el.classList.add('in');
    // Belt and braces: if a stylesheet ever fails, don't leave content hidden.
    el.style.opacity = '';
    el.style.transform = '';
  };

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { revealNow(e.target); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.04 });
    revealables.forEach((el) => io.observe(el));
  } else {
    revealables.forEach(revealNow);
  }

  // Final guarantee: anything still hidden after 3s becomes visible.
  setTimeout(() => revealables.forEach((el) => {
    if (parseFloat(getComputedStyle(el).opacity) < 0.05) revealNow(el);
  }), 3000);

  // Entrance for the rating stars. This animates the .star wrappers, not the
  // SVGs inside them — the SVG opacities are what mark a star lit or unlit, so
  // writing inline opacity onto them would break the rating display.
  const starsEl = document.querySelector('.stars');
  if (useAnime && starsEl) {
    const sio = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        sio.disconnect();
        animate('.stars .star', {
          opacity: [0, 1], scale: [0.7, 1], rotate: [-18, 0],
          duration: 900, ease: 'out(3)', delay: stagger(90)
        });
      });
    }, { threshold: 0.3 });
    sio.observe(starsEl);
  }

  /* ---------- call demo: waveform + transcript + SMS ---------- */
  const wave = document.getElementById('wave');
  const script = document.getElementById('script');
  const lines = script ? $$('.line', script) : [];
  const bubbles = $$('#sms .bubble');
  const ctx = wave ? wave.getContext('2d') : null;
  let speaker = 0, playing = false;

  const sizeWave = () => {
    if (!wave) return;
    const r = wave.getBoundingClientRect();
    const d = Math.min(window.devicePixelRatio || 1, 2);
    wave.width = r.width * d; wave.height = r.height * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
  };
  if (wave) { sizeWave(); window.addEventListener('resize', sizeWave); }

  const drawWave = (t) => {
    if (!ctx) return;
    const w = wave.clientWidth, h = wave.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const bars = Math.floor(w / 7);
    for (let i = 0; i < bars; i++) {
      const p = i / bars;
      const env = playing ? Math.sin(p * Math.PI) : 0.18;
      const a = Math.abs(Math.sin(t * 0.004 + i * 0.42) * Math.sin(t * 0.0017 + i * 0.13));
      const amp = (h * 0.42) * env * (0.25 + a * 0.9);
      ctx.fillStyle = speaker === 0 ? 'rgba(228,196,142,.75)' : 'rgba(155,193,255,.7)';
      ctx.fillRect(i * 7 + 2, h / 2 - amp / 2, 3, Math.max(2, amp));
    }
    requestAnimationFrame(drawWave);
  };
  if (ctx) requestAnimationFrame(drawWave);

  let callTl = null, fallbackTimers = [];

  if (useAnime && lines.length) {
    callTl = createTimeline({
      autoplay: false,
      defaults: { duration: 620, ease: 'out(3)' },
      onBegin: () => { playing = true; },
      onComplete: () => { playing = false; }
    });
    lines.forEach((l, i) => {
      callTl.add(l, {
        opacity: [0, 1], y: [10, 0],
        onBegin: () => { speaker = l.classList.contains('caller') ? 1 : 0; }
      }, i === 0 ? 400 : '+=800');
    });
    bubbles.forEach((b, i) => {
      callTl.add(b, { opacity: [0, 1], y: [12, 0], scale: [0.96, 1], ease: springSnap() },
        i === 0 ? '+=900' : '+=800');
    });
  }

  const play = () => {
    if (useAnime && callTl) { callTl.restart(); return; }
    fallbackTimers.forEach(clearTimeout); fallbackTimers = [];
    lines.forEach((l) => l.classList.remove('in'));
    bubbles.forEach((b) => b.classList.remove('show'));
    playing = true;
    lines.forEach((l, i) => {
      fallbackTimers.push(setTimeout(() => {
        l.classList.add('in');
        speaker = l.classList.contains('caller') ? 1 : 0;
      }, 500 + i * 1400));
    });
    const end = 500 + lines.length * 1400;
    bubbles.forEach((b, i) => fallbackTimers.push(setTimeout(() => b.classList.add('show'), end + 700 + i * 1100)));
    fallbackTimers.push(setTimeout(() => { playing = false; }, end + 900));
  };

  const replayBtn = document.getElementById('replay');
  if (replayBtn) replayBtn.addEventListener('click', play);
  if (script) {
    const dio = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { play(); dio.disconnect(); } });
    }, { threshold: 0.35 });
    dio.observe(script);
  }

  if (reduce) return;

  /* ---------- cursor orb ---------- */
  const orb = document.getElementById('orb');
  const o = { x: innerWidth / 2, y: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2 };
  window.addEventListener('pointermove', (e) => { o.tx = e.clientX; o.ty = e.clientY; }, { passive: true });
  $$('a, button, .card').forEach((el) => {
    el.addEventListener('pointerenter', () => orb.classList.add('wide'));
    el.addEventListener('pointerleave', () => orb.classList.remove('wide'));
  });

  /* ---------- magnetic buttons ---------- */
  $$('.magnetic').forEach((el) => {
    let raf = 0, tx = 0, ty = 0, x = 0, y = 0;
    const follow = () => {
      x += (tx - x) * 0.18; y += (ty - y) * 0.18;
      if (useAnime) utils.set(el, { x, y });
      else el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
      if (Math.abs(tx - x) > 0.2 || Math.abs(ty - y) > 0.2) raf = requestAnimationFrame(follow);
      else raf = 0;
    };
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      tx = (e.clientX - (r.left + r.width / 2)) * 0.28;
      ty = (e.clientY - (r.top + r.height / 2)) * 0.34;
      if (!raf) raf = requestAnimationFrame(follow);
    });
    el.addEventListener('pointerleave', () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      tx = 0; ty = 0;
      if (useAnime) { animate(el, { x: 0, y: 0, duration: 900, ease: springSnap() }); x = 0; y = 0; }
      else {
        el.style.transition = 'transform .6s cubic-bezier(.16,1,.3,1)';
        el.style.transform = 'translate3d(0,0,0)';
        setTimeout(() => { el.style.transition = ''; }, 600);
        x = 0; y = 0;
      }
    });
  });

  /* ---------- 3D tilt cards ---------- */
  $$('.tilt').forEach((card) => {
    const shine = card.querySelector('.shine');
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      const rx = (0.5 - py) * 11, ry = (px - 0.5) * 11;
      if (useAnime) utils.set(card, { rotateX: rx, rotateY: ry, translateZ: 22 });
      else card.style.transform = 'rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) translateZ(22px)';
      if (shine) { shine.style.setProperty('--sx', px * 100 + '%'); shine.style.setProperty('--sy', py * 100 + '%'); }
    });
    card.addEventListener('pointerleave', () => {
      if (useAnime) animate(card, { rotateX: 0, rotateY: 0, translateZ: 0, duration: 1100, ease: springSoft() });
      else {
        card.style.transition = 'transform .8s cubic-bezier(.16,1,.3,1)';
        card.style.transform = 'rotateX(0) rotateY(0) translateZ(0)';
        setTimeout(() => { card.style.transition = ''; }, 800);
      }
    });
  });

  /* ---------- monogram parallax ---------- */
  const stack = document.getElementById('monoStack');
  const monoWrap = document.querySelector('.monogram');
  const mono = { mx: 0, my: 0, tmx: 0, tmy: 0 };
  window.addEventListener('pointermove', (e) => {
    mono.tmy = ((e.clientX / innerWidth) - 0.5) * 26;
    mono.tmx = (0.5 - (e.clientY / innerHeight)) * 16;
  }, { passive: true });

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (monoWrap && y < innerHeight * 1.2) {
      monoWrap.style.transform = 'translate3d(0,' + (y * 0.22) + 'px,0) scale(' + (1 + y * 0.00018) + ')';
      monoWrap.style.opacity = String(Math.max(0, 1 - y / (innerHeight * 0.9)));
    }
  }, { passive: true });

  const lerp = (a, b, n) => a + (b - a) * n;
  const tick = () => {
    o.x = lerp(o.x, o.tx, 0.16); o.y = lerp(o.y, o.ty, 0.16);
    if (useAnime) utils.set(orb, { x: o.x - 13, y: o.y - 13 });
    else orb.style.transform = 'translate3d(' + (o.x - 13) + 'px,' + (o.y - 13) + 'px,0)';

    if (stack) {
      mono.mx = lerp(mono.mx, mono.tmx, 0.06);
      mono.my = lerp(mono.my, mono.tmy, 0.06);
      stack.style.setProperty('--mx', mono.mx.toFixed(2) + 'deg');
      stack.style.setProperty('--my', mono.my.toFixed(2) + 'deg');
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();
