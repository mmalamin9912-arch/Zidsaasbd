/**
 * Automatic, IP-based location detection.
 *
 * The header's "Deliver to" control used to start on a hardcoded city and the
 * shopper had to open the dropdown and pick their own before the delivery
 * promise meant anything. This module resolves an actual place once per device:
 *
 *   1. A previously detected/picked location from localStorage — a returning
 *      visitor is never re-resolved and never has a manual choice overwritten.
 *   2. A lightweight IP lookup (no API key, no auth) through a chain of free
 *      providers, so one provider being down, CORS-blocked or rate-limited does
 *      not leave the header empty. Providers are ordered by transport: the
 *      CORS-friendly ones first (a clean `fetch`, no console noise) and the
 *      JSONP-only fallback last.
 *   3. A static fallback derived from the browser locale/region hints.
 *   4. A final default based on the platform's region (Riyadh for the Gulf
 *      default in `REGION_DEFAULT`).
 *
 * Everything is fail-soft: a blocked network, an ad-blocker or a private-mode
 * throw returns a cached/default location instead of rendering "unknown".
 */

/** Where the resolved location came from — drives the UI hint and caching TTL. */
export type LocationSource = 'saved' | 'ip' | 'locale' | 'default';

export interface DetectedLocation {
  /** Human label shown in the header ("Riyadh", "Dhaka", …). */
  city: string;
  /** ISO 3166-1 alpha-2 country code, uppercased when known. */
  country: string;
  /** Country name when the provider gave one. */
  countryName?: string;
  /** Latitude/longitude when the provider returned coordinates. */
  lat?: number;
  lon?: number;
  source: LocationSource;
  /** Epoch ms the value was resolved — used to expire IP results. */
  resolvedAt: number;
}

/**
 * The platform's home region. When nothing can be detected (offline, blocked
 * IP lookup) the header shows this instead of an empty or invented place.
 */
export const REGION_DEFAULT: DetectedLocation = {
  city: 'Riyadh',
  country: 'SA',
  countryName: 'Saudi Arabia',
  source: 'default',
  resolvedAt: 0,
};

/** localStorage key shared by the marketplace header and the merchant header. */
export const LOCATION_CACHE_KEY = 'zid_detected_location';
/** Separate key for an EXPLICIT choice — never overwritten by detection. */
export const LOCATION_MANUAL_KEY = 'zid_location_manual';

/** IP lookups go stale (VPN, travel, mobile network); a saved pick does not. */
const IP_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** A detection request must not hold up the first paint. */
const LOOKUP_TIMEOUT_MS = 4000;

/** English name for the country codes we can meet from the locale fallback. */
const COUNTRY_NAMES: Record<string, string> = {
  BD: 'Bangladesh',
  SA: 'Saudi Arabia',
  AE: 'United Arab Emirates',
  EG: 'Egypt',
  KW: 'Kuwait',
  QA: 'Qatar',
  BH: 'Bahrain',
  OM: 'Oman',
  JO: 'Jordan',
  PK: 'Pakistan',
  IN: 'India',
  MY: 'Malaysia',
  TR: 'Turkey',
  GB: 'United Kingdom',
  US: 'United States',
};

/** Default city per country, used when only the region/country is known. */
const COUNTRY_CAPITAL: Record<string, string> = {
  BD: 'Dhaka',
  SA: 'Riyadh',
  AE: 'Dubai',
  EG: 'Cairo',
  KW: 'Kuwait City',
  QA: 'Doha',
  BH: 'Manama',
  OM: 'Muscat',
  JO: 'Amman',
  PK: 'Karachi',
  IN: 'Mumbai',
  MY: 'Kuala Lumpur',
  TR: 'Istanbul',
  GB: 'London',
  US: 'New York',
};

function isLocation(value: any): value is DetectedLocation {
  return Boolean(value) && typeof value.city === 'string' && value.city.trim().length > 0;
}

/** Read a stored location, tolerating private mode / corrupted JSON. */
function readStored(key: string): DetectedLocation | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isLocation(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, location: DetectedLocation): void {
  try {
    localStorage.setItem(key, JSON.stringify(location));
  } catch {
    /* storage full or blocked — detection still works for this session */
  }
}

/** The location the shopper picked by hand, if any. Always wins. */
export function getManualLocation(): DetectedLocation | null {
  return readStored(LOCATION_MANUAL_KEY);
}

