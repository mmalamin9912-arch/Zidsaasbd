/**
 * Official default store gallery + the Unsplash purge applied every time a
 * saved theme gallery is read or written.
 *
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------
 * Older demo seeds filled `themeConfig.galleryImages` with `images.unsplash.com`
 * URLs. Those rows were persisted into MongoDB / Supabase / localStorage and
 * kept resurfacing after every reload, overriding the 7 official e-commerce
 * showcase images the theme editor ships with.
 *
 * This module is deliberately dependency-free and isomorphic so BOTH the
 * Express server (`lib/serverApp.ts`) and the browser bundle
 * (`src/components/*`, `src/lib/*`) can apply the exact same rule:
 *
 *   ANY saved gallery list containing an Unsplash URL is stripped of those
 *   rows and re-seeded with `DEFAULT_GALLERY_IMAGE_URLS`.
 *
 * It is imported by:
 *   - lib/serverApp.ts               (API reads/writes of store theme config)
 *   - src/lib/subscriptionService.ts (merchant profile normaliser)
 *   - src/lib/storeData.ts           (localStorage cache reads)
 *   - src/components/ThemeCustomizerModal.tsx (theme editor initial state)
 *   - src/components/TenantStorefrontView.tsx  (storefront gallery render)
 */

/** One gallery row as stored in `themeConfig.galleryImages`. */
export interface GalleryImageEntry {
  url: string;
  caption?: string;
  link?: string;
}

/**
 * The 7 official e-commerce showcase images, served directly from Google's
 * image CDN so they load with no build-time asset bundling.
 */
export const DEFAULT_GALLERY_IMAGE_URLS: string[] = [
  'https://lh3.googleusercontent.com/d/193007_2.jpg',
  'https://lh3.googleusercontent.com/d/192999_2.jpg',
  'https://lh3.googleusercontent.com/d/193000_2.webp',
  'https://lh3.googleusercontent.com/d/192998_2.png',
  'https://lh3.googleusercontent.com/d/192997_2.webp',
  'https://lh3.googleusercontent.com/d/192995.jpg',
  'https://lh3.googleusercontent.com/d/192994_2.webp',
];

/**
 * Shared default list (blank caption, no link — merchants can override every
 * entry from the Theme Editor side panel: Page Content → Gallery).
 *
 * NOTE: treat as read-only. Hand out copies via `getDefaultGalleryImages()`
 * so an in-place edit in one component can never mutate the module constant.
 */
export const DEFAULT_GALLERY_IMAGES: GalleryImageEntry[] = DEFAULT_GALLERY_IMAGE_URLS.map(
  (url) => ({ url, caption: '', link: '' })
);

/** Fresh copy of the 7 official default gallery rows. */
export function getDefaultGalleryImages(): GalleryImageEntry[] {
  return DEFAULT_GALLERY_IMAGES.map((img) => ({ ...img }));
}

/** True for a legacy demo row (`https://images.unsplash.com/...`). */
export function isUnsplashGalleryUrl(url: unknown): boolean {
  return typeof url === 'string' && url.includes('images.unsplash.com');
}

/** Normalise one raw row; unusable rows (no URL) are dropped. */
function normalizeEntry(raw: unknown): GalleryImageEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const url = String((raw as Record<string, unknown>).url ?? '').trim();
  if (!url) return null;
  const caption = (raw as Record<string, unknown>).caption;
  const link = (raw as Record<string, unknown>).link;
  return {
    url,
    caption: typeof caption === 'string' ? caption : '',
    link: typeof link === 'string' ? link : '',
  };
}

/**
 * Force-purge legacy Unsplash demo rows from a saved gallery list.
 *
 * Behaviour:
 *   - Not an array (missing / corrupt value) → a copy of `fallback`
 *     (the 7 official defaults unless the caller asks for something else).
 *   - Array WITHOUT Unsplash rows → the list itself (re-cloned, blank rows
 *     dropped), so merchant edits and deletions round-trip untouched.
 *   - Array WITH Unsplash rows → those rows are stripped and the 7 official
 *     defaults are merged in (de-duplicated by URL), keeping any custom rows
 *     the merchant added alongside the old demo assets.
 *
 * Always returns NEW objects — callers may mutate the result freely without
 * touching `merchant.themeConfig` or the shared constants.
 */
export function sanitizeGalleryImages(
  raw: unknown,
  fallback: GalleryImageEntry[] = DEFAULT_GALLERY_IMAGES
): GalleryImageEntry[] {
  if (!Array.isArray(raw)) {
    return fallback.map((img) => ({ ...img }));
  }

  const normalized = raw
    .map(normalizeEntry)
    .filter((img): img is GalleryImageEntry => img !== null);

  const kept = normalized.filter((img) => !isUnsplashGalleryUrl(img.url));
  if (kept.length === normalized.length) {
    // No legacy Unsplash rows — the merchant's own list wins as-is.
    return normalized;
  }

  const purged = [...kept];
  for (const fallbackImg of DEFAULT_GALLERY_IMAGES) {
    if (!purged.some((img) => img.url === fallbackImg.url)) {
      purged.push({ ...fallbackImg });
    }
  }
  return purged;
}

/**
 * Sanitise a whole `themeConfig` / `theme_config` object: returns a shallow
 * copy with `galleryImages` purged (when the key is present), or `null` when
 * the input is not a usable object.
 */
export function sanitizeStoredThemeConfig(cfg: unknown): Record<string, any> | null {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return null;
  const out: Record<string, any> = { ...(cfg as Record<string, any>) };
  if ('galleryImages' in out) {
    out.galleryImages = sanitizeGalleryImages(out.galleryImages);
  }
  return out;
}

/**
 * Canonicalise a store/merchant record read from any source (MongoDB,
 * Supabase, the local payload file): when the record carries a theme config
 * under EITHER spelling (`themeConfig` or `theme_config`), both keys are set
 * to the SAME sanitised object so every client that reads one spelling or the
 * other sees identical, Unsplash-free data.
 */
export function canonicalizeThemeConfig<T extends object>(record: T | null): T | null {
  if (!record || typeof record !== 'object') return record;
  const raw = (record as any).themeConfig ?? (record as any).theme_config;
  const cfg = sanitizeStoredThemeConfig(raw);
  if (!cfg) return record;
  return { ...record, themeConfig: cfg, theme_config: cfg } as unknown as T;
}

export default {
  DEFAULT_GALLERY_IMAGE_URLS,
  DEFAULT_GALLERY_IMAGES,
  getDefaultGalleryImages,
  isUnsplashGalleryUrl,
  sanitizeGalleryImages,
  sanitizeStoredThemeConfig,
  canonicalizeThemeConfig,
};

