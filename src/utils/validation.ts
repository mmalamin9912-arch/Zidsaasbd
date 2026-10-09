/**
 * Email validation helpers for the auth flows.
 *
 * `isValidEmail` implements the HTML5/RFC 5322 practical grammar: a dot-
 * separated local part made of atext characters, an RFC-compliant domain with
 * at least one dot, plus the RFC 5321 length limits (254 total, 64 local).
 * It intentionally rejects common typos the browser's built-in `type="email"`
 * misses when forms are submitted programmatically.
 */

const EMAIL_PATTERN =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function isValidEmail(value: string): boolean {
  const email = (value || '').trim();
  if (!email || email.length > 254) return false;
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return false;
  if (email.slice(at + 1).length > 253) return false;
  if (email.slice(0, at).length > 64) return false;
  return EMAIL_PATTERN.test(email);
}
