/**
 * Host-based storefront routing (Vercel Edge Middleware).
 *
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * The SPA decides "storefront or dashboard?" from `window.location.pathname`
 * (see `isBareStorePath` in src/App.tsx). It never looks at the hostname. So a
 * merchant's own URL — `storename.zidbdsaas.com/` or `www.theirbrand.com/` —
 * arrived with path `/`, which the app treats as the PLATFORM LANDING PAGE.
 * Every merchant storefront on a subdomain or custom domain therefore rendered
 * the platform's marketing page instead of the shop.
 *
 * This middleware runs BEFORE the SPA (and before the `vercel.json` rewrites),
 * so it can rewrite a bare host root onto the internal path form the router
 * already understands:
 *
 *   storename.zidbdsaas.com/        ->  /store/storename
 *   storename.zidbdsaas.com/products ->  /store/storename/products
 *   www.theirbrand.com/             ->  /store/<resolved-slug>
 *
 * The rewritten request then flows through the existing `vercel.json` rules
 * (`/store/:slug` -> `/index.html`) and `App.tsx` self-heals the bare path into
 * `/store/<slug>` exactly as it does for a shared link.
 *
 * REDIRECT-LOOP SAFETY
 * ---------------------------------------------------------------------------
 * Every branch is terminal and mutually exclusive:
 *   • Admin / API / asset paths      -> `next()` untouched (no rewrite at all).
 *   • Host == an apex/platform host  -> `next()` untouched (landing page stays).
 *   • Host == a merchant host        -> rewrite to `/store/<slug>` ONCE.
 * A rewrite reveals the same hostname to the next invocation, but the rewritten
 * path now starts with `/store/`, which the first branch already exempts — so
 * the middleware cannot rewrite its own output and cannot loop. No rule here
 * emits a `Location` header, so a redirect loop is structurally impossible.
 *
 * CUSTOM DOMAINS
 * ---------------------------------------------------------------------------
 * A custom domain (`www.theirbrand.com`) has no useful subdomain, so the slug
 * cannot be derived from the host. We resolve it server-side against the same
 * config API the rest of the app uses (`/api/storefront?store_domain=…`), which
 * matches `customDomain` / `custom_domain` / `domain` / `store_domain` in Mongo.
 * If resolution fails we pass the request through untouched rather than
 * rewriting to a slug we guessed — a wrong rewrite is worse than the landing
 * page, because it shows customers a stranger's shop.
 *
 * NOTE: middleware only runs on Vercel. Local `npm run dev` serves the SPA
 * through Vite, where the host is always localhost, so nothing here applies.
 */

import { next } from '@vercel/edge';

export const config = {
  // Skip Next.js-style internals, the API, and any static asset. Only HTML
  // navigations reach the host logic below.
  matcher: ['/((?!api/|assets/|_next/|_vercel/|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.[a-zA-Z0-9]+$).*)'],
};

/** Hosts that serve the PLATFORM, never a single merchant's storefront. */
const PLATFORM_HOSTS = new Set([
  'zidbdsaas.com',
  'www.zidbdsaas.com',
  'zidbd.com',
  'www.zidbd.com',
  'localhost',
  '127.0.0.1',
]);

/**
 * The root domain merchant subdomains hang off. Overridable so a preview or
 * staging deployment can point at its own zone without a code change.
 */
const PLATFORM_ROOT = (process.env.STOREFRONT_ROOT_DOMAIN || 'zidbdsaas.com').toLowerCase();

/**
 * Subdomains that are infrastructure/app surfaces, not merchant slugs. Without
 * this list `www.` and `app.` would be interpreted as stores named "www"/"app".
 */
const RESERVED_SUBDOMAINS = new Set([
  'www', 'app', 'api', 'admin', 'dashboard', 'mail', 'smtp', 'ftp', 'cdn',
  'assets', 'static', 'img', 'images', 'docs', 'support', 'help', 'status',
  'staging', 'preview', 'dev', 'test', 'beta', 'edge', 'store', 'e',
]);

/** First path segments owned by the app; never rewritten into a storefront. */
const APP_PATH_PREFIXES = [
  // API first: a merchant subdomain must still be able to call /api/*
  // (checkout, storefront payload, payment callbacks). The `matcher` also
  // excludes /api/, but that is a config string — this function is the guard
  // that actually runs, so the prefix belongs here too.
  '/api',
  '/admin', '/super-admin', '/admin-login', '/super-admin-gateway',
  '/dashboard', '/pricing', '/landing', '/login', '/signin',
  '/register', '/signup', '/checkout', '/store/', '/e/',
  // Global multi-vendor marketplace — a platform surface, never a store page.
  '/marketplace',
  // Build output / PWA assets that can be requested without an extension.
  '/assets', '/static', '/_vercel',
];

