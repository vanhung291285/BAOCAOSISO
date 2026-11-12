import { scryptSync, timingSafeEqual } from 'node:crypto';

// Configure BOARDING_SHEET_PASSWORD_SALT and BOARDING_SHEET_PASSWORD_HASH
// in Vercel environment variables. Never commit the plaintext password.
export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const salt = process.env.BOARDING_SHEET_PASSWORD_SALT;
  const expectedHex = process.env.BOARDING_SHEET_PASSWORD_HASH;
  if (!salt || !expectedHex || !/^[a-f0-9]{128}$/i.test(expectedHex)) {
    return res.status(503).json({ error: 'Password gate not configured' });
  }
  const password = req.body?.password;
  if (typeof password !== 'string' || password.length < 1 || password.length > 256) {
    return res.status(400).json({ error: 'Invalid input' });
  }
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  const valid = timingSafeEqual(actual, expected);
  return res.status(valid ? 200 : 401).json(valid ? { ok: true } : { error: 'Invalid password' });
}
