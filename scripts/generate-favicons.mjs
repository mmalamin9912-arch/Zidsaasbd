/**
 * Regenerate the raster brand icons from the vector brand mark.
 *
 *   node scripts/generate-favicons.mjs
 *
 * Why a browser: `public/favicon.svg` is the source of truth for the brand mark.
 * The project ships no SVG rasteriser (no sharp / resvg), but a Chromium build
 * is already present for Playwright — so we open the SVG in a page, draw it to a
 * canvas at the exact pixel size we need and let the browser do the rasterising.
 * That renders gradients, strokes and opacity exactly as a user sees them.
 *
 * Outputs (all overwritten, all committed):
 *   public/favicon-48.png        48x48   browser tab + Google search result
 *   public/favicon-192.png      192x192  Android / PWA install
 *   public/apple-touch-icon.png 180x180  iOS home screen (opaque, no alpha)
 *   public/logo.png             512x512  brand / Open Graph / JSON-LD logo
 *   public/favicon.ico          multi-size (16/32/48) PNG-in-ICO for legacy + crawlers
 *
 * ICO note: the ICO container stores PNG payloads (supported since IE11 and by
 * every browser and crawler today), so no extra image library is required.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, '../public');

// Playwright (patchright) lives in the editor's extension; fall back to a local one.
const DRIVER_CANDIDATES = [
  'C:/Users/Dell/.vscode/extensions/danielsanmedium.dscodegpt-3.24.81/standalone/node_modules/patchright',
  'patchright',
  'playwright',
];

function loadDriver() {
  for (const id of DRIVER_CANDIDATES) {
    try {
      return require(id);
    } catch { /* try the next one */ }
  }
  throw new Error(`No browser driver found. Tried: ${DRIVER_CANDIDATES.join(', ')}`);
}

const svg = readFileSync(resolve(publicDir, 'favicon.svg'), 'utf8');

/** Use a browser already on this machine rather than downloading one. */
const INSTALLED_CHROMIUM = 'C:/Users/Dell/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';

/** Rasterise the brand SVG at `size` px. `opaque` flattens alpha onto the badge colour. */
async function rasterise(page, size, opaqueBackground) {
  const dataUrl = await page.evaluate(
    async ({ svgMarkup, size, opaqueBackground }) => {
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgMarkup);
      await img.decode();

      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      // iOS masks the icon on black; a transparent PNG would show black corners.
      if (opaqueBackground) {
        ctx.fillStyle = opaqueBackground;
        ctx.fillRect(0, 0, size, size);
      }
      ctx.drawImage(img, 0, 0, size, size);
      return canvas.toDataURL('image/png');
    },
    { svgMarkup: svg, size, opaqueBackground }
  );
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/** Build an .ico container holding PNG payloads. */
function buildIco(pngBuffers) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngBuffers.length, 4); // image count

  const entries = [];
  let offset = 6 + 16 * pngBuffers.length;
  pngBuffers.forEach(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width  (0 means 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette colours
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8); // payload size
    entry.writeUInt32LE(offset, 12); // payload offset
    entries.push(entry);
    offset += png.length;
  });

  return Buffer.concat([header, ...entries, ...pngBuffers.map((p) => p.png)]);
}

async function main() {
  const { chromium } = loadDriver();
  const executablePath = process.env.CODEGPT_BROWSER_PATH || (existsSync(INSTALLED_CHROMIUM) ? INSTALLED_CHROMIUM : undefined);
  const browser = await chromium.launch({ executablePath });
  const page = await browser.newPage();

  const results = [];
  try {
    const targets = [
      { file: 'favicon-48.png', size: 48, opaque: null },
      { file: 'favicon-192.png', size: 192, opaque: null },
      { file: 'apple-touch-icon.png', size: 180, opaque: '#0f172a' },
      { file: 'logo.png', size: 512, opaque: null },
    ];

    for (const target of targets) {
      const png = await rasterise(page, target.size, target.opaque);
      writeFileSync(resolve(publicDir, target.file), png);
      results.push({ file: target.file, bytes: png.length });
    }

    const icoSizes = [16, 32, 48];
    const icoParts = [];
    for (const size of icoSizes) {
      icoParts.push({ size, png: await rasterise(page, size, null) });
    }
    const ico = buildIco(icoParts);
    writeFileSync(resolve(publicDir, 'favicon.ico'), ico);
    results.push({ file: 'favicon.ico', bytes: ico.length, contains: icoSizes.join('/') });
  } finally {
    await browser.close();
  }

  console.table(results);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
