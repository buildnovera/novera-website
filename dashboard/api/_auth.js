/* ============================================================================
   Session handling for the private dashboard.
   ----------------------------------------------------------------------------
   One password, held in an env var, exchanged for a signed cookie. There is no
   user table because there is exactly one user.

   The cookie carries only an expiry and an HMAC of it — no identity, nothing
   worth stealing, and nothing that can be edited without the secret. Both
   comparisons are constant-time so neither the password nor the signature can
   be recovered a byte at a time.
   ========================================================================== */
import { createHmac, timingSafeEqual, createHash } from 'node:crypto';

export const COOKIE = 'nvd_session';
const TTL_SECONDS = 60 * 60 * 12;   // half a day, then log in again

/** Fail loudly at call time rather than silently authenticating everyone. */
function secret() {
  const s = process.env.DASH_SECRET;
  if (!s || s.length < 16) {
    throw new Error('DASH_SECRET is missing or shorter than 16 characters');
  }
  return s;
}

const sign = (payload) =>
  createHmac('sha256', secret()).update(payload).digest('base64url');

/** Compare two strings without leaking where they diverge. */
function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

export function checkPassword(supplied) {
  const expected = process.env.DASH_PASSWORD;
  if (!expected) throw new Error('DASH_PASSWORD is not set');
  if (typeof supplied !== 'string' || supplied.length === 0) return false;
  return safeEqual(supplied, expected);
}

export function issueCookie() {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const value = `${exp}.${sign(String(exp))}`;
  // Secure + HttpOnly so it never reaches JavaScript or a plain-HTTP hop.
  // Lax rather than Strict: the dashboard is opened by following a link or a
  // bookmark, and Strict would drop the cookie on that first navigation.
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_SECONDS}`;
}

export const clearCookie = () =>
  `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/** True only for an unexpired cookie carrying a signature we produced. */
export function isAuthed(req) {
  const value = readCookie(req, COOKIE);
  if (!value) return false;

  const dot = value.lastIndexOf('.');
  if (dot < 1) return false;

  const exp = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  if (!/^\d+$/.test(exp)) return false;
  if (Number(exp) * 1000 <= Date.now()) return false;

  try {
    return safeEqual(mac, sign(exp));
  } catch (e) {
    return false;
  }
}

/** Wrap a handler so it returns 401 unless the request carries a session. */
export function requireAuth(handler) {
  return async (req, res) => {
    if (!isAuthed(req)) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    return handler(req, res);
  };
}
