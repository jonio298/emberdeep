/* Emberdeep standalone server: serves the game AND the co-op WebSocket on one port.
 * No Redis needed (rooms live in memory, which is correct for a single running instance).
 *   npm start                 -> http://localhost:3000   (phones on the same Wi-Fi: http://<PC-IP>:3000)
 * Works as-is on Render / Railway / Fly.io / any Node host (it honours PORT).
 * Set REDIS_URL only if you ever run several instances.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { wss } from './api/ws.js';
import { handleStats, recordView, statsKeyNote } from './stats.js';
import { handleFeedback } from './feedback.js';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PORT) || 3000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.webp': 'image/webp' };
// Only the game's own files are served: never dotfiles, server code, node_modules or tests.
const BLOCKED = /^\/(\.|node_modules\/|api\/|tests\/|data\/|server\.js|stats\.js|feedback\.js|package(-lock)?\.json|vercel\.json)/;

const server = createServer(async (req, res) => {
  try {
    if (handleFeedback(req, res)) return; // the beta tester notepad: POST /api/feedback (saved, and emailed when configured)
    if (handleStats(req, res, () => wss.clients.size)) return; // /stats, /api/stats (private, needs the key) and the /api/hit beacon
    let path = decodeURIComponent((req.url || '/').split('?')[0]);
    if (path.endsWith('/')) path += 'index.html';
    if (path === '/index.html' && req.method === 'GET') recordView(req); // one count per load of the game page
    if (BLOCKED.test(path) || path.includes('\u0000')) { res.statusCode = 404; return res.end('Not found'); }
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) { res.statusCode = 403; return res.end('Forbidden'); }
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    res.setHeader('Content-Type', TYPES[extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end('Not found'); }
});
server.on('upgrade', (req, socket, head) => {
  if ((req.url || '').split('?')[0] !== '/api/ws') return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(statsKeyNote());
  console.log('Emberdeep is running:  http://localhost:' + PORT);
  for (const list of Object.values(networkInterfaces()))
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log('  on your network (phones): http://' + a.address + ':' + PORT);
});
