/**
 * Regenerate the raster brand icons from the brand logo.
 *
 *   node scripts/generate-favicons.mjs
 *
 * SOURCE OF TRUTH: `src/assets/logo.png` — the blue "Zid SaaS BD" interlocking
 * mark. This file is only ever READ; the script never writes to it.
 *
 * Earlier versions of this script rasterised `public/favicon.svg`, which is an
 * OLD, UNRELATED gold bridge mark. That silently overwrote the blue logo with
 * the wrong asset (commit 872f41c). Do not reintroduce a vector source here
 * unless it is actually derived from the blue brand mark.
 *
 * Why a browser: the project ships no image library (no sharp / resvg / canvas).
 * A Chromium build is already present for Playwright, so we load the logo into a
 * page and let the browser resample it at each exact pixel size — one decoder,
 * consistent colour handling, proper alpha.
 *
 * Outputs (all overwritten, all committed):
 *   public/logo.png             512x512  brand / OG / JSON-LD / every <img src="/logo.png">
 *   public/favicon-48.png        48x48   browser tab + Google search result
 *   public/favicon-192.png      192x192  Android / PWA install
 *   public/apple-touch-icon.png 180x180  iOS home screen (opaque)
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
const rootDir = resolve(here, '..');
const publicDir = resolve(rootDir, 'public');

/** The canonical blue brand mark. Read-only. */
const SOURCE_LOGO = resolve(rootDir, 'src/assets/logo.png');

/** Backdrop for iOS, which composites the icon without a transparent layer. */
const IOS_BACKDROP = '#0b1220';

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

/** Use a browser already on this machine rather than downloading one. */
const INSTALLED_CHROMIUM = 'C:/Users/Dell/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';

const logoBuffer = readFileSync(SOURCE_LOGO);
const logoDataUrl = `data:image/png;base64,${logoBuffer.toString('base64')}`;

/**
 * Resample the logo to `size` px square.
 *
 * The source is drawn "contain" — scaled to fit inside the square box and
 * centred — so a non-square or differently-padded logo is never stretched or
 * cropped, and the result is always exactly `size` x `size` as the favicon
 * `sizes` attribute (and Google) requires.
 */
async function rasterise(page, size, opaqueBackground) {
  const dataUrl = await page.evaluate(
    async ({ source, size, opaqueBackground }) => {
      const img = new Image();
      img.src = source;
      await img.decode();

      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      if (opaqueBackground) {
        ctx.fillStyle = opaqueBackground;
        ctx.fillRect(0, 0, size, size);
      }

      const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      ctx.drawImage(img, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);

      return canvas.toDataURL('image/png');
    },
    { source: logoDataUrl, size, opaqueBackground }
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
  if (!existsSync(SOURCE_LOGO)) {
    throw new Error(`Brand logo not found: ${SOURCE_LOGO}`);
  }
  const isPng = logoBuffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  console.log(`Source: src/assets/logo.png (${logoBuffer.length} bytes, ${isPng ? 'PNG' : 'NOT PNG'})\n`);

  const { chromium } = loadDriver();
  const executablePath = process.env.CODEGPT_BROWSER_PATH || (existsSync(INSTALLED_CHROMIUM) ? INSTALLED_CHROMIUM : undefined);
  const browser = await chromium.launch({ executablePath });
  const page = await browser.newPage();

  const results = [];
  try {
    const targets = [
      { file: 'logo.png', size: 512, opaque: null },
      { file: 'favicon-48.png', size: 48, opaque: null },
      { file: 'favicon-192.png', size: 192, opaque: null },
      { file: 'apple-touch-icon.png', size: 180, opaque: IOS_BACKDROP },
    ];

    for (const target of targets) {
      const png = await rasterise(page, target.size, target.opaque);
      writeFileSync(resolve(publicDir, target.file), png);
      results.push({ file: target.file, size: `${target.size}x${target.size}`, bytes: png.length });
    }

    const icoSizes = [16, 32, 48];
    const icoParts = [];
    for (const size of icoSizes) {
      icoParts.push({ size, png: await rasterise(page, size, null) });
    }
    const ico = buildIco(icoParts);
    writeFileSync(resolve(publicDir, 'favicon.ico'), ico);
    results.push({ file: 'favicon.ico', size: icoSizes.join('/'), bytes: ico.length });
  } finally {
    await browser.close();
  }

  console.table(results);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