/** Record an explicit pick so future automatic detection leaves it alone. */
export function saveManualLocation(city: string, country?: string): DetectedLocation {
  const location: DetectedLocation = {
    city,
    country: (country || '').toUpperCase(),
    countryName: (country && COUNTRY_NAMES[country.toUpperCase()]) || undefined,
    source: 'saved',
    resolvedAt: Date.now(),
  };
  writeStored(LOCATION_MANUAL_KEY, location);
  writeStored(LOCATION_CACHE_KEY, location);
  return location;
}

/**
 * Parse a provider payload, transparently unwrapping the JSONP envelope.
 *
 * JSONP exists because several IP providers (ipapi.co among them) do not send
 * CORS headers, so a plain cross-origin `fetch` fails before the request is
 * even sent. See `lookUp` below for why JSONP is the fallback rather than the
 * first choice.
 */
function parsePayload(text: string): any | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  // "callback({...});" → "{...}"
  const unwrapped = trimmed.startsWith('{') || trimmed.startsWith('[')
    ? trimmed
    : trimmed.replace(/^[\w$.]+\(/, '').replace(/\);?$/, '');
  try {
    return JSON.parse(unwrapped);
  } catch {
    return null;
  }
}

/**
 * Fetch JSON with a hard timeout so a hanging provider cannot stall the header.
 *
 * Returns `{ data }` on a usable answer, or `{ data: null, cors: true }` when
 * the provider refused the cross-origin read — the signal `lookUp` needs to
 * fall back to JSONP instead of giving up on that provider.
 */
async function fetchJsonWithTimeout(url: string): Promise<{ data: any | null; cors: boolean }> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller?.signal,
      headers: { Accept: 'application/json' },
      // Never let a CDN serve a stale answer for a different visitor.
      cache: 'no-store',
    });
    if (!res.ok) return { data: null, cors: false };
    return { data: parsePayload(await res.text()), cors: false };
  } catch (error) {
    return { data: null, cors: isCorsFailure(error) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Load a provider payload via a short-lived `<script>` tag (JSONP).
 *
 * This is the no-CORS path: the response executes as a script instead of being
 * read by `fetch`, so a missing `Access-Control-Allow-Origin` header — the
 * reason ipapi.co is unreachable from the browser — stops mattering. The global
 * callback is removed and the tag deleted in every completion path.
 */
function jsonpLookup(baseUrl: string): Promise<any | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve(null);
    const callbackName = `__zidLoc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const script = document.createElement('script');
    let settled = false;

    const cleanup = () => {
      try { delete (window as any)[callbackName]; } catch { /* non-configurable */ }
      script.remove();
    };
    const finish = (value: any | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(value);
    };

    (window as any)[callbackName] = (data: any) => finish(data);
    const timer = setTimeout(() => finish(null), LOOKUP_TIMEOUT_MS);
    script.onerror = () => finish(null);
    script.async = true;
    script.src = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}callback=${callbackName}`;
    document.head.appendChild(script);
  });
}

/**
 * Query one provider, choosing the transport that can actually work.
 *
 * CORS-capable providers are read with `fetch` — no extra script in the page.
 * CORS-blocked ones go straight to JSONP, because a fetch attempt would just
 * add a guaranteed failed request to every page load.
 */
async function lookUp(url: string): Promise<any | null> {
  if (JSONP_ONLY.has(url)) return jsonpLookup(url);
  const { data, cors } = await fetchJsonWithTimeout(url);
  if (data) return data;
  if (cors) return jsonpLookup(url);
  return null;
}

/**
 * Provider chain. Each entry maps a provider's payload onto our shape and
 * returns null when the payload does not carry a usable city.
 */
const PROVIDERS: Array<(json: any) => DetectedLocation | null> = [
  // ipapi.co — city + country code, generous free tier, no key.
  //   NOTE: only the JSONP form works here (`/json/?callback=`). The plain
  //   `/json/` endpoint sends no CORS header, so a direct fetch is always
  //   blocked and leaves a red CORS error behind on every page load.
  (json) => {
    if (!json || json.error) return null;
    const city = String(json.city || json.region || '').trim();
    if (!city) return null;
    const country = String(json.country_code || json.country || '').toUpperCase();
    return {
      city,
      country,
      countryName: json.country_name || COUNTRY_NAMES[country],
      lat: typeof json.latitude === 'number' ? json.latitude : undefined,
      lon: typeof json.longitude === 'number' ? json.longitude : undefined,
      source: 'ip',
      resolvedAt: Date.now(),
    };
  },
  // ipwho.is — same data, different rate limit bucket.
  (json) => {
    if (!json || json.success === false) return null;
    const city = String(json.city || json.region || '').trim();
    if (!city) return null;
    const country = String(json.country_code || '').toUpperCase();
    return {
      city,
      country,
      countryName: json.country || COUNTRY_NAMES[country],
      lat: typeof json.latitude === 'number' ? json.latitude : undefined,
      lon: typeof json.longitude === 'number' ? json.longitude : undefined,
      source: 'ip',
      resolvedAt: Date.now(),
    };
  },
  // ipinfo.io — returns "city, region, country" in a combined `loc` plus fields.
  (json) => {
    if (!json || json.bogon || json.error) return null;
    const city = String(json.city || json.region || '').trim();
    if (!city) return null;
    const country = String(json.country || '').toUpperCase();
    const [latRaw, lonRaw] = String(json.loc || '').split(',');
    const lat = Number(latRaw);
    const lon = Number(lonRaw);
    return {
      city,
      country,
      countryName: COUNTRY_NAMES[country],
      lat: Number.isFinite(lat) ? lat : undefined,
      lon: Number.isFinite(lon) ? lon : undefined,
      source: 'ip',
      resolvedAt: Date.now(),
    };
  },
];

