/**
 * Shared image fallback helpers.
 *
 * External image hosts (Unsplash, user-supplied CDN URLs, etc.) can fail at any
 * time — a removed photo id, a rate-limited/hot-linked request, or a flaky
 * network. The DevTools Network tab then fills up with repeated failed requests
 * while the UI silently renders an empty box.
 *
 * Everything funnels through the local `/placeholder.svg` asset so a failure
 * resolves in a single in-origin request instead of retrying the broken host.
 */
import { useEffect, useState } from 'react';
import type { SyntheticEvent } from 'react';

/** Local placeholder used whenever an external image cannot be loaded. */
export const PLACEHOLDER_IMAGE = '/placeholder.svg';

/**
 * Storage base prefixed to an image path that has no domain of its own.
 *
 * Merchants and older imports store what the upload API returned after stripping
 * the host — `/storage/v1/object/public/product-images/…`, `product-images/x.jpg`
 * or a bare `x.jpg`. In the browser such a value resolves against the APP's own
 * origin (`/store/x.jpg`), i.e. a 404 and a broken-image icon in the cart, the
 * checkout summary and the order cards.
 */
export function getStorageBase(): string {
  let raw = '';
  try {
    const metaEnv = (typeof import.meta !== 'undefined' && (import.meta as any)?.env) || {};
    raw =
      metaEnv.VITE_SUPABASE_URL ||
      metaEnv.NEXT_PUBLIC_SUPABASE_URL ||
      metaEnv.SUPABASE_URL ||
      '';
  } catch {}

  if (!raw) {
    try {
      const procEnv = (typeof process !== 'undefined' && process.env) || {};
      raw =
        procEnv.VITE_SUPABASE_URL ||
        procEnv.NEXT_PUBLIC_SUPABASE_URL ||
        procEnv.SUPABASE_URL ||
        '';
    } catch {}
  }

  if (!raw && typeof window !== 'undefined') {
    try {
      raw =
        (window as any)?.__ENV__?.VITE_SUPABASE_URL ||
        (window as any)?.VITE_SUPABASE_URL ||
        (window as any)?.__SUPABASE_URL__ ||
        '';
    } catch {}
  }

  const trimmed = String(raw || '').trim();
  return trimmed ? trimmed.replace(/\/+$/, '') : '';
}

export const STORAGE_BASE = getStorageBase();

/** Buckets that are served from the Supabase storage host. */
export const STORAGE_BUCKETS = [
  'product-images',
  'products',
  'product',
  'uploads',
  'media',
  'store-assets',
  'review-images',
  'merchant-logos',
  'categories',
  'category-images',
  'banners',
  'covers',
  'avatars',
  'profiles',
  'documents',
];

/** True for a value that already carries a scheme or an absolute origin. */
function isAbsoluteImageUrl(value: string): boolean {
  return (
    /^(https?:)?\/\//i.test(value) ||
    /^data:/i.test(value) ||
    /^blob:/i.test(value)
  );
}

/**
 * Turn any stored image value into something the browser can actually load.
 *
 * - absolute URL / data URI / blob     → unchanged
 * - `/storage/v1/object/...`           → Supabase storage host + the path
 * - `product-images/…` inside a bucket → Supabase storage public object URL
 * - any other relative path            → resolved against THIS app's origin
 *   (an in-repo asset such as `/images/tee.png` must keep working)
 * - empty / `'#'`                      → '' so the caller shows a placeholder
 */
