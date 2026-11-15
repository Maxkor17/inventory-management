// Static file server that mimics GitHub Pages for a project site:
// the built app is only reachable under /<repo>/ and everything else is a 404.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8',
};

export function startServer({ port = 4173, prefix = '/inventory-management/' } = {}) {
  const root = resolve(fileURLToPath(new URL('../../dist', import.meta.url)));
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (!url.pathname.startsWith(prefix)) { res.writeHead(404); res.end('Not found'); return; }
      let rel = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html';
      let file = normalize(join(root, rel));
      if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
      const st = await stat(file).catch(() => null);
      if (st?.isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file).catch(() => null);
      if (!body) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok({ server, url: `http://127.0.0.1:${port}${prefix}` })));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { url } = await startServer();
  console.log('Serving dist at', url);
}