const PROVIDER_URLS = [
  'https://ipwho.is/',
  'https://ipinfo.io/json',
  'https://ipapi.co/json/',
];

/**
 * Providers whose CORS headers are missing, so only JSONP can reach them.
 * Requesting them with `fetch` first would guarantee a failed request (and a
 * console error) on every single page load.
 */
const JSONP_ONLY = new Set(['https://ipapi.co/json/']);

/** DOMException names plus the Chrome/firefox phrasing for a CORS refusal. */
const CORS_ERROR_PATTERN = /Failed to fetch|NetworkError|Load failed|CORS|NotSameOrigin/i;

/**
 * Errors caused by the provider refusing a cross-origin READ rather than being
 * down. There is no point retrying those with fetch, and they are the one class
 * of error the Chrome DevTools protocol inlines into the console already.
 */
function isCorsFailure(error: any): boolean {
  if (!error) return false;
  if (error.name === 'TypeError') return true; // `fetch` rejects with TypeError on CORS
  return CORS_ERROR_PATTERN.test(String(error.message || ''));
}

/** Resolve the place from the browser's locale/region hints, offline. */
function detectFromLocale(): DetectedLocation {
  try {
    const locale = (navigator.languages?.[0] || navigator.language || '').replace('_', '-');
    // "en-SA" → "SA"; "ar" alone carries no country, so the default region wins.
    const parts = locale.split('-');
    const region = parts.length > 1 ? parts[parts.length - 1].toUpperCase() : '';
    if (region && /^[A-Z]{2}$/.test(region)) {
      const city = COUNTRY_CAPITAL[region];
      if (city) {
        return {
          city,
          country: region,
          countryName: COUNTRY_NAMES[region],
          source: 'locale',
          resolvedAt: Date.now(),
        };
      }
    }
  } catch {
    /* navigator unavailable (SSR/pre-render) — fall through to default */
  }
  return { ...REGION_DEFAULT, resolvedAt: Date.now() };
}

/**
 * Resolve the visitor's location.
 *
 * @param options.force  Ignore the cached IP result and query again.
 * @returns The best location we could resolve. Never throws, never null.
 */
export async function detectLocation(options: { force?: boolean } = {}): Promise<DetectedLocation> {
  if (typeof window === 'undefined') return REGION_DEFAULT;

  // 1. An explicit pick is sacred — never re-detect over it.
  const manual = getManualLocation();
  if (manual) return manual;

  // 2. A recent automatic result is reused so the header paints instantly and
  //    the free providers are not hit on every page load.
  const cached = readStored(LOCATION_CACHE_KEY);
  if (!options.force && cached && Date.now() - cached.resolvedAt < IP_CACHE_TTL_MS) {
    return cached;
  }

  // 3. IP lookup, provider by provider, until one answers.
  for (let i = 0; i < PROVIDER_URLS.length; i += 1) {
    const json = await lookUp(PROVIDER_URLS[i]);
    const parsed = PROVIDERS[i](json);
    if (parsed) {
      writeStored(LOCATION_CACHE_KEY, parsed);
      return parsed;
    }
  }

  // 4. Offline / blocked: locale hint, then the platform region default.
  //    This is NOT cached — a later online load should be able to do better.
  return detectFromLocale();
}

/**
 * The best location known *synchronously* — for the first render, before the
 * async detection resolves. Returns a manual pick, a cached result, the locale
 * hint or the region default, in that order.
 */
export function getInitialLocation(): DetectedLocation {
  const manual = getManualLocation();
  if (manual) return manual;
  const cached = readStored(LOCATION_CACHE_KEY);
  if (cached) return cached;
  return detectFromLocale();
}