export function toRenderableImageUrl(value: unknown): string {
  const raw = urlFromValue(value);
  if (!raw) return '';
  if (isAbsoluteImageUrl(raw)) return raw;

  let path = raw.replace(/^\/+/, '');
  const storageBase = getStorageBase() || STORAGE_BASE;

  if (storageBase) {
    if (path.toLowerCase().startsWith('supabase/')) {
      path = path.slice('supabase/'.length).replace(/^\/+/, '');
    }

    // Already a storage path, e.g. storage/v1/object/public/... or storage/v1/object/...
    if (/^storage\/v1\/object\//i.test(path)) {
      return `${storageBase}/${path}`;
    }

    // e.g. storage/v1/product-images/...
    if (/^storage\/v1\//i.test(path)) {
      const sub = path.slice('storage/v1/'.length);
      return `${storageBase}/storage/v1/object/public/${sub}`;
    }

    // e.g. object/public/...
    if (/^object\/public\//i.test(path)) {
      return `${storageBase}/storage/v1/${path}`;
    }

    // e.g. public/<bucket>/...
    if (/^public\//i.test(path)) {
      const parts = path.slice('public/'.length).split('/');
      const bucket = parts[0]?.toLowerCase();
      if (STORAGE_BUCKETS.includes(bucket) && parts.length > 1) {
        return `${storageBase}/storage/v1/object/${path}`;
      }
    }

    // Bucket followed by object path: e.g. product-images/xxx.jpg
    const slashIdx = path.indexOf('/');
    if (slashIdx > 0) {
      const bucket = path.slice(0, slashIdx).toLowerCase();
      const rest = path.slice(slashIdx + 1);
      if (STORAGE_BUCKETS.includes(bucket) && rest.length > 0) {
        return `${storageBase}/storage/v1/object/public/${bucket}/${rest}`;
      }
    }
  }

  // A relative in-app asset (`/images/…`, `/placeholder.svg`) — keep as-is.
  return raw;
}

/**
 * Pull a URL out of a value that may be a string or an `{ url }`-shaped object.
 * Product rows are written by several callers, some of which store
 * `images: [{ url, alt }]` rather than `images: ['https://…']`.
 */
/** Return the first non-empty, non-placeholder string from the given values.
 * `??` alone is not enough: `{ image: '', image_url: 'valid.jpg' }` would
 * resolve to `''` because `??` only skips `null`/`undefined`, not `''`.
 */
function firstNonEmpty(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (
        trimmed !== '' &&
        trimmed !== '#' &&
        !/^(null|undefined)$/i.test(trimmed) &&
        !/^\/?placeholder\.(svg|png|jpe?g|webp)$/i.test(trimmed)
      ) {
        return trimmed;
      }
    }
  }
  return '';
}

function urlFromValue(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // Legacy rows and a few API serializers write the LITERAL strings
    // 'null' / 'undefined' into an image column. Rendering them produced a
    // request for `/null` (a 404 → placeholder) instead of falling through to
    // the next candidate that may still carry a real database URL.
    // A STORED placeholder URL is likewise "no photo": keeping it would
    // short-circuit the resolver before the catalogue fallback could supply
    // the real image.
    if (
      !trimmed ||
      trimmed === '#' ||
      /^(null|undefined)$/i.test(trimmed) ||
      /^\/?placeholder\.(svg|png|jpe?g|webp)$/i.test(trimmed)
    ) {
      return '';
    }
    // If it's a JSON string representing an array or object, parse it
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        const resolved = urlFromValue(parsed);
        if (resolved) return resolved;
      } catch {}
    }
    return trimmed;
  }
  if (!value || typeof value !== 'object') return '';

  if (Array.isArray(value)) {
    for (const v of value) {
      const res = urlFromValue(v);
      if (res) return res;
    }
    return '';
  }

  const record = value as Record<string, unknown>;
  // Check every URL-shaped key on the object, skipping empty/placeholder values
  // so a real database URL in `image_url` isn't shadowed by an empty `image`.
  return firstNonEmpty(
    record.url,
    record.src,
    record.image,
    record.image_url,
    record.imageUrl,
    record.thumbnail,
    record.thumbnailUrl,
    record.thumbnail_url,
    record.productImage,
    record.product_image,
    record.publicUrl,
    record.public_url,
    record.path,
    record.uri,
    record.link,
    (record.data && typeof record.data === 'object')
      ? (record.data as any).publicUrl || (record.data as any).public_url || (record.data as any).url
      : '',
  );
}

