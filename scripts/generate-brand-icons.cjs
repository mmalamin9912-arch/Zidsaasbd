/**
 * Generates the brand raster icons consumed by Google Search (favicon.ico,
 * logo.png, apple-touch-icon) from `public/favicon.svg`.
 *
 * Google ignores SVG favicons and wants a crawlable raster icon — without one
 * the Search result falls back to the generic globe. The generated files are
 * committed to `public/`, so this script only needs re-running when the brand
 * mark changes: `node scripts/generate-brand-icons.cjs`.
 *
 * Uses whatever Chrome/Edge is already installed (headless screenshot), so it
 * adds no dependency to the app.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SVG_PATH = path.join(PUBLIC_DIR, 'favicon.svg');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

function findChrome() {
  const found = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!found) throw new Error('No Chrome/Edge binary found - set CHROME_PATH.');
  return found;
}

/** Wrap PNG frames in an ICO container (Vista+ style, PNG payload). */
function encodeIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(frames.length, 4);

  const entries = [];
  let offset = 6 + frames.length * 16;
  for (const { size, buffer } of frames) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette colours
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += buffer.length;
    entries.push(entry);
  }

  return Buffer.concat([header, ...entries, ...frames.map((f) => f.buffer)]);
}

const svg = fs.readFileSync(SVG_PATH, 'utf8');
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zid-icons-'));
const chrome = findChrome();

/** Render the brand mark at `size` px and return the PNG bytes. */
function render(size) {
  const html = `<!doctype html><html><body style="margin:0;background:transparent">
    ${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}
  </body></html>`;
  const htmlPath = path.join(workDir, `icon-${size}.html`);
  const pngPath = path.join(workDir, `icon-${size}.png`);
  fs.writeFileSync(htmlPath, html);

  execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--default-background-color=00000000',
    `--window-size=${size},${size}`,
    `--screenshot=${pngPath}`,
    `file:///${htmlPath.replace(/\\/g, '/')}`,
  ], { stdio: 'ignore' });

  return fs.readFileSync(pngPath);
}

const PNG_TARGETS = [
  { file: 'favicon-48.png', size: 48 },
  { file: 'logo.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

for (const { file, size } of PNG_TARGETS) {
  fs.writeFileSync(path.join(PUBLIC_DIR, file), render(size));
  console.log(`wrote public/${file} (${size}x${size})`);
}

const icoFrames = [16, 32, 48].map((size) => ({ size, buffer: render(size) }));
fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), encodeIco(icoFrames));
console.log('wrote public/favicon.ico (16, 32, 48)');

fs.rmSync(workDir, { recursive: true, force: true });
