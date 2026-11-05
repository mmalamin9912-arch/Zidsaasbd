import React, { useEffect, useState } from 'react';
import type { ImgHTMLAttributes, SyntheticEvent } from 'react';
import { PLACEHOLDER_IMAGE, hasImageSource, imgErrorFallback, resolveProductImage, toRenderableImageUrl } from '../utils/imageFallback';

type SafeImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  /** Image source; external URLs are validated and fall back gracefully. */
  src?: string | null;
  /** Optional fallback override (defaults to the local placeholder asset). */
  fallbackSrc?: string;
  /**
   * When set, `src` is treated as a raw (possibly NOT normalised) order/basket
   * line and resolved through the shared `resolveProductImage` rules —
   * `image` → `imageUrl`/`image_url` → `thumbnail` → `images[0]` →
   * `product.image` / `product.image_url` / `product.images[0]`.
   *
   * Order history renders `OrderItem.image`, which `normalizeOrderItems` fills
   * from those aliases. A line persisted before that ran (or written by an
   * older client) still carries only `imageUrl` / `thumbnail` / `images[]`, and
   * reading `item.image` alone left it with a blank thumbnail.
   */
  item?: unknown;
};

/**
 * Drop-in replacement for `<img>` that never leaves a blank box behind when an
 * external image URL fails.
 *
 * - Missing / empty / `'#'` sources render the local placeholder immediately,
 *   so the browser never even issues a request for an invalid URL.
 * - Failed loads are caught with `onError` (via {@link imgErrorFallback}) and
 *   swapped to the local placeholder in a single request.
 *
 * Usage: `<SafeImage src={product.image} alt={product.title} className="..." />`
 */
const SafeImage: React.FC<SafeImageProps> = ({
  src,
  fallbackSrc,
  item,
  onError,
  ...rest
}) => {
  // A resolved-but-empty line falls back to `src`, so callers can pass both.
  const lineSrc = resolveProductImage(item) || src;
  const fallback = hasImageSource(fallbackSrc) ? toRenderableImageUrl(fallbackSrc) : PLACEHOLDER_IMAGE;
  const [failed, setFailed] = useState(false);

  /*
   * NORMALISE THE URL, not just validate it.
   *
   * A product stored with a relative storage path (`/storage/v1/object/…`,
   * `product-images/x.jpg`) used to be handed to the browser verbatim, so it
   * resolved against the APP origin and 404'd — the broken-image icon seen in
   * the cart, the checkout summary and the order cards. `toRenderableImageUrl`
   * prepends the Supabase storage host when the value has no domain of its own
   * and leaves absolute URLs and data URIs untouched.
   */
  const normalizedSrc = hasImageSource(lineSrc) ? toRenderableImageUrl(lineSrc) : '';

  // A new, valid source should get a fresh chance after a previous failure.
  useEffect(() => {
    setFailed(false);
  }, [normalizedSrc]);

  const resolvedSrc = failed || !normalizedSrc ? fallback : normalizedSrc;

  const handleError = (event: SyntheticEvent<HTMLImageElement>): void => {
    onError?.(event);
    // Track the failure in state so a React re-render cannot restore the broken
    // `src`, and let the shared helper swap in the placeholder immediately.
    setFailed(true);
    imgErrorFallback(event);
  };

  return (
    <img
      {...rest}
      src={resolvedSrc}
      onError={resolvedSrc === fallback ? undefined : handleError}
    />
  );
};

export default SafeImage;

/** Convenience functional helper for elements that cannot be swapped wholesale. */
export { imgErrorFallback };
