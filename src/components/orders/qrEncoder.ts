/**
 * QR code SVG rendering — turns a QR module matrix into a printable SVG.
 *
 * The matrix itself comes from the battle-tested `qrcode` package
 * (ISO/IEC 18004: full spec compliance, error correction, mask optimisation),
 * so the printed QR is genuinely scannable. This module only does the SVG
 * rendering: dark modules are merged into ONE `<path>` so the SVG is compact
 * enough to inline into the A4 print document (a standalone HTML string written
 * into a popup window and rendered offline — no canvas, no network).
 *
 * Kept separate from PrintLabel so the on-screen previews in OrdersView and
 * the printable document always render the identical code.
 */

/** Quiet-zone modules around the code (spec recommends ≥4 for print). */
const QUIET_ZONE_MODULES = 4;

/**
 * Render a QR module matrix as an inline SVG string.
 *
 * Accepts any matrix shaped like `qrcode`'s `BitMatrix` (an object with
 * `size` and a boolean `data` array indexed `row * size + col`). Returns ''
 * when the matrix is unusable — the caller degrades gracefully rather than
 * printing a broken code.
 */
export function generateQrSvgFromMatrix(modules: any, sizePx = 72): string {
  if (!modules || typeof modules !== 'object') return '';
  const n = Number(modules.size ?? 0);
  const data = modules.data;
  // `qrcode`'s BitMatrix stores `data` as a Uint8Array (0/1 per module), so the
  // guard must accept ANY indexable sequence of length >= n*n — not just plain
  // Arrays — or every real matrix is rejected and the QR renders empty.
  if (!n || n <= 0 || !data || data.length < n * n) return '';

  const total = n + QUIET_ZONE_MODULES * 2;
  let path = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (data[r * n + c]) {
        path += `M${c + QUIET_ZONE_MODULES} ${r + QUIET_ZONE_MODULES}h1v1h-1z`;
      }
    }
  }
  return `<svg viewBox="0 0 ${total} ${total}" width="${sizePx}" height="${sizePx}" ` +
    `xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" ` +
    `role="img" aria-label="Order QR code"><rect width="${total}" height="${total}" fill="#ffffff"/>` +
    `<path d="${path}" fill="#000000"/></svg>`;
}

export default { generateQrSvgFromMatrix };
