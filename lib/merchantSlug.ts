/** Store slugs share the application's root URL namespace. */
const RESERVED_SLUGS = new Set([
  'admin', 'super-admin', 'admin-login', 'super-admin-gateway',
  'dashboard', 'store', 'e', 'pricing', 'landing', 'login', 'signin',
  'register', 'signup', 'checkout', 'api', 'assets', 'static',
]);

export function validateMerchantSlug(value: unknown): { slug?: string; error?: string } {
  if (typeof value !== 'string') return { error: 'Store slug must be a string.' };
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 63) {
    return { error: 'Use 1–63 letters, numbers, or single hyphens between words.' };
  }
  if (RESERVED_SLUGS.has(slug) || slug.startsWith('zid-bd-')) {
    return { error: 'This slug is reserved. Choose another store slug.' };
  }
  return { slug };
}
