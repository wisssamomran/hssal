import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createHassalApiRouter } from './server/hassal-api';
import { createCommercialApiRouter } from './server/commercial-api';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const LARAVEL_URL = process.env.HASSAL_LARAVEL_URL;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1/commercial', createCommercialApiRouter());

if (LARAVEL_URL) {
  app.use(['/api', '/sanctum'], async (req, res) => {
    try {
      const targetUrl = `${LARAVEL_URL.replace(/\/$/, '')}${req.originalUrl}`;
      const headers: Record<string, string> = {};
      for (const [key, val] of Object.entries(req.headers)) {
        if (key !== 'host' && typeof val === 'string') headers[key] = val;
      }
      const hasBody = !['GET', 'HEAD'].includes(req.method) && req.body !== undefined;
      const response = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: hasBody ? JSON.stringify(req.body) : undefined,
      });
      response.headers.forEach((val, key) => {
        if (key !== 'transfer-encoding') res.setHeader(key, val);
      });
      res.status(response.status);
      res.send(Buffer.from(await response.arrayBuffer()));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gateway error';
      res.status(502).json({
        success: false,
        error: { code: 'GATEWAY_ERROR', message },
      });
    }
  });
} else {
  app.use('/api/v1', createHassalApiRouter());
}

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HASSAL Platform Gateway running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
