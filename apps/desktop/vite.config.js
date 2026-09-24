import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export const DEV_PORT = 5178;

/**
 * Browser-dev only: lets the renderer run in a normal browser (no Electron)
 * by forwarding API calls to the backbone server-side, so the backbone's
 * CORS list doesn't need to know about this dev server. The target comes from
 * the X-Snowman-Target header (http/https only, /v1/ paths only).
 */
function browserDevProxy() {
  return {
    name: 'snowman-browser-dev-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__snowman_proxy', async (req, res) => {
        try {
          const target = new URL(String(req.headers['x-snowman-target'] || ''));
          if (!/^https?:$/.test(target.protocol) || !target.pathname.startsWith('/v1/')) throw new Error('bad target');
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const body = chunks.length ? Buffer.concat(chunks) : undefined;
          const headers = {};
          if (req.headers.authorization) headers.Authorization = req.headers.authorization;
          if (body) headers['Content-Type'] = 'application/json';
          const upstream = await fetch(target, { method: req.method, headers, body });
          res.statusCode = upstream.status;
          res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
          res.end(Buffer.from(await upstream.arrayBuffer()));
        } catch (err) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'dev_proxy_failed', message: err.message }));
        }
      });
    },
  };
}

/** Strict CSP for the packaged renderer (dev needs inline HMR/refresh scripts). */
function productionCsp() {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'snowman-production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
    },
  };
}

export default defineConfig({
  base: './', // the built renderer is loaded from file:// by Electron
  plugins: [react(), browserDevProxy(), productionCsp()],
  server: { port: DEV_PORT, strictPort: true, host: '127.0.0.1' },
  build: { outDir: 'dist', emptyOutDir: true, target: 'chrome140' },
});
