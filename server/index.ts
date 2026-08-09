/**
 * HELL FIRE — co-op relay + static game host (single process).
 *
 * One Node process that:
 *   1. Serves the built browser game from /dist over HTTP
 *      (so players need NOT install anything — they just open the URL)
 *   2. Runs the authoritative WebSocket relay on the SAME port
 *      (so public multiplayer works out of the box, same origin => wss://)
 *
 * The relay does NOT run game logic. It only:
 *   - lets a host open a room with a 6-char code
 *   - lets a guest join that room by code
 *   - relays opaque game messages between the two peers
 *   - notifies peers when someone joins / leaves
 *
 * Run (dev):   npm run server            (relay on :3001, serves /dist if present)
 * Run (prod):  npm run build:all && npm start
 *
 * Deployment: set PORT (hosts do this automatically). The game served by this
 * process connects back to the relay on the same origin, so no extra config
 * is needed. For a PRIVATE relay, players enter its URL in Settings -> Co-op.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT ?? 3001);

// Project root = two levels up from the compiled file (server/dist/index.js)
// or one level up when run via tsx (server/index.ts).
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');
const HAS_BUILD = fs.existsSync(DIST_DIR);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
};

// ---------------------------------------------------------------------------
// Relay state
// ---------------------------------------------------------------------------
interface Client {
  id: string;
  ws: WebSocket;
  room: string | null;
  role: 'host' | 'guest' | null;
}

const clients = new Set<Client>();
const rooms = new Map<string, Client[]>(); // room code -> clients
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

function send(ws: WebSocket, obj: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function roomPeers(room: string): Client[] {
  return rooms.get(room) ?? [];
}

function addToRoom(room: string, client: Client): void {
  const peers = roomPeers(room);
  peers.push(client);
  rooms.set(room, peers);
}

function removeFromRoom(client: Client): void {
  if (!client.room) return;
  const peers = roomPeers(client.room).filter((c) => c.id !== client.id);
  if (peers.length === 0) {
    rooms.delete(client.room);
  } else {
    rooms.set(client.room, peers);
  }
  for (const peer of peers) {
    send(peer.ws, { t: 'peer-leave', peerId: client.id });
  }
  client.room = null;
  client.role = null;
}

// ---------------------------------------------------------------------------
// Static file host
// ---------------------------------------------------------------------------
function safeJoin(base: string, target: string): string | null {
  const p = path.normalize(path.join(base, target));
  const rel = path.relative(base, p);
  if (rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)) return p;
  return null;
}

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): void {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);

  if (urlPath === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, clients: clients.size }));
    return;
  }

  if (urlPath === '/api/rooms') {
    const list = [...rooms.entries()].map(([code, peers]) => ({
      code,
      players: peers.length,
      full: peers.length >= 2,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ rooms: list }));
    return;
  }

  if (!HAS_BUILD) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      '<h1>HELL FIRE — relay running</h1>' +
        '<p>The game build was not found. Run <code>npm run build</code> to produce /dist, ' +
        'then restart the server.</p>' +
        '<p>Relay is live on this port (ws(s)://&lt;this-host&gt;).</p>'
    );
    return;
  }

  const safe = safeJoin(DIST_DIR, urlPath === '/' ? '/index.html' : urlPath);
  if (!safe) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  let filePath: string = safe;
  // SPA fallback: unknown non-file paths serve index.html.
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] ?? 'application/octet-stream';
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    res.writeHead(404);
    res.end('Not found');
  });
  res.writeHead(200, { 'Content-Type': type });
  stream.pipe(res);
}

const server = http.createServer(serveStatic);

// ---------------------------------------------------------------------------
// WebSocket relay (same port as the static host)
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  const client: Client = { id: randomUUID(), ws, room: null, role: null };
  clients.add(client);
  console.log(`[coop] client connected ${client.id.slice(0, 8)} (total ${clients.size})`);

  ws.on('message', (raw) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { t: 'error', reason: 'invalid json' });
      return;
    }

    if (msg.t === 'join') {
      const code = String(msg.code ?? '').toUpperCase();
      const requestedRole = msg.role === 'guest' ? 'guest' : 'host';

      if (!CODE_RE.test(code)) {
        send(ws, { t: 'error', reason: 'invalid room code' });
        return;
      }

      const peers = roomPeers(code);
      // First peer becomes host; a second joining becomes guest.
      let role: 'host' | 'guest';
      if (requestedRole === 'host' || peers.length === 0) {
        role = 'host';
      } else {
        role = 'guest';
      }

      if (peers.length >= 2) {
        send(ws, { t: 'error', reason: 'room full' });
        return;
      }

      client.room = code;
      client.role = role;
      addToRoom(code, client);

      send(ws, {
        t: 'joined',
        peerId: client.id,
        role,
        peers: peers.map((p) => ({ peerId: p.id, role: p.role })),
      });

      for (const peer of peers) {
        send(peer.ws, { t: 'peer-join', peerId: client.id, role });
      }
      console.log(`[coop] ${role} joined room ${code} (size ${roomPeers(code).length})`);
      return;
    }

    if (msg.t === 'leave') {
      removeFromRoom(client);
      return;
    }

    if (msg.t === 'data') {
      if (!client.room) {
        send(ws, { t: 'error', reason: 'not in a room' });
        return;
      }
      // Relay to the OTHER peer(s) in the room only.
      for (const peer of roomPeers(client.room)) {
        if (peer.id !== client.id) {
          send(peer.ws, { t: 'data', from: client.id, msg: msg.msg });
        }
      }
      return;
    }

    send(ws, { t: 'error', reason: `unknown message type: ${msg.t}` });
  });

  ws.on('close', () => {
    removeFromRoom(client);
    clients.delete(client);
    console.log(`[coop] client disconnected ${client.id.slice(0, 8)} (total ${clients.size})`);
  });

  ws.on('error', () => {
    // ignore; close handler does cleanup
  });
});

server.listen(PORT, () => {
  console.log(`[web]  HELL FIRE listening on http://localhost:${PORT}`);
  console.log(`[web]  game build present: ${HAS_BUILD ? 'yes (/dist)' : 'no — run npm run build'}`);
  console.log(`[coop] relay websocket on the same port (ws://localhost:${PORT})`);
});
