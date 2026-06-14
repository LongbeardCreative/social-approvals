export const SESSION_COOKIE = 'sa_session';
const PAYLOAD = 'sa-authed-v1';

async function hmacHex(message: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** The cookie value proving the password was entered (changes if the password changes). */
export async function sessionToken(): Promise<string> {
  return hmacHex(PAYLOAD, process.env.EDITOR_PASSWORD ?? '');
}

/** Constant-time check of an entered password against EDITOR_PASSWORD. */
export function checkPassword(input: string): boolean {
  const pw = process.env.EDITOR_PASSWORD;
  return pw ? timingSafeEqual(input, pw) : false;
}

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** True when the request carries a valid session cookie. Fail-closed if EDITOR_PASSWORD is unset. */
export async function isAuthed(req: Request): Promise<boolean> {
  if (!process.env.EDITOR_PASSWORD) return false;
  const token = parseCookie(req.headers.get('cookie'), SESSION_COOKIE);
  return token ? timingSafeEqual(token, await sessionToken()) : false;
}
