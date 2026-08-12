import { clearCookie } from './_auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Set-Cookie', clearCookie());
  res.status(200).json({ authed: false });
}
