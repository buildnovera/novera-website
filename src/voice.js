/* ============================================================================
   4. VOICE AGENT — Retell web call
   ----------------------------------------------------------------------------
   Built directly on Retell's official web SDK rather than the drop-in widget,
   so the launcher matches the site instead of sitting on top of it.

   The public key is designed to be exposed in frontend code — it can only
   start a web call for the given agent, nothing else.

   Flow: mic preflight → POST /v2/create-web-call (public key) → SDK connects
   with the returned access token.
   ========================================================================== */
(function () {
  const PHONE_HREF = 'tel:+15044813624';
  const PHONE_TEXT = '(504) 481-3624';
  const PUBLIC_KEY = 'public_key_91edbe8a796bbd59b615d';
  const AGENT_ID = 'agent_7dce1cca0d229c36cdeee78121';

  const invite = document.getElementById('voice-invite');
  const inviteMsg = document.getElementById('vi-message');
  const notice = document.getElementById('mic-notice');
  const fab = document.getElementById('voice-fab');
  const panel = document.getElementById('voice-panel');
  const statusEl = document.getElementById('vp-status');
  const hintEl = document.getElementById('vp-hint');
  const muteBtn = document.getElementById('vp-mute');
  const hangBtn = document.getElementById('vp-hang');
  const closeBtn = document.getElementById('vp-close');
  const waveEl = document.getElementById('vp-wave');

  /* ---------- friendly notice ---------- */
  let noticeTimer = 0;
  const showNotice = (html, ms = 11000) => {
    if (!notice) return;
    notice.innerHTML = html +
      ' <button type="button" aria-label="Dismiss">&times;</button>';
    notice.querySelector('button').addEventListener('click', hideNotice);
    notice.classList.add('on');
    clearTimeout(noticeTimer);
    if (ms) noticeTimer = setTimeout(hideNotice, ms);
  };
  const hideNotice = () => notice && notice.classList.remove('on');

  const micProblem = (kind) => {
    const call = `<a href="${PHONE_HREF}">${PHONE_TEXT}</a>`;
    if (kind === 'missing')
      showNotice(`No microphone found. Plug one in and try again — or just call us at ${call}.`);
    else if (kind === 'denied')
      showNotice(`Mic access is blocked. Allow the microphone in your browser's address bar and try again, or call us at ${call}.`);
    else if (kind === 'insecure')
      showNotice(`Voice chat needs a secure connection (https). For now, give us a call at ${call}.`);
    else
      showNotice(`We couldn't start the mic. Check your microphone and try again, or call us at ${call}.`);
  };

  /* ---------- microphone preflight ---------- */
  async function micReady() {
    if (!window.isSecureContext) { micProblem('insecure'); return false; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      micProblem('missing'); return false;
    }
    try {
      // Is there any input device at all? (labels stay hidden until granted)
      if (navigator.mediaDevices.enumerateDevices) {
        const devs = await navigator.mediaDevices.enumerateDevices();
        if (devs.length && !devs.some((d) => d.kind === 'audioinput')) {
          micProblem('missing'); return false;
        }
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Release it straight away — the widget opens its own stream.
      stream.getTracks().forEach((t) => t.stop());
      hideNotice();
      return true;
    } catch (err) {
      const n = err && err.name;
      if (n === 'NotAllowedError' || n === 'SecurityError') micProblem('denied');
      else if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError') micProblem('missing');
      else micProblem('other');
      return false;
    }
  }

  /* ---------- live call visualiser ---------- */
  const wctx = waveEl ? waveEl.getContext('2d') : null;
  let agentTalking = false, callLive = false, waveRaf = 0;

  const sizeVpWave = () => {
    if (!waveEl || !wctx) return;
    const r = waveEl.getBoundingClientRect();
    if (!r.width) return;
    const d = Math.min(window.devicePixelRatio || 1, 2);
    waveEl.width = r.width * d; waveEl.height = r.height * d;
    wctx.setTransform(d, 0, 0, d, 0, 0);
  };
  window.addEventListener('resize', sizeVpWave);

  const drawVp = (t) => {
    waveRaf = requestAnimationFrame(drawVp);
    if (!wctx || !waveEl.clientWidth) return;
    const w = waveEl.clientWidth, h = waveEl.clientHeight;
    wctx.clearRect(0, 0, w, h);
    const bars = Math.floor(w / 6);
    for (let i = 0; i < bars; i++) {
      const p = i / bars;
      const env = callLive ? Math.sin(p * Math.PI) : 0.14;
      const speed = agentTalking ? 0.006 : 0.0025;
      const a = Math.abs(Math.sin(t * speed + i * 0.44) * Math.sin(t * 0.0016 + i * 0.12));
      const gain = callLive ? (agentTalking ? 1 : 0.42) : 0.3;
      const amp = (h * 0.46) * env * (0.2 + a * 0.95) * gain;
      wctx.fillStyle = agentTalking ? 'rgba(228,196,142,.8)' : 'rgba(155,193,255,.62)';
      wctx.fillRect(i * 6 + 2, h / 2 - amp / 2, 2.5, Math.max(2, amp));
    }
  };

  /* ---------- panel plumbing ---------- */
  const setStatus = (text, live) => {
    if (statusEl) statusEl.textContent = text;
    if (panel) panel.classList.toggle('live', !!live);
  };
  const setHint = (text) => { if (hintEl) hintEl.textContent = text; };

  const openPanel = () => {
    if (!panel) return;
    panel.classList.add('on');
    if (fab) fab.classList.add('hidden');
    requestAnimationFrame(sizeVpWave);
    if (!waveRaf) waveRaf = requestAnimationFrame(drawVp);
  };
  const closePanel = () => {
    if (!panel) return;
    panel.classList.remove('on');
    if (fab) fab.classList.remove('hidden');
    cancelAnimationFrame(waveRaf); waveRaf = 0;
  };

  /* ---------- the call itself ---------- */
  let client = null, starting = false, muted = false;

  // The voice SDK is ~470 kB, and most visitors never open a call — so it is
  // fetched on demand rather than shipped in the initial bundle. Warmed up
  // when the invite first appears so the click still feels instant.
  let sdkPromise = null;
  const loadSdk = () => (sdkPromise ||= import('retell-client-js-sdk'));

  function wireClient(c) {
    c.on('call_started', () => {
      callLive = true;
      setStatus('Connected', true);
      setHint('Go ahead — she’s listening.');
    });
    c.on('call_ready', () => setStatus('Connected', true));
    c.on('agent_start_talking', () => { agentTalking = true; });
    c.on('agent_stop_talking', () => { agentTalking = false; });
    c.on('call_ended', () => {
      callLive = false; agentTalking = false;
      setStatus('Call ended', false);
      setHint('Thanks for calling. Start another any time.');
      setTimeout(closePanel, 2200);
    });
    c.on('error', (err) => {
      callLive = false; agentTalking = false;
      console.error('Retell call error:', err);
      setStatus('Disconnected', false);
      closePanel();
      showNotice(
        `The call dropped. Try again in a moment, or reach us on ` +
        `<a href="${PHONE_HREF}">${PHONE_TEXT}</a>.`
      );
      try { c.stopCall(); } catch (e) { /* already down */ }
    });
  }

  async function startCall() {
    if (starting || callLive) { openPanel(); return; }
    starting = true;
    stopInvite();

    if (!(await micReady())) { starting = false; return; }

    openPanel();
    setStatus('Connecting', false);
    setHint('Setting up the line…');

    try {
      const [{ RetellWebClient }, res] = await Promise.all([
        loadSdk(),
        fetch('https://api.retellai.com/v2/create-web-call', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + PUBLIC_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ agent_id: AGENT_ID })
        })
      ]);

      if (!res.ok) {
        const body = await res.text();
        throw new Error('create-web-call ' + res.status + ': ' + body.slice(0, 200));
      }
      const { access_token: accessToken } = await res.json();
      if (!accessToken) throw new Error('no access token returned');

      if (!client) { client = new RetellWebClient(); wireClient(client); }
      muted = false;
      if (muteBtn) muteBtn.textContent = 'Mute';

      await client.startCall({ accessToken });
    } catch (err) {
      console.error('Could not start the call:', err);
      closePanel();
      const offline = !navigator.onLine;
      showNotice(
        (offline
          ? 'You appear to be offline. '
          : 'We couldn’t reach the assistant just now. ') +
        `Please try again, or call us on <a href="${PHONE_HREF}">${PHONE_TEXT}</a>.`
      );
    } finally {
      starting = false;
    }
  }

  function endCall() {
    try { if (client) client.stopCall(); } catch (e) { /* already down */ }
    callLive = false; agentTalking = false;
    closePanel();
  }

  if (fab) fab.addEventListener('click', startCall);
  if (hangBtn) hangBtn.addEventListener('click', endCall);
  if (closeBtn) closeBtn.addEventListener('click', endCall);
  if (muteBtn) muteBtn.addEventListener('click', () => {
    if (!client || !callLive) return;
    muted = !muted;
    if (muted) client.mute(); else client.unmute();
    muteBtn.textContent = muted ? 'Unmute' : 'Mute';
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel && panel.classList.contains('on')) endCall();
  });
  window.addEventListener('beforeunload', () => { try { if (client) client.stopCall(); } catch (e) {} });

  document.querySelectorAll('[data-voice-cta]').forEach((btn) => {
    btn.addEventListener('click', startCall);
  });

  /* ---------- rotating invite ---------- */
  // Appears 5s after load, stays 5s, hides 5s, then shows the next message.
  const MESSAGES = [
    'Would you like to book an appointment?',
    'Want to hear what your phone could sound like?',
    'Questions about a website? Just ask.',
    'I can book you a 30-minute call right now.'
  ];
  const FIRST_DELAY = 5000;
  const VISIBLE_MS = 5000;
  const HIDDEN_MS = 5000;

  let idx = 0, cycleTimer = 0, stopped = false;

  // Hoisted so startCall() can call it before the invite block is reached.
  function stopInvite() {
    stopped = true;
    clearTimeout(cycleTimer);
    if (invite) invite.classList.remove('on');
  }

  function showStep() {
    if (stopped || !invite) return;
    if (idx === 0) loadSdk();   // warm the SDK the first time we invite them
    inviteMsg.textContent = MESSAGES[idx % MESSAGES.length];
    idx++;
    invite.classList.add('on');
    cycleTimer = setTimeout(() => {
      if (stopped) return;
      invite.classList.remove('on');
      cycleTimer = setTimeout(showStep, HIDDEN_MS);
    }, VISIBLE_MS);
  }

  if (invite) {
    // Pause the cycle while the tab is in the background.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { clearTimeout(cycleTimer); }
      else if (!stopped) { clearTimeout(cycleTimer); cycleTimer = setTimeout(showStep, 1200); }
    });

    invite.addEventListener('click', (e) => {
      if (e.target.closest('.vi-close')) { stopInvite(); return; }
      startCall();
    });
    invite.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startCall(); }
    });

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cycleTimer = setTimeout(showStep, FIRST_DELAY);
    }
  }

  // If the SDK loses the mic mid-call, surface our message rather than
  // letting it fail silently in the console.
  window.addEventListener('unhandledrejection', (e) => {
    const n = e.reason && (e.reason.name || '');
    const m = String((e.reason && e.reason.message) || '');
    if (/NotAllowedError|NotFoundError|Permission denied|microphone/i.test(n + ' ' + m)) {
      micProblem(/NotFound/i.test(n) ? 'missing' : 'denied');
    }
  });
})();
