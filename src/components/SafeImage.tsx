import React, { useEffect, useState } from 'react';
import type { ImgHTMLAttributes, SyntheticEvent } from 'react';
import { PLACEHOLDER_IMAGE, hasImageSource, imgErrorFallback } from '../utils/imageFallback';

type SafeImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  /** Image source; external URLs are validated and fall back gracefully. */
  src?: string | null;
  /** Optional fallback override (defaults to the local placeholder asset). */
  fallbackSrc?: string;
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
  onError,
  ...rest
}) => {
  const fallback = hasImageSource(fallbackSrc) ? fallbackSrc : PLACEHOLDER_IMAGE;
  const [failed, setFailed] = useState(false);

  // A new, valid source should get a fresh chance after a previous failure.
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const resolvedSrc = failed || !hasImageSource(src) ? fallback : src;

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
