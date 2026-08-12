import { checkPassword, issueCookie, clearCookie, isAuthed } from './_auth.js';

/** Small fixed penalty on a wrong password — enough to make guessing tedious. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // Lets the page find out whether it already has a session without
  // pointlessly asking for the password again.
  if (req.method === 'GET') {
    res.status(200).json({ authed: isAuthed(req) });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  try {
    if (!checkPassword(body && body.password)) {
      await sleep(600);
      res.setHeader('Set-Cookie', clearCookie());
      res.status(401).json({ error: 'wrong password' });
      return;
    }
  } catch (err) {
    // A missing env var is a deployment fault, not a bad password — say so
    // plainly rather than letting it read as a rejected login.
    console.error('login misconfigured:', err.message);
    res.status(500).json({ error: 'server not configured: ' + err.message });
    return;
  }

  res.setHeader('Set-Cookie', issueCookie());
  res.status(200).json({ authed: true });
}