/**
 * Resolve a product/order-line thumbnail from EVERY spelling the system writes.
 *
 * Returns '' when nothing usable exists, so callers can decide whether to show
 * a placeholder — this is the single source of truth for the rules below:
 *
 *   item.image                     the flat column written by both order paths
 *   item.image_url / imageUrl      snake/camel variants
 *   item.thumbnail / thumbnailUrl  basket-localStorage copies, legacy rows
 *   item.images[0]                 product rows from the catalogue API
 *   item.product.images[0]         Supabase order lines keep the product nested
 *   item.product.image             a single-image product
 *
 * Without the `images[]` / `product.*` branches, a Supabase order line rendered
 * with NO thumbnail at all even though the catalogue row carried several.
 */
export function resolveProductImage(source: unknown): string {
  if (!source) return '';
  if (typeof source === 'string') {
    const trimmed = source.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        source = JSON.parse(trimmed);
      } catch {
        return toRenderableImageUrl(trimmed);
      }
    } else if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        source = JSON.parse(trimmed);
      } catch {
        return toRenderableImageUrl(trimmed);
      }
    } else {
      return toRenderableImageUrl(trimmed);
    }
  }

  if (Array.isArray(source)) {
    for (const item of source) {
      const url = resolveProductImage(item);
      if (url) return url;
    }
    return '';
  }

  if (typeof source !== 'object') return '';
  const item = source as Record<string, any>;

  // Check if item has nested product or wrapped data
  const rawTarget = item.product || item.item || item.record || item._record || item.data || item.raw;
  let product: Record<string, any> | null = null;
  if (rawTarget && typeof rawTarget === 'object') {
    product = rawTarget;
  } else if (typeof rawTarget === 'string' && rawTarget.trim().startsWith('{')) {
    try { product = JSON.parse(rawTarget); } catch {}
  }

  let populatedProductId: Record<string, any> | null = null;
  if (item.product_id && typeof item.product_id === 'object') {
    populatedProductId = item.product_id;
  } else if (typeof item.product_id === 'string' && item.product_id.trim().startsWith('{')) {
    try { populatedProductId = JSON.parse(item.product_id); } catch {}
  }

  let populatedProductIdCamel: Record<string, any> | null = null;
  if (item.productId && typeof item.productId === 'object') {
    populatedProductIdCamel = item.productId;
  } else if (typeof item.productId === 'string' && item.productId.trim().startsWith('{')) {
    try { populatedProductIdCamel = JSON.parse(item.productId); } catch {}
  }

  const toCandidateArray = (v: unknown): unknown[] => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string' && v.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return [];
  };

  const candidates: unknown[] = [
    // 1. Direct item keys
    item.image,
    item.imageUrl,
    item.image_url,
    item.thumbnail,
    item.thumbnailUrl,
    item.thumbnail_url,
    item.productImage,
    item.product_image,
    item.photo,
    item.photoUrl,
    item.photo_url,
    item.img,
    item.coverImage,
    item.cover_image,
    item.picture,
    item.src,
    item.url,
    item.path,
    item.featured_image,
    item.featuredImage,
    item.publicUrl,
    item.public_url,
    ...toCandidateArray(item.images),
    ...toCandidateArray(item.gallery),
    ...toCandidateArray(item.photos),
    ...toCandidateArray(item.additionalImages),
    ...toCandidateArray(item.additional_images),

    // 2. Nested product keys
    product?.image,
    product?.image_url,
    product?.imageUrl,
    product?.thumbnail,
    product?.thumbnailUrl,
    product?.thumbnail_url,
    product?.productImage,
    product?.product_image,
    product?.photo,
    product?.photoUrl,
    product?.photo_url,
    product?.img,
    product?.coverImage,
    product?.cover_image,
    product?.picture,
    product?.src,
    product?.url,
    product?.path,
    product?.featured_image,
    product?.featuredImage,
    product?.publicUrl,
    product?.public_url,
    ...toCandidateArray(product?.images),
    ...toCandidateArray(product?.gallery),
    ...toCandidateArray(product?.photos),
    ...toCandidateArray(product?.additionalImages),
    ...toCandidateArray(product?.additional_images),
    product?.product?.image,
    product?.product?.image_url,

    // 3. Populated product_id / productId keys
    populatedProductId?.image,
    populatedProductId?.image_url,
    populatedProductId?.imageUrl,
    populatedProductId?.thumbnail,
    populatedProductId?.thumbnailUrl,
    populatedProductId?.productImage,
    ...toCandidateArray(populatedProductId?.images),

    populatedProductIdCamel?.image,
    populatedProductIdCamel?.image_url,
    populatedProductIdCamel?.imageUrl,
    populatedProductIdCamel?.thumbnail,
    populatedProductIdCamel?.thumbnailUrl,
    populatedProductIdCamel?.productImage,
    ...toCandidateArray(populatedProductIdCamel?.images),

    // 4. Fallback line / item inside item
    item.line?.image,
    item.line?.imageUrl,
    item.line?.image_url,
    item.line?.thumbnail,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const url = toRenderableImageUrl(candidate);
    if (url) return url;
  }

  return '';
}

