// Tiny static server for apps/web/dist (SPA fallback). No dependency on `vite preview`.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

export function serveDist(root, port) {
  const server = http.createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = join(root, path === '/' ? 'index.html' : path);
    let body;
    try { body = await readFile(file); } catch { file = join(root, 'index.html'); body = await readFile(file); }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
