import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {fileURLToPath} from 'url';
import {defineConfig} from 'vite';

/*
 * `__dirname` does not exist in an ESM config. Vite normally transpiles this
 * file to CJS (where it works), but a config loader that keeps it as ESM would
 * throw `__dirname is not defined` — before any alias applies — which is one way
 * a build can silently emit a bundle with a SECOND copy of React.
 */
const here = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));

/*
 * ONE COPY OF REACT, ALWAYS.
 *
 * "Cannot read properties of null (reading 'useState')" /
 * "… (reading '__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE')"
 * has exactly two causes:
 *
 *   1. Two React copies in the graph. `react-dom` installs the hook dispatcher on
 *      the internals object of the React IT imports; a component that got the
 *      OTHER copy sees `internals.H === null` and every hook throws.
 *   2. A hook called outside a render (module scope, a service, a lazy chunk
 *      that runs before `createRoot()`). The dispatcher is `null` there too, so
 *      the same message appears even with a single copy.
 *
 * (1) is prevented here: `dedupe` alone is not enough, because it does not touch
 * an `import` that resolves to a NESTED `node_modules/react` — an absolute alias
 * for every React entry point does. `optimizeDeps`/`ssr.noExternal` keep the
 * same guarantee for the dev server and for `server.ts`.
 *
 * (2) is prevented in src: pure modules (`utils/imageFallback.ts`,
 * `lib/marketplaceBasket.ts`) must not import React, and hooks live in files
 * that only components import.
 */
const REACT_MODULES = ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-is'];

const reactAliases = REACT_MODULES.flatMap((pkg) => {
  const isMain = pkg === 'react' || pkg === 'react-dom';
  const aliases = [{find: new RegExp(`^${pkg.replace('/', '\\/')}$`), replacement: path.resolve(here, 'node_modules', pkg)}];
  if (isMain) {
    // `react-dom/client`, `react-dom/server` … must resolve inside the SAME copy.
    aliases.push({find: new RegExp(`^${pkg.replace('/', '\\/')}\\/`), replacement: `${path.resolve(here, 'node_modules', pkg)}/`});
  }
  return aliases;
});

export default defineConfig(() => {
  return {
    plugins: [tailwindcss(), react()],
    resolve: {
      alias: [
        ...reactAliases,
        {find: '@', replacement: path.resolve(here, '.')},
      ],
      dedupe: REACT_MODULES,
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
    },
    ssr: {
      // `server.ts` renders nothing, but it imports modules that touch React
      // types; merging them into the one copy keeps dev and prod identical.
      noExternal: ['react', 'react-dom'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
