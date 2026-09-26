/**
 * Oversized-image sanitising for API payloads.
 *
 * THE PROBLEM
 * -----------
 * Store, category and product saves embed merchant-uploaded images as `data:`
 * base64 URLs (FileReader → `data:image/png;base64,…`). Those strings travel:
 *
 *     browser  →  POST /api/stores/update   (Express body parser)
 *              →  MongoDB `$set`            (16MB hard document ceiling)
 *              →  Supabase REST PATCH/POST  (per-request size limit)
 *
 * Each hop has its own limit, and each fails differently:
 *   • Express  — HTTP 413 `request entity too large` before any route runs.
 *   • Mongo    — error 2 `BSONObj size is invalid` / document too large.
 *   • Supabase — 400 Bad Request, which then looks like a SCHEMA error and sends
 *                you hunting for a bad column name when the real cause is size.
 *
 * Raising the body limit alone only moves the failure downstream, so this module
 * shrinks the images instead of merely admitting them.
 *
 * WHAT IT DOES
 * ------------
 *   • Measures the payload and reports whether it is oversized.
 *   • Strips base64 `data:` images that exceed a per-image budget, replacing them
 *     with the empty string (or a remote URL when one is available).
 *   • NEVER throws and never silently corrupts: a small image is passed through
 *     byte-for-byte, and a stripped one is reported in `strippedFields` so the
 *     caller can tell the merchant what happened.
 *
 * Pure and dependency-free, so both the serverless bundle and the browser can
 * import it.
 */

/** Per-image budget. Above this a base64 image is not persisted inline. */
export const MAX_INLINE_IMAGE_BYTES = 1_500_000; // ~1.5MB of base64 ≈ 1.1MB binary

/** Total budget for a single JSON payload. */
export const MAX_PAYLOAD_BYTES = 8_000_000; // ~8MB

/** True for a `data:image/...;base64,...` URL. */
export function isInlineImage(value: unknown): boolean {
  return typeof value === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);
}

/** Approximate byte size of a string (base64 chars ≈ bytes). */
export function byteSize(value: unknown): number {
  if (typeof value !== 'string') return 0;
  return value.length;
}

export interface SanitizeResult<T> {
  value: T;
  /** True when at least one oversized image was removed. */
  changed: boolean;
  /** Dotted paths of the fields that were stripped or trimmed. */
  strippedFields: string[];
  /** Byte size of the value before/after. */
  before: number;
  after: number;
  /** Human-readable summary, suitable for a warning toast. */
  notice?: string;
}

/**
 * Walk a payload and strip oversized inline images.
 *
 * Recurses through plain objects and arrays. A field is only touched when it is
 * an inline `data:` image larger than `maxImageBytes`; everything else is
 * returned structurally identical (new object identity, same values).
 *
 * @param maxImageBytes per-image budget; defaults to MAX_INLINE_IMAGE_BYTES
 * @param replacement   what to write over a stripped image (default `''`)
 */
export function sanitizeImagePayload<T>(
  input: T,
  maxImageBytes: number = MAX_INLINE_IMAGE_BYTES,
  replacement: string = ''
): SanitizeResult<T> {
  const strippedFields: string[] = [];
  const before = approximateSize(input);

  const walk = (node: any, path: string, depth: number): any => {
    // Guard against a pathological/cyclic payload rather than blowing the stack.
    if (depth > 12) return node;

    if (isInlineImage(node)) {
      if (byteSize(node) > maxImageBytes) {
        strippedFields.push(path || '(root)');
        return replacement;
      }
      return node;
    }

    if (Array.isArray(node)) {
      return node.map((item, i) => walk(item, `${path}[${i}]`, depth + 1));
    }

    if (node && typeof node === 'object' && !(node instanceof Date)) {
      const out: Record<string, any> = {};
      for (const key of Object.keys(node)) {
        out[key] = walk(node[key], path ? `${path}.${key}` : key, depth + 1);
      }
      return out;
    }

    return node;
  };

  const value = walk(input, '', 0) as T;
  const after = approximateSize(value);
  const changed = strippedFields.length > 0;

  return {
    value,
    changed,
    strippedFields,
    before,
    after,
    notice: changed
      ? `${strippedFields.length} oversized image${strippedFields.length === 1 ? '' : 's'} ` +
        `(${formatBytes(before - after)} of base64) could not be stored inline and ` +
        `${strippedFields.length === 1 ? 'was' : 'were'} skipped. ` +
        `Use images under ${formatBytes(maxImageBytes)} — large photos are automatically ` +
        `downscaled before upload.`
      : undefined,
  };
}

/** Approximate serialized size of a value, without stringifying huge strings twice. */
export function approximateSize(value: unknown, depth = 0): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string') return value.length;
  if (typeof value === 'number' || typeof value === 'boolean') return 8;
  if (value instanceof Date) return 24;
  if (depth > 12) return 0;

  if (Array.isArray(value)) {
    return value.reduce((sum, v) => sum + approximateSize(v, depth + 1), 2);
  }
  if (typeof value === 'object') {
    let sum = 2;
    for (const key of Object.keys(value as Record<string, unknown>)) {
      sum += key.length + 4 + approximateSize((value as Record<string, unknown>)[key], depth + 1);
    }
    return sum;
  }
  return 0;
}

/** True when a payload exceeds the total budget. */
export function isPayloadTooLarge(
  value: unknown,
  maxBytes: number = MAX_PAYLOAD_BYTES
): boolean {
  return approximateSize(value) > maxBytes;
}

/** Human-readable byte size. */
export function formatBytes(bytes: number): string {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Replace an oversized inline image with a remote URL when the record already
 * carries one, otherwise blank it.
 *
 * Store records read back from the API often hold BOTH a `data:` logo and a
 * hosted `logo_url`. Dropping the base64 while keeping the hosted URL loses no
 * information and brings the payload back under every limit.
 */
export function preferRemoteImage(
  inlineValue: unknown,
  remoteValue: unknown,
  maxImageBytes: number = MAX_INLINE_IMAGE_BYTES
): string | undefined {
  if (!isInlineImage(inlineValue) || byteSize(inlineValue) <= maxImageBytes) {
    return typeof inlineValue === 'string' ? inlineValue : undefined;
  }
  if (typeof remoteValue === 'string' && /^https?:\/\//i.test(remoteValue)) {
    return remoteValue;
  }
  return '';
}

export default {
  sanitizeImagePayload,
  isInlineImage,
  isPayloadTooLarge,
  approximateSize,
  formatBytes,
  preferRemoteImage,
  MAX_INLINE_IMAGE_BYTES,
  MAX_PAYLOAD_BYTES,
};