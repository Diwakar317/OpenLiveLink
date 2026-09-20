import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'fs';
import path from 'path';

// Custom plugin to serve Vercel API routes locally during `vite dev`
const vercelApiPlugin = () => ({
  name: 'vercel-api-server',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url.startsWith('/api/')) {
        try {
          const urlObj = new URL(req.url, 'http://localhost');
          const apiPath = path.join(process.cwd(), urlObj.pathname + '.js');
          
          if (fs.existsSync(apiPath)) {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', async () => {
              try { req.body = body ? JSON.parse(body) : {}; } catch (e) { req.body = {}; }
              req.query = Object.fromEntries(urlObj.searchParams);
              
              res.status = (code) => { res.statusCode = code; return res; };
              res.json = (data) => {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
              };
              
              const env = loadEnv('development', process.cwd(), '');
              Object.assign(process.env, env);
              
              const moduleUrl = `file://${apiPath.replace(/\\/g, '/')}?update=${Date.now()}`;
              const apiModule = await import(moduleUrl);
              await apiModule.default(req, res);
            });
            return;
          }
        } catch (err) {
          console.error('API Error:', err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
          return;
        }
      }
      next();
    });
  }
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    vercelApiPlugin(),
  ],
});
