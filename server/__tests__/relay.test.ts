import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const PORT = 39123;
const HTTP_URL = `http://localhost:${PORT}`;
const WS_URL = `ws://localhost:${PORT}`;
const ROOM_CODE = 'TEST23';
const AMBIGUOUS_ROOM_CODE = 'TEST01';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SERVER_ENTRY = path.join(ROOT_DIR, 'server', 'dist', 'index.js');

type Json = Record<string, unknown>;

interface Waiter {
  predicate: (message: Json) => boolean;
  resolve: (message: Json) => void;
}

class RelayClient {
  readonly socket: WebSocket;
  private readonly received: Json[] = [];
  private readonly waiters: Waiter[] = [];

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on('message', (raw: unknown) => {
      let message: Json;
      try {
        message = JSON.parse(String(raw)) as Json;
      } catch {
        return;
      }
      this.received.push(message);
      for (let i = this.waiters.length - 1; i >= 0; i--) {
        const waiter = this.waiters[i];
        if (waiter.predicate(message)) {
          this.waiters.splice(i, 1);
          waiter.resolve(message);
        }
      }
    });
  }

  static open(url: string, timeoutMs = 8000): Promise<RelayClient> {
    return new Promise<RelayClient>((resolve, reject) => {
      const socket = new WebSocket(url);
      const client = new RelayClient(socket);
      const timer = setTimeout(() => {
        socket.terminate();
        reject(new Error(`timed out opening websocket to ${url}`));
      }, timeoutMs);
      socket.once('open', () => {
        clearTimeout(timer);
        resolve(client);
      });
      socket.once('error', (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  send(message: Json): void {
    this.socket.send(JSON.stringify(message));
  }

  waitFor(predicate: (message: Json) => boolean, timeoutMs = 8000): Promise<Json> {
    const buffered = this.received.find(predicate);
    if (buffered) return Promise.resolve(buffered);

    return new Promise<Json>((resolve, reject) => {
      const waiter: Waiter = {
        predicate,
        resolve: (message: Json) => {
          clearTimeout(timer);
          resolve(message);
        },
      };
      const timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error(`timed out waiting for relay message; got ${JSON.stringify(this.received)}`));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  waitForType(type: string, timeoutMs = 8000): Promise<Json> {
    return this.waitFor((message) => message.t === type, timeoutMs);
  }

  close(): void {
    try {
      this.socket.removeAllListeners();
      this.socket.close();
      this.socket.terminate();
    } catch {
      // already closed
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no attempt made';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${HTTP_URL}/health`);
      if (response.ok) {
        const body = (await response.json()) as { ok?: boolean };
        if (body.ok === true) return;
        lastError = `unexpected health body ${JSON.stringify(body)}`;
      } else {
        lastError = `status ${response.status}`;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await delay(200);
  }
  throw new Error(`relay did not become healthy on ${HTTP_URL}: ${lastError}`);
}

let relay: ChildProcess | null = null;
const openClients: RelayClient[] = [];

async function openClient(): Promise<RelayClient> {
  const client = await RelayClient.open(WS_URL);
  openClients.push(client);
  return client;
}

beforeAll(async () => {
  if (!existsSync(SERVER_ENTRY)) {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const build = spawnSync(npm, ['run', 'server:build'], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    if (build.status !== 0 || !existsSync(SERVER_ENTRY)) {
      throw new Error(`failed to build relay server: ${build.stderr ?? ''}${build.stdout ?? ''}`);
    }
  }

  relay = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: ROOT_DIR,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  relay.stdout?.setEncoding('utf8');
  relay.stderr?.setEncoding('utf8');
  relay.stdout?.on('data', () => undefined);
  relay.stderr?.on('data', () => undefined);

  await waitForHealth();
});

afterAll(async () => {
  for (const client of openClients.splice(0)) {
    client.close();
  }
  const child = relay;
  if (child && child.exitCode === null) {
    const exited = new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      setTimeout(resolve, 5000);
    });
    child.kill();
    await exited;
  }
  relay = null;
});

describe('relay server integration', () => {
  it('serves a healthy /health endpoint', async () => {
    const response = await fetch(`${HTTP_URL}/health`);
    expect(response.ok).toBe(true);
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('rejects room codes containing ambiguous characters', async () => {
    const client = await openClient();
    client.send({ t: 'join', code: AMBIGUOUS_ROOM_CODE, role: 'host' });
    const error = await client.waitForType('error');
    expect(error.reason).toBe('invalid room code');
    client.close();
  });

  it('relays join, peer-join and data between two peers', async () => {
    const host = await openClient();
    host.send({ t: 'join', code: ROOM_CODE, role: 'host' });

    const hostJoined = await host.waitForType('joined');
    expect(hostJoined.role).toBe('host');
    expect(typeof hostJoined.peerId).toBe('string');

    const guest = await openClient();
    guest.send({ t: 'join', code: ROOM_CODE, role: 'guest' });

    const guestJoined = await guest.waitForType('joined');
    expect(guestJoined.role).toBe('guest');

    const peerJoin = await host.waitForType('peer-join');
    expect(peerJoin.peerId).toBe(guestJoined.peerId);
    expect(peerJoin.role).toBe('guest');

    guest.send({ t: 'data', msg: { hello: 1 } });
    const relayed = await host.waitForType('data');
    expect(relayed.t).toBe('data');
    expect(relayed.from).toBe(guestJoined.peerId);
    expect(relayed.msg).toEqual({ hello: 1 });

    host.send({ t: 'data', msg: { pong: true } });
    const relayedBack = await guest.waitForType('data');
    expect(relayedBack.from).toBe(hostJoined.peerId);
    expect(relayedBack.msg).toEqual({ pong: true });

    guest.close();
    const peerLeave = await host.waitForType('peer-leave');
    expect(peerLeave.peerId).toBe(guestJoined.peerId);

    host.close();
  });
});