/** A slug is lowercase alphanumeric with internal hyphens. */
export function isSlugLike(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
}

/**
 * Is this path owned by the app (admin, API, an already-routed storefront, an
 * asset) rather than a merchant storefront navigation?
 *
 * Exported so `scripts/verify-middleware.mts` can assert the loop guard: a
 * rewritten `/store/<slug>` must always match here, which is what makes the
 * middleware unable to reprocess its own output.
 */
export function isAppPath(path: string): boolean {
  // The site ROOT is the multi-vendor marketplace — a platform page, never a
  // merchant storefront. Without this, PLATFORM_HOSTS still passes through,
  // but a merchant subdomain's `/` would be rewritten to `/store/<slug>`; the
  // marketplace must stay reachable everywhere.
  if (path === '/' || path === '') return true;
  if (path.startsWith('/.')) return true;
  return APP_PATH_PREFIXES.some(
    (prefix) => path === prefix.replace(/\/$/, '') || path.startsWith(prefix)
  );
}

/**
 * Is this host the platform itself (apex, www, a reserved infra subdomain, or
 * an unknown host outside the merchant zone)?
 */
export function isReservedOrPlatformHost(host: string): boolean {
  if (PLATFORM_HOSTS.has(host)) return true;
  return host.endsWith('.vercel.app');
}

/**
 * Build the internal rewrite target for a merchant slug + incoming path.
 * Preserves the sub-path and query so deep links survive the rewrite.
 */
export function buildRewriteTarget(slug: string, path: string, search = ''): string {
  const suffix = path === '/' ? '' : path.replace(/^\/+/, '');
  return `/store/${slug}${suffix ? `/${suffix}` : ''}${search}`;
}

/**
 * Derive the merchant slug from a host that sits under PLATFORM_ROOT.
 * Returns '' when the host is the apex, a reserved subdomain, or multi-level
 * (`a.b.zidbdsaas.com` is not a store id and is left alone).
 */
export function slugFromSubdomain(host: string): string {
  if (!host.endsWith(`.${PLATFORM_ROOT}`)) return '';
  const sub = host.slice(0, -(PLATFORM_ROOT.length + 1));
  if (!sub || sub.includes('.') || RESERVED_SUBDOMAINS.has(sub)) return '';
  return isSlugLike(sub) ? sub : '';
}

/**
 * Resolve a fully custom domain (not under PLATFORM_ROOT) to its store slug by
 * asking our own config API. The host is echoed into the query string, so an
 * absolute URL is built from the incoming request's protocol.
 */
async function resolveCustomDomainSlug(host: string, origin: string): Promise<string> {
  try {
    const res = await fetch(
      `${origin}/api/storefront?store_domain=${encodeURIComponent(host)}`,
      { headers: { accept: 'application/json' } }
    );
    if (!res.ok) return '';
    const data: any = await res.json().catch(() => null);
    // The endpoint answers with the canonical slug in `store_slug`; older
    // responses nest it under `merchant`. Accept either, and never trust a
    // non-slug-shaped value.
    const candidate = String(
      data?.store_slug || data?.storeSlug || data?.merchant?.storeSlug || data?.merchant?.store_slug || ''
    ).trim().toLowerCase();
    return isSlugLike(candidate) ? candidate : '';
  } catch {
    // A resolution failure must degrade to pass-through, never to a bad rewrite.
    return '';
  }
}

export default async function middleware(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  // ── 1. Admin / API / already-routed / dotfile requests are never touched.
  //      This branch ALSO guarantees the middleware cannot reprocess its own
  //      rewritten output, which always begins with /store/.
  if (isAppPath(path)) return next();

  // ── 2. Platform hosts (apex, www, *.vercel.app) serve the landing page.
  if (isReservedOrPlatformHost(host)) return next();

  // ── 3. Merchant subdomain: `<slug>.zidbdsaas.com`.
  let slug = slugFromSubdomain(host);

  // ── 4. Otherwise it must be a custom domain — resolve it server-side.
  if (!slug) {
    slug = await resolveCustomDomainSlug(host, url.origin);
  }

  // Unresolvable host (a typo'd domain, or a host we do not own). Pass through:
  // the SPA shows the landing page rather than a stranger's storefront.
  if (!slug) return next();

  // ── 5. Rewrite ONCE onto the internal path form.
  const target = buildRewriteTarget(slug, path, url.search);

  const rewritten = new URL(target, url.origin);
  return next({ request: new Request(rewritten, request) });
}
