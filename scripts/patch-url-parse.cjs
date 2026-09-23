#!/usr/bin/env node
/**
 * Post-install patch: eliminate the Node.js [DEP0169] `url.parse()` deprecation
 * warning from Vercel runtime logs.
 *
 * WHY
 * ---
 * `express` (v4) → `parseurl` → the legacy `url.parse()` / `new url.Url()` APIs.
 * Every request Express routes through `req.path`, `req.query`, `req.hostname`,
 * etc. calls `parseurl`, which on Node 24 emits:
 *
 *     (node:xx) [DEP0169] DeprecationWarning: url.parse() is deprecated...
 *
 * `node_modules` is reinstalled on every Vercel build, so simply editing the
 * vendored file does not stick. This script rewrites `parseurl/index.js` in
 * place — idempotently and only when the legacy calls are present — so the
 * patched version is the one Vercel bundles.
 *
 * The replacement keeps `parseurl`'s exact public contract (the shape Express
 * relies on: `.path`, `.href`, `.pathname`, `.search`, `.query`, `._raw`) but
 * derives it from the WHATWG `URL` API instead of the deprecated `url.parse`.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MARKER = 'patched: WHATWG URL (DEP0169 fix)';

/** Marker written into follow-redirects so a re-run is idempotent. */
const FOLLOW_REDIRECTS_MARKER = 'patched: WHATWG URL (DEP0169 fix)';

const NEW_SOURCE = `/*!
 * parseurl
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2014-2017 Douglas Christopher Wilson
 * MIT Licensed
 *
 * ${MARKER}.
 * Rewritten to use the WHATWG URL API (new URL) instead of the deprecated
 * url.parse()/url.Url so Node.js no longer emits the [DEP0169] warning.
 */

'use strict'

/**
 * Module exports.
 * @public
 */

module.exports = parseurl
module.exports.original = originalurl

/**
 * Parse the \`req\` url with memoization.
 * @public
 */

function parseurl (req) {
  var url = req.url

  if (url === undefined) {
    return undefined
  }

  var parsed = req._parsedUrl

  if (fresh(url, parsed)) {
    return parsed
  }

  parsed = fastparse(url)
  parsed._raw = url

  return (req._parsedUrl = parsed)
}

/**
 * Parse the \`req\` original url with fallback and memoization.
 * @public
 */

function originalurl (req) {
  var url = req.originalUrl

  if (typeof url !== 'string') {
    return parseurl(req)
  }

  var parsed = req._parsedOriginalUrl

  if (fresh(url, parsed)) {
    return parsed
  }

  parsed = fastparse(url)
  parsed._raw = url

  return (req._parsedOriginalUrl = parsed)
}

/**
 * Parse a path/url string into the object shape Express expects, using WHATWG
 * URL semantics. \`_raw\`-compatible plus \`_urlBase\` marker used by \`fresh\`.
 * @private
 */

function fastparse (str) {
  if (typeof str !== 'string' || str.charCodeAt(0) !== 0x2f /* / */) {
    return legacyParse(str)
  }

  var pathname = str
  var query = null
  var search = null

  // /^(\\/[^?#\\s]*)(\\?[^#\\s]*)?$/ unrolled — see parseurl's original comment.
  for (var i = 1; i < str.length; i++) {
    switch (str.charCodeAt(i)) {
      case 0x3f: /* ?  */
        if (search === null) {
          pathname = str.substring(0, i)
          query = str.substring(i + 1)
          search = str.substring(i)
        }
        break
      case 0x09: /* \\t */
      case 0x0a: /* \\n */
      case 0x0c: /* \\f */
      case 0x0d: /* \\r */
      case 0x20: /*    */
      case 0x23: /* #  */
      case 0xa0:
      case 0xfeff:
        return legacyParse(str)
    }
  }

  return makeParsed(str, pathname, search, query)
}

/**
 * Fallback used for absolute URLs / strings the fast path cannot.
 * Uses the WHATWG URL parser (NOT url.parse) so no deprecation fires.
 * @private
 */

function legacyParse (str) {
  try {
    var parsed = new URL(String(str), 'http://localhost')
    return makeParsed(
      String(str),
      parsed.pathname,
      parsed.search || null,
      parsed.search ? parsed.search.substring(1) : null
    )
  } catch (e) {
    // Last-resort: treat the whole string as a pathname.
    return makeParsed(String(str), String(str), null, null)
  }
}

/**
 * Build the memoized parse result object with the fields Express reads.
 * @private
 */

function makeParsed (href, pathname, search, query) {
  var result = {
    _raw: href,
    _urlBase: true,
    href: href,
    path: href,
    pathname: pathname
  }

  if (search !== null && search !== undefined) {
    result.search = search
    result.query = query
  }

  return result
}

/**
 * Determine if \`parsedUrl\` is still fresh for \`url\`.
 * @private
 */

function fresh (url, parsedUrl) {
  return typeof parsedUrl === 'object' &&
    parsedUrl !== null &&
    parsedUrl._urlBase === true &&
    parsedUrl._raw === url
}
`;

