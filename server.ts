// Load local env BEFORE any other import runs, so that MONGODB_URI and friends
// are populated for server-side code in local dev. Explicitly includes
// `.env.local`, which bare `dotenv/config` does NOT read (it only loads `.env`).
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'], quiet: true });
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import app from './lib/serverApp.js';

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      // This server is started through tsx rather than `vite`; explicitly load
      // the project config so the React and Tailwind plugins are always active.
      configFile: path.resolve(process.cwd(), 'vite.config.ts'),
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Only bind a port for local dev / traditional Node hosting. On Vercel
// (serverless) the app is imported by api/index.ts and must NOT call
// app.listen(), otherwise the function hangs and every /api/* route 500s.
if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
  startServer();
}

export default app;
