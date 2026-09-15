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
