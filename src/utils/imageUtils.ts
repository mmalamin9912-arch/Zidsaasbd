/**
 * Browser-side image downscaling, shared by every upload control.
 *
 * WHY
 * ---
 * Uploads were read with a bare `FileReader.readAsDataURL(file)` and stored
 * verbatim. A 4MB phone photo becomes ~5.4MB of base64 inside the JSON payload,
 * which then hits three separate limits in sequence:
 *
 *   • Express body parser  → HTTP 413 "request entity too large"
 *   • MongoDB document     → 16MB ceiling
 *   • Supabase REST mirror → 400, which reads like a schema error
 *
 * `SingleProductForm` already had a private `optimizeImageForStorefront` that
 * did the right thing — but it only ran when the merchant clicked "Magic
 * Enhance", so a plain upload still sent the full-size original. This is that
 * logic, extracted and applied at the point of upload.
 *
 * CONTRACT
 * --------
 * It NEVER throws and NEVER loses the merchant's image: any failure (no canvas,
 * a decode error, an encode that comes out larger) returns the original string.
 */

/** Longest edge, in pixels, after downscaling. */
export const MAX_IMAGE_EDGE = 1200;

/** Encoder quality for the lossy formats. */
export const IMAGE_QUALITY = 0.85;

/** Above this, the result is re-encoded more aggressively. */
export const SOFT_SIZE_LIMIT = 1_200_000; // ~1.2MB of base64

/**
 * Downscale + re-encode an image for storage.
 *
 * @param source a `data:`/`blob:` URL, or any other string (returned untouched)
 * @returns the optimized `data:` URL, or `source` when optimization is not
 *          possible or would not help
 */
export async function downscaleImage(
  source: string,
  maxEdge: number = MAX_IMAGE_EDGE
): Promise<string> {
  if (!source) return source;
  // Remote URLs are already hosted — never re-encode them.
  if (!/^data:image\//i.test(source) && !/^blob:/i.test(source)) return source;
  if (typeof document === 'undefined' || typeof Image === 'undefined') return source;

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxEdge / Math.max(img.width || 1, img.height || 1));
        const width = Math.max(1, Math.round((img.width || maxEdge) * scale));
        const height = Math.max(1, Math.round((img.height || maxEdge) * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(source);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        const encode = (type: string, quality: number) => {
          try {
            return canvas.toDataURL(type, quality);
          } catch {
            return '';
          }
        };

        // WebP first — much smaller at equal visual quality. A browser that
        // cannot encode it falls back to quality-tuned JPEG rather than a PNG
        // that could be LARGER than the original.
        let encoded = encode('image/webp', IMAGE_QUALITY);
        if (!encoded || !encoded.startsWith('data:image/webp')) {
          encoded = encode('image/jpeg', IMAGE_QUALITY);
        }

        // Still oversized? Drop quality once before giving up. Transparency is
        // already lost by this point, so this costs nothing extra.
        if (encoded && encoded.length > SOFT_SIZE_LIMIT && encoded.startsWith('data:image/jpeg')) {
          const smaller = encode('image/jpeg', 0.6);
          if (smaller && smaller.length < encoded.length) encoded = smaller;
        }

        // Only accept a genuine improvement.
        resolve(encoded && encoded.length < source.length ? encoded : source);
      } catch {
        resolve(source);
      }
    };
    img.onerror = () => resolve(source);
    img.src = source;
  });
}

/**
 * Read a File into a `data:` URL and downscale it in one step.
 *
 * This is the drop-in replacement for `FileReader.readAsDataURL` at an upload
 * control. It resolves with the optimized image and never rejects.
 */
export function readAndDownscaleImage(
  file: File,
  maxEdge: number = MAX_IMAGE_EDGE
): Promise<string> {
  return new Promise<string>((resolve) => {
    if (!file || typeof FileReader === 'undefined') {
      resolve('');
      return;
    }
    // SVG is vector: rasterising it would lose scalability for no size win.
    if (/^image\/svg/i.test(file.type)) {
      const reader = new FileReader();
      reader.onload = (e) => resolve(String(e.target?.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const raw = String(e.target?.result || '');
      if (!raw) {
        resolve('');
        return;
      }
      resolve(await downscaleImage(raw, maxEdge));
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

/** Rough byte size of a base64 data URL (chars ≈ bytes). */
export function dataUrlSize(value: unknown): number {
  return typeof value === 'string' ? value.length : 0;
}

export default {
  downscaleImage,
  readAndDownscaleImage,
  dataUrlSize,
  MAX_IMAGE_EDGE,
  IMAGE_QUALITY,
  SOFT_SIZE_LIMIT,
};