function patchParseurl() {
  const target = path.join(__dirname, '..', 'node_modules', 'parseurl', 'index.js');

  if (!fs.existsSync(target)) {
    // parseurl is not installed (e.g. a dependency-free install) — nothing to do.
    return { patched: false, reason: 'parseurl not installed' };
  }

  const current = fs.readFileSync(target, 'utf8');

  // Already exactly our patched source → nothing to do.
  if (current === NEW_SOURCE) {
    return { patched: false, reason: 'already patched' };
  }

  // Legacy (unpatched) or partially-patched file → rewrite it. We overwrite
  // whenever the file is not our canonical source, which also self-heals a
  // truncated/partial previous run.
  const isLegacy = /url\.parse\(|require\(['"]url['"]\)/.test(current);
  const isOurPatch = current.includes(MARKER);
  if (!isLegacy && !isOurPatch) {
    return { patched: false, reason: 'no legacy url.parse usage found' };
  }

  fs.writeFileSync(target, NEW_SOURCE, 'utf8');
  return { patched: true, reason: 'rewrote parseurl with WHATWG URL' };
}

try {
  const result = patchParseurl();
  console.log(`[patch-url-parse] ${result.patched ? 'OK' : 'skip'}: ${result.reason}`);
} catch (err) {
  // Never fail the install because of an optional optimisation.
  console.warn('[patch-url-parse] non-fatal:', err && err.message ? err.message : err);
}

/**
 * Patch `follow-redirects` (a transitive dependency of the MongoDB driver) to
 * stop calling the deprecated `url.parse()`.
 *
 * WHY A ONE-LINE SUBSTITUTION AND NOT A REWRITE
 * ---------------------------------------------
 * `follow-redirects` is security-sensitive (it decides which host a redirect may
 * target), so replacing the module wholesale is not appropriate. Only ONE call
 * site remains on the legacy API — line 587's `validateUrl(url.parse(input))` —
 * and the modern `URL` equivalent is available directly above it. The
 * substitution is therefore a drop-in: `validateUrl` only reads `.protocol`,
 * `.hostname` and `.pathname`, all of which the WHATWG `URL` instance provides
 * with the same semantics for an absolute URL.
 *
 * `new URL()` throws on an invalid absolute URL, which is exactly the guard
 * `validateUrl(url.parse(...))` was performing, so the error contract is kept.
 */
function patchFollowRedirects() {
  const target = path.join(__dirname, '..', 'node_modules', 'follow-redirects', 'index.js');

  if (!fs.existsSync(target)) {
    return { patched: false, reason: 'follow-redirects not installed' };
  }

  const current = fs.readFileSync(target, 'utf8');

  // Already migrated → nothing to do.
  if (current.includes(FOLLOW_REDIRECTS_MARKER)) {
    return { patched: false, reason: 'already patched' };
  }

  const legacyCall = 'parsed = validateUrl(url.parse(input));';
  if (!current.includes(legacyCall)) {
    return { patched: false, reason: 'no legacy url.parse call found' };
  }

  // `new URL(input)` throws TypeError on a malformed URL, preserving the
  // validation behaviour and message shape callers rely on.
  const replacement =
    `// ${FOLLOW_REDIRECTS_MARKER}\n` +
    `    // Was: validateUrl(url.parse(input)) — url.parse() is deprecated (DEP0169).\n` +
    `    // \`new URL\` throws on an invalid absolute URL, which is the same guard.\n` +
    `    parsed = validateUrl(new URL(input));`;

  const updated = current.replace(legacyCall, replacement);
  if (updated === current) {
    return { patched: false, reason: 'substitution produced no change' };
  }

  fs.writeFileSync(target, updated, 'utf8');
  return { patched: true, reason: 'rewrote follow-redirects url.parse → WHATWG URL' };
}

try {
  const result = patchFollowRedirects();
  console.log(`[patch-url-parse/follow-redirects] ${result.patched ? 'OK' : 'skip'}: ${result.reason}`);
} catch (err) {
  console.warn('[patch-url-parse/follow-redirects] non-fatal:', err && err.message ? err.message : err);
}