/** Marker attribute written on elements that were swapped to the placeholder. */
const FALLBACK_FLAG = 'data-img-fallback';

/**
 * True when a value is a usable image source we should even attempt to render.
 * Guards against `undefined`, empty strings and the legacy `'#'` placeholder.
 */
export function hasImageSource(value?: string | null): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.trim() !== '#';
}

/**
 * `onError` handler for `<img>` / `<avatar>` elements.
 *
 * Attach it directly: `<img src={url} onError={imgErrorFallback} />`.
 * On the first failure the element is switched to the local placeholder. The
 * guard attribute prevents an infinite error loop in the (unlikely) event that
 * the placeholder itself cannot be fetched.
 */
export function imgErrorFallback(event: SyntheticEvent<HTMLImageElement>): void {
  const img = event.currentTarget;

  if (img.dataset.imageFallback === FALLBACK_FLAG) {
    // The placeholder failed too — stop the loop, just hide the element.
    img.onerror = null;
    img.removeAttribute('src');
    return;
  }

  img.dataset.imageFallback = FALLBACK_FLAG;
  img.src = PLACEHOLDER_IMAGE;
}

/**
 * Resolve an image URL to something safe to render, falling back to the local
 * placeholder when no usable source was supplied.
 */
export function resolveImageUrl(value?: string | null, fallback = PLACEHOLDER_IMAGE): string {
  // Normalised, so a relative storage path is not rendered against the app
  // origin (the usual cause of a broken thumbnail).
  const url = hasImageSource(value) ? toRenderableImageUrl(value) : '';
  return url || fallback;
}

/**
 * Same idea for images used as CSS `background-image`, which cannot carry an
 * `onError` handler. We preload the remote URL and only return it once it has
 * decoded; otherwise the local placeholder is substituted.
 *
 * Returns a cleanup function that safely no-ops after resolving.
 */
export function loadBackgroundImage(
  src?: string | null,
  fallback = PLACEHOLDER_IMAGE,
): Promise<string> {
  if (!hasImageSource(src)) {
    return Promise.resolve(fallback);
  }

  const url = toRenderableImageUrl(src);
  if (!url) return Promise.resolve(fallback);

  return new Promise<string>((resolve) => {
    const probe = new Image();
    probe.onload = () => resolve(url);
    probe.onerror = () => resolve(fallback);
    probe.src = url;
  });
}

/** React hook variant of {@link loadBackgroundImage} for use in components. */
export function useBackgroundImage(
  src?: string | null,
  fallback = PLACEHOLDER_IMAGE,
): string {
  const [resolved, setResolved] = useState<string>(() =>
    hasImageSource(src) ? src.trim() : fallback,
  );

  useEffect(() => {
    let cancelled = false;
    loadBackgroundImage(src, fallback).then((next) => {
      if (!cancelled) setResolved(next);
    });
    return () => {
      cancelled = true;
    };
  }, [src, fallback]);

  return resolved;
}
