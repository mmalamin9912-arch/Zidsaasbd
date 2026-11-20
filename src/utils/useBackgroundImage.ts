/**
 * The React-hook half of `imageFallback.ts`.
 *
 * `useBackgroundImage` used to live inside `imageFallback.ts`, which meant the
 * pure helpers (`resolveProductImage`, `toRenderableImageUrl`, `imgErrorFallback`
 * …) dragged `react` into every module that imported them — services, the
 * marketplace API client and the server bundle included. A module that is
 * evaluated outside a React render must never touch a hook: React 19's hooks
 * read the internal dispatcher, which is still `null` until ReactDOM mounts, so
 * calling one too early throws
 * `Cannot read properties of null (reading 'useState')` and takes the whole
 * bundle down.
 *
 * Keeping the hook in its own file means only components that genuinely render
 * pull `react`, and the helpers stay framework-free.
 */
import { useEffect, useState } from 'react';
import { hasImageSource, loadBackgroundImage, PLACEHOLDER_IMAGE } from './imageFallback';

/** React hook variant of `loadBackgroundImage` for use in components. */
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

export default useBackgroundImage;
