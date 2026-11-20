/**
 * Verifies a PRODUCTION build of the bundle at the module-graph level.
 *
 * The dashboard used to die with
 *   Uncaught TypeError: Cannot read properties of null (reading 'useState')
 * which is React 19's hook dispatcher (`React.__CLIENT_INTERNALS_….H`) still
 * being `null` — either because a second React copy exists, or because a hook
 * ran outside a render.
 *
 * This script proves BOTH are impossible in the built bundle:
 *   1. exactly ONE React runtime and ONE ReactDOM renderer are bundled, and the
 *      three of them (jsx-runtime, react, react-dom-client) share one factory
 *      (`Om()` — the module instance every ReactDOM copy binds its dispatcher to);
 *   2. the pure, non-component modules (`imageFallback`, `marketplaceBasket`)
 *      contain no hook call at all.
 *
 * Usage: node scripts/verify-bundle.cjs [dist/assets/index-*.js]
 */
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist', 'assets');
const file =
  process.argv[2] ||
  fs
    .readdirSync(distDir)
    .filter((name) => /^index-.*\.js$/.test(name))
    .map((name) => path.join(distDir, name))
    .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];

if (!file) {
  console.error('No bundle found in dist/assets — run `npm run build` first.');
  process.exit(1);
}

const code = fs.readFileSync(file, 'utf8');
const count = (re) => (code.match(re) || []).length;
const problems = [];

console.log('bundle:', path.basename(file), '(' + (code.length / 1024).toFixed(0) + ' kB)');

// 1. One copy of each React runtime file.
const runtimes = {
  'react.production.js': /react\.production\.js/g,
  'react-dom.production.js': /react-dom\.production\.js/g,
  'react-dom-client.production.js': /react-dom-client\.production\.js/g,
  'react-jsx-runtime.production.js': /react-jsx-runtime\.production\.js/g,
};
for (const [name, re] of Object.entries(runtimes)) {
  const n = count(re);
  console.log(`  ${name.padEnd(32)} x${n}`);
  if (n > 1) problems.push(`${n} copies of ${name}`);
  if (n === 0) problems.push(`${name} missing from the bundle`);
}

// 2. The bundled React modules must all bind ONE shared module instance.
//    Rollup emits `var XX = <instance>();` at each importing module, where
//    `<instance>` is the single memoised factory — so the count of those
//    bindings proves nobody resolved React from a second location. The bare
//    factory declaration (`var Z;function F(){…}`) is not counted.
const instances = count(/(?:^|[;}])(?:var|let|const)\s+[A-Za-z_$][\w$]*\s*=\s*[A-Za-z_$][\w$]*\(\)/g);
console.log(`  React module instance bindings   x${instances}`);
if (instances < 5) problems.push(`only ${instances} module-instance bindings — some module resolved React elsewhere`);

// 3. One dispatcher holder.
const dispatchers = count(/H:null,A:null,T:null,S:null/g);
console.log(`  hook dispatcher objects          x${dispatchers}`);
if (dispatchers !== 1) problems.push(`${dispatchers} hook dispatcher objects (expected 1)`);
const internalsExport = count(/__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=/g);
if (internalsExport !== 1) problems.push(`${internalsExport} internals exports (expected 1)`);

// 4. React 19's own duplicate-copy guard must not have been compiled in twice.
const hookGuards = count(/Invalid hook call/g);
console.log(`  "Invalid hook call" guards       x${hookGuards}`);
if (hookGuards > 0) problems.push('a second React development build is bundled');

// 5. No hook call in the helper modules that non-component code imports.
for (const helper of ['imageFallback', 'marketplaceBasket']) {
  const pure = [`src/utils/${helper}.ts`, `src/lib/${helper}.ts`].find((p) =>
    fs.existsSync(path.join(__dirname, '..', p)),
  );
  if (!pure) continue;
  const src = fs.readFileSync(path.join(__dirname, '..', pure), 'utf8');
  const hookImport = /from\s+['"]react['"]/.test(src);
  const hookCall = /\buse[A-Z]\w*\s*\(/.test(src);
  console.log(`  ${pure.padEnd(32)} react import: ${hookImport ? 'YES' : 'no'}`);
  if (hookImport || hookCall) problems.push(`${pure} imports/calls a React hook — pure modules must not`);
}

if (problems.length) {
  console.error('\nFAILED:');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('\nOK — one React copy, one dispatcher, no hooks in pure modules.');
