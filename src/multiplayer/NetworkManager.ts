// src/multiplayer/NetworkManager.ts
//
// Self-hosted co-op networking. Talks to our own WebSocket relay server
// (see /server) instead of a third-party P2P service. The game logic
// (HostController / GuestController) is unaware of the transport — it only
// uses this class's public API.

import { SyncMessage } from './SyncMessages';
import { validateRoomCode } from './MessageValidator';
import { mpLog } from './DebugLogger';
import { SettingsManager } from '../systems/SettingsManager';

export type ConnectionState = 'disconnected' | 'connecting' | 'waiting' | 'connected' | 'reconnecting';

function signalUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  const viteOverride = env?.VITE_SERVER_URL;
  if (viteOverride) return viteOverride;

  if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).CAPACITOR_SERVER_URL) {
    return (window as unknown as { CAPACITOR_SERVER_URL: string }).CAPACITOR_SERVER_URL;
  }

  if (NetworkManager.getServerUrlOverride()) return NetworkManager.getServerUrlOverride()!;

  const settingsUrl = SettingsManager.getServerUrl();
  if (settingsUrl) return settingsUrl;

  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('hell_fire_relay_url');
    if (stored) return stored;
  }

  // Smart default:
  //  - On localhost we assume the standalone dev relay on :3001.
  //  - When the game is served from a hosted site, the relay runs on the
  //    SAME origin (this combined server), so connect back to it directly.
  if (typeof location !== 'undefined') {
    const host = location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return `ws://${host}:3001`;
    }
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}`;
  }

  return 'ws://localhost:3001';
}

export class NetworkManager {
  private static instance: NetworkManager | null = null;

  private ws: WebSocket | null = null;
  private sendRaw: ((obj: Record<string, unknown>) => void) | null = null;

  private _isHost: boolean = false;
  private _isConnected: boolean = false;
  private _connectionState: ConnectionState = 'disconnected';
  private _peerId: string | null = null;
  private _roomCode: string | null = null;

  private onPeerJoinCallback: ((peerId: string) => void) | null = null;
  private onPeerLeaveCallback: ((peerId: string) => void) | null = null;
  private messageListeners: Map<string, (message: SyncMessage, peerId: string) => void> = new Map();
  private listenerIdCounter: number = 0;
  private onConnectionStateChangeCallback: ((state: ConnectionState) => void) | null = null;

  // Reconnection state
  private intentionalDisconnect: boolean = false;
  private reconnectAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAY_MS = 2000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor() {}

  static getInstance(): NetworkManager {
    if (!NetworkManager.instance) {
      NetworkManager.instance = new NetworkManager();
    }
    return NetworkManager.instance;
  }

  private static serverUrlOverride: string | null = null;

  static setServerUrl(url: string): void {
    NetworkManager.serverUrlOverride = url || null;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('hell_fire_relay_url', url);
    }
  }

  static getServerUrlOverride(): string | null {
    return NetworkManager.serverUrlOverride;
  }

  get isHost(): boolean {
    return this._isHost;
  }

  get isGuest(): boolean {
    return !this._isHost && this._isConnected;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  get isMultiplayer(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  get connectionState(): ConnectionState {
    return this._connectionState;
  }

  get peerId(): string | null {
    return this._peerId;
  }

  get roomCode(): string | null {
    return this._roomCode;
  }

  private setConnectionState(state: ConnectionState): void {
    const prev = this._connectionState;
    this._connectionState = state;
    mpLog.stateChange('Connection', prev, state);
    this.onConnectionStateChangeCallback?.(state);
  }

  generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private setupSocketHandlers(): void {
    if (!this.ws) return;

    this.sendRaw = (obj) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(obj));
      }
    };

    this.ws.onmessage = (event) => {
      let data: any;
      try {
        data = JSON.parse(event.data as string);
      } catch {
        return;
      }

      switch (data.t) {
        case 'joined': {
          this._peerId = data.peerId;
          this._isHost = data.role === 'host';
          this._isConnected = true;
          this.setConnectionState('connected');
          // If the room already had a peer (we joined as guest), treat it as a join.
          if (Array.isArray(data.peers)) {
            for (const p of data.peers) {
              if (p.peerId !== this._peerId) this.onPeerJoinCallback?.(p.peerId);
            }
          }
          break;
        }
        case 'peer-join': {
          this._isConnected = true;
          this.setConnectionState('connected');
          this.reconnectAttempts = 0;
          this.onPeerJoinCallback?.(data.peerId);
          break;
        }
        case 'peer-leave': {
          this._isConnected = false;
          if (this.intentionalDisconnect) {
            this.setConnectionState('disconnected');
            this.onPeerLeaveCallback?.(data.peerId);
            return;
          }
          if (this._isHost) {
            this.setConnectionState('waiting');
          } else {
            this.attemptReconnect();
          }
          this.onPeerLeaveCallback?.(data.peerId);
          break;
        }
        case 'data': {
          const message = data.msg as SyncMessage;
          mpLog.msgReceived(message?.type, data.from);
          this.messageListeners.forEach((callback) => {
            try {
              callback(message, data.from);
            } catch (error) {
              mpLog.error('Network', 'Message handler error', error);
            }
          });
          break;
        }
        case 'error': {
          mpLog.warn('Network', 'Server error: ' + data.reason);
          break;
        }
      }
    };

    this.ws.onclose = () => {
      this.sendRaw = null;
      if (this.intentionalDisconnect) {
        this.setConnectionState('disconnected');
        return;
      }
      // Both host and guest must re-establish the socket so the room is
      // recreated on the server (otherwise co-op stays broken after a drop).
      this.attemptReconnect();
      if (this._isHost) this.onPeerLeaveCallback?.('socket-closed');
    };

    this.ws.onerror = () => {
      // Surfaced as onclose afterwards
    };
  }

  private async attemptReconnect(): Promise<void> {
    if (!this._roomCode || this.intentionalDisconnect) {
      this.setConnectionState('disconnected');
      return;
    }
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      mpLog.error('Network', 'Max reconnect attempts reached, giving up');
      this.setConnectionState('disconnected');
      this.onPeerLeaveCallback?.('reconnect_failed');
      return;
    }

    this.reconnectAttempts++;
    this.setConnectionState('reconnecting');
    mpLog.info('Network', `Reconnect attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS}`);

    await new Promise((resolve) => setTimeout(resolve, this.RECONNECT_DELAY_MS));

    if (this.intentionalDisconnect) {
      this.setConnectionState('disconnected');
      return;
    }

    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
      this.sendRaw = null;
      // Reset so waitForJoined only resolves after we actually re-join the room.
      this._isConnected = false;
      this.connectSocket();
      await this.waitForOpen();
      // Re-join the same room with the same role — the server treats this as a
      // fresh connection and will not relay without this.
      const joinSend = this.sendRaw as ((obj: Record<string, unknown>) => void) | null;
      joinSend?.({ t: 'join', code: this._roomCode, role: this._isHost ? 'host' : 'guest' });
      const connected = await this.waitForJoined(10000);
      if (!connected) throw new Error('Reconnect timeout');
    } catch (error) {
      mpLog.warn('Network', 'Reconnect attempt failed', error);
      this.attemptReconnect();
    }
  }

  private waitForJoined(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        if (this._isConnected && this.ws?.readyState === WebSocket.OPEN) {
          resolve(true);
        } else if (Date.now() - start > timeoutMs) {
          resolve(false);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  private connectSocket(): void {
    this.ws = new WebSocket(signalUrl());
    this.setupSocketHandlers();
  }

  async hostGame(): Promise<string> {
    this._roomCode = this.generateRoomCode();
    this._isHost = true;
    this.intentionalDisconnect = false;
    this.reconnectAttempts = 0;
    mpLog.setRole('HOST');
    mpLog.setRoomCode(this._roomCode);
    mpLog.info('Network', `Hosting game with code: ${this._roomCode}`);
    this.setConnectionState('connecting');

    this.connectSocket();
    // Fire the join once the socket is open.
    await this.waitForOpen();
    this.sendRaw?.({ t: 'join', code: this._roomCode, role: 'host' });
    this.setConnectionState('waiting');
    return this._roomCode;
  }

  async joinGame(roomCode: string): Promise<void> {
    const normalizedCode = roomCode.toUpperCase();
    const validation = validateRoomCode(normalizedCode);
    if (!validation.valid) {
      throw new Error(validation.reason || 'Invalid room code');
    }

    this._roomCode = normalizedCode;
    this._isHost = false;
    this.intentionalDisconnect = false;
    this.reconnectAttempts = 0;
    mpLog.setRole('GUEST');
    mpLog.setRoomCode(normalizedCode);
    mpLog.info('Network', `Joining game with code: ${normalizedCode}`);
    this.setConnectionState('connecting');

    this.connectSocket();
    await this.waitForOpen();
    this.sendRaw?.({ t: 'join', code: this._roomCode, role: 'guest' });

    const connected = await this.waitForJoined(15000);
    if (!connected) {
      this.setConnectionState('disconnected');
      this.disconnect();
      throw new Error('Connection timeout');
    }
  }

  private waitForOpen(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws) return reject(new Error('No socket'));
      if (this.ws.readyState === WebSocket.OPEN) return resolve();
      const onOpen = () => { cleanup(); resolve(); };
      const onErr = () => { cleanup(); reject(new Error('Socket open failed')); };
      const cleanup = () => {
        this.ws?.removeEventListener('open', onOpen);
        this.ws?.removeEventListener('error', onErr);
      };
      this.ws.addEventListener('open', onOpen);
      this.ws.addEventListener('error', onErr);
    });
  }

  send(message: SyncMessage, _targetPeerId?: string): void {
    if (this.sendRaw) {
      mpLog.msgSent(message.type);
      this.sendRaw({ t: 'data', msg: message });
    }
  }

  broadcast(message: SyncMessage): void {
    this.send(message);
  }

  onPeerJoin(callback: (peerId: string) => void): void {
    this.onPeerJoinCallback = callback;
  }

  clearOnPeerJoin(): void {
    this.onPeerJoinCallback = null;
  }

  onPeerLeave(callback: (peerId: string) => void): void {
    this.onPeerLeaveCallback = callback;
  }

  clearOnPeerLeave(): void {
    this.onPeerLeaveCallback = null;
  }

  onMessage(callback: (message: SyncMessage, peerId: string) => void): string {
    const id = `listener_${++this.listenerIdCounter}`;
    this.messageListeners.set(id, callback);
    return id;
  }

  offMessage(listenerId: string): void {
    this.messageListeners.delete(listenerId);
  }

  clearMessageListeners(): void {
    this.messageListeners.clear();
  }

  onConnectionStateChange(callback: (state: ConnectionState) => void): void {
    this.onConnectionStateChangeCallback = callback;
  }

  offConnectionStateChange(): void {
    this.onConnectionStateChangeCallback = null;
  }

  disconnect(): void {
    mpLog.onDisconnect();
    this.intentionalDisconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      try {
        this.sendRaw?.({ t: 'leave' });
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.sendRaw = null;
    this._isHost = false;
    this._isConnected = false;
    this._peerId = null;
    this._roomCode = null;
    this.messageListeners.clear();
    this.reconnectAttempts = 0;
    this.onPeerJoinCallback = null;
    this.onPeerLeaveCallback = null;
    this.onConnectionStateChangeCallback = null;

    this.setConnectionState('disconnected');
  }

  static reset(): void {
    if (NetworkManager.instance) {
      NetworkManager.instance.disconnect();
      NetworkManager.instance = null;
    }
  }
}

export const networkManager = NetworkManager.getInstance();
