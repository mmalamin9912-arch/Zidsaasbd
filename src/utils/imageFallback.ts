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
 * Pull a URL out of a value that may be a string or an `{ url }`-shaped object.
 * Product rows are written by several callers, some of which store
 * `images: [{ url, alt }]` rather than `images: ['https://…']`.
 */
function urlFromValue(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '#' ? '' : trimmed;
  }
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  const inner =
    record.url ?? record.src ?? record.image ?? record.image_url ??
    record.imageUrl ?? record.thumbnail ?? record.path ?? '';
  return typeof inner === 'string' ? inner.trim() : '';
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
  if (!source || typeof source !== 'object') return urlFromValue(source);
  const item = source as Record<string, any>;
  const product = item.product && typeof item.product === 'object' ? item.product : null;

  const candidates: unknown[] = [
    item.image, item.imageUrl, item.image_url, item.thumbnail, item.thumbnailUrl,
    item.productImage, item.product_image, item.photo, item.photoUrl,
    ...(Array.isArray(item.images) ? item.images : []),
    product?.image, product?.imageUrl, product?.image_url, product?.thumbnail,
    ...(Array.isArray(product?.images) ? product.images : []),
  ];

  for (const candidate of candidates) {
    const url = urlFromValue(candidate);
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
  return hasImageSource(value) ? value.trim() : fallback;
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

  const url = src.trim();

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
