# Multiplayer Protocol

> Comprehensive technical documentation for the HELL FIRE cooperative multiplayer system.

> **Architecture note:** This document describes the **current self-hosted WebSocket relay** model. Older plans that reference Trystero/WebRTC P2P are obsolete (see `docs/plans/2025-12-27-multiplayer-coop-implementation.md`, which is superseded by this document).

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Connection Flow](#connection-flow)
3. [Server URL Selection](#server-url-selection)
4. [Message Types Reference](#message-types-reference)
5. [State Synchronization](#state-synchronization)
6. [Host Responsibilities](#host-responsibilities)
7. [Guest Responsibilities](#guest-responsibilities)
8. [Anti-Cheat Validation](#anti-cheat-validation)
9. [Sequence Diagrams](#sequence-diagrams)

---

## Architecture Overview

### Self-hosted WebSocket Relay

The multiplayer system uses our **own self-hosted WebSocket relay** (`server/index.ts`). There is **no peer-to-peer (P2P) layer, no WebRTC, and no third-party signaling service**. The browser game is a plain WebSocket client (`src/multiplayer/NetworkManager.ts`) that connects to the relay and exchanges JSON envelopes.

```
┌─────────────────┐                    ┌──────────────────────┐      ┌─────────────────┐
│                 │   WebSocket (ws)   │                      │      │                 │
│   Host Client   │◄──────────────────►│   Relay Server       │◄────►│   Guest Client  │
│   (Authority)   │   same origin or   │   (server/index.ts)  │      │    (Helper)     │
│                 │   configured URL   │   relays opaque data │      │                 │
└─────────────────┘                    └──────────────────────┘      └─────────────────┘
```

**Key facts (from `server/index.ts`):**
- A single Node process **serves the built game from `/dist` over HTTP** *and* runs the **authoritative WebSocket relay on the SAME port** (default `3001`, overridable via `PORT`).
- The relay runs **no game logic**. It only:
  - Lets a host open a room with a 6-character code.
  - Lets a guest join that room by code.
  - Relays opaque game messages between the two peers.
  - Notifies peers when someone joins / leaves.
- HTTP endpoints:
  - `GET /health` → `{ ok: true, rooms, clients }`
  - `GET /api/rooms` → `{ rooms: [{ code, players, full }] }`
  - `WS <connect>` → the relay socket (transport for all co-op traffic).

### No P2P / No Trystero

Unlike a P2P design:
- **No dedicated game server logic** — the relay only forwards messages; the host client remains authoritative for game state.
- **No signaling servers** — connections are plain WebSocket connections to a single relay URL.
- **No WebRTC / DataChannels / `appId`** — all transport is `WebSocket` JSON envelopes.

### Host Authority Model

The game uses a **host-authoritative** model where one player (the host) is the source of truth for game state:

| Aspect | Host | Guest |
|--------|------|-------|
| Game State | Authoritative | Receives updates |
| Enemy AI | Executes | Renders only |
| Damage Calculation | Validates & applies | Sends requests |
| Room Progression | Controls | Follows |
| Loot Drops | Spawns | Sees & picks up |

---

## Connection Flow

### Room Codes

- 6 characters from charset: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
- Excludes ambiguous characters (`0`, `O`, `I`, `1`, `L`).
- The server validates with `/^[A-HJ-NP-Z2-9]{6}$/`.
- Example: `X7K3NP`
- Both clients derive the **identical dungeon seed** from the room code (see [Dungeon Seeding](#dungeon-seeding)).

### WebSocket Message Envelope

All traffic between client and relay is a JSON object with a `t` ("type") field. The envelope types are:

| `t` | Direction | Payload | Meaning |
|-----|-----------|---------|---------|
| `join` | client → server | `{ code, role: 'host' \| 'guest' }` | Request to open (host) or join (guest) a room |
| `leave` | client → server | — | Leave the current room |
| `data` | client → server | `{ msg }` | Opaque game message to forward to the other peer |
| `joined` | server → client | `{ peerId, role, peers: [{ peerId, role }] }` | Confirmed membership in the room |
| `peer-join` | server → client | `{ peerId, role }` | Another peer joined |
| `peer-leave` | server → client | `{ peerId }` | A peer disconnected |
| `data` | server → client | `{ from, msg }` | Relayed game message from the other peer |
| `error` | server → client | `{ reason }` | Invalid JSON, invalid room code, room full, not in a room, unknown type |

**Room assignment:** the first peer to `join` a code becomes the **host**; the second becomes the **guest**. A third join is rejected with `{ t: 'error', reason: 'room full' }`.

**Relay behavior:** a `data` message from one peer is forwarded only to the *other* peer in the room, wrapped as `{ t: 'data', from: <senderPeerId>, msg: <original msg> }`. The `msg` payload is the game-level `SyncMessage` defined in `SyncMessages.ts`.

### Host Creation / Join Process

```
┌──────────────────────────────────────────────────────────────────┐
│                      ROOM CREATION FLOW                          │
└──────────────────────────────────────────────────────────────────┘

Host Client                              Relay Server
    │                                           │
    │  1. hostGame()                            │
    │  ─────────────────────────────────────►   │
    │     (WS connect, then                     │
    │      {t:'join', code, role:'host'})       │
    │                                           │
    │  2. {t:'joined', peerId, role:'host'}     │
    │  ◄─────────────────────────────────────   │
    │                                           │
    │  3. State: 'waiting'                      │
    │     Display room code to player           │
    │                                           │
```

**Room Code Generation** (client): 6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (see above).

```
┌──────────────────────────────────────────────────────────────────┐
│                        JOIN FLOW                                 │
└──────────────────────────────────────────────────────────────────┘

Guest Client                             Relay Server
    │                                           │
    │  1. joinGame(roomCode)                    │
    │  ─────────────────────────────────────►   │
    │     (WS connect, then                     │
    │      {t:'join', code, role:'guest'})      │
    │                                           │
    │  2. {t:'joined', role:'guest', peers:[host]}│
    │  ◄─────────────────────────────────────   │
    │     + {t:'peer-join'} to host              │
    │                                           │
    │  3. State: 'connected'                     │
    │                                           │
```

### Reconnection

The client supports automatic reconnection. `NetworkManager` keeps the active `roomCode` and role, and on socket `close` (unless the disconnect was intentional) it:

1. Sets state to `reconnecting`.
2. Waits `RECONNECT_DELAY_MS` (2000ms).
3. Re-opens the WebSocket and re-sends `{ t: 'join', code, role }` for the **same room and role** — the relay treats this as a fresh connection (host returns to `waiting`, guest re-discovers the host).
4. Retries up to `MAX_RECONNECT_ATTEMPTS` (5); each attempt has a 10s (`waitForJoined`) timeout.

```
┌──────────────────────────────────────────────────────────────────┐
│                    RECONNECTION FLOW                             │
└──────────────────────────────────────────────────────────────────┘

   Host                                             Guest
    │                                                  │
    │  1. Connection Lost                              │
    │     onPeerLeave() triggered (peer-leave)         │
    │                                                  │
    │  2. State: 'waiting'                             │
    │     (Shows "Waiting for                          │
    │      guest to reconnect")                        │
    │                                                  │
    │                               3. State: 'reconnecting'
    │                                  attemptReconnect()
    │                                                  │
    │                               4. Re-open WS      │
    │                                  Re-join same code/role
    │                                                  │
    │  5. onPeerJoin()                                 │
    │◄════════════════════════════════════════════════►│
    │  6. State: 'connected'                           │
    │     sendInitialState()                           │
    │                                                  │
```

**Reconnection Parameters:**
- `MAX_RECONNECT_ATTEMPTS`: 5
- `RECONNECT_DELAY_MS`: 2000ms (2 seconds between attempts)
- Reconnect timeout per attempt: 10 seconds

### Dungeon Seeding

Both clients must explore the **same dungeon**. `src/scenes/game/GameSceneInit.ts` seeds the `DungeonGenerator` with the room code when in multiplayer:

```typescript
// GameSceneInit.ts
const dungeonSeed = networkManager.isMultiplayer ? networkManager.roomCode : undefined;
const dungeonGenerator = new DungeonGenerator(DUNGEON_WIDTH, DUNGEON_HEIGHT, dungeonSeed ?? undefined);
```

Because the room code is identical on both clients and the generator is deterministic, both sides build an identical dungeon without transmitting the full layout over the network.

---

## Server URL Selection

`NetworkManager.signalUrl()` picks the relay WebSocket URL using the following precedence (first match wins):

1. **`VITE_SERVER_URL`** — Vite build-time env override.
2. **`CAPACITOR_SERVER_URL`** — present when running inside a Capacitor native shell.
3. **In-memory override** — `NetworkManager.setServerUrl(url)` / `getServerUrlOverride()` (also persisted to `localStorage`).
4. **`SettingsManager.getServerUrl()`** — user setting from the Co-op Server UI.
5. **`localStorage['hell_fire_relay_url']`** — last manually entered relay URL.
6. **Automatic default**:
   - On `localhost` / `127.0.0.1` → `ws://<host>:3001` (the standalone dev relay).
   - On a hosted site → **same origin**, using `wss:` when the page is HTTPS and `ws:` otherwise: `${proto}//${location.host}`. This is why the combined `server/index.ts` works out of the box — the game is served by the same process that runs the relay.

**Co-op Server presets (Settings UI):**
- **LOCAL** — clears the configured URL and falls back to automatic (dev) selection.
- **PUBLIC** — sets the URL to the relay bundled with the hosted site (same origin).
- **PRIVATE** — prompts the player to enter their own relay URL (e.g. `wss://my-server.com`).

---

## Message Types Reference

All game-level messages are defined in `SyncMessages.ts` and transmitted inside the relay `data` envelope (`{ t: 'data', msg: <SyncMessage> }`). The relay forwards them opaquely; only the host/guest controllers interpret them.

### Host to Guest Messages

#### `HOST_STATE`
Periodic host player status update.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.HOST_STATE` | Message identifier |
| `hp` | `number` | Current health points |
| `maxHp` | `number` | Maximum health points |
| `level` | `number` | Player level |
| `gold` | `number` | Gold amount |

**Sent:** Every 1000ms (1 update/sec)
**Purpose:** Keep guest informed of host's stats for UI display and helper scaling

---

#### `ENEMY_SPAWN`
Notification of new enemy creation.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.ENEMY_SPAWN` | Message identifier |
| `id` | `string` | Unique enemy identifier (e.g., `enemy_1`) |
| `enemyType` | `string` | Enemy class type |
| `x` | `number` | Spawn X position |
| `y` | `number` | Spawn Y position |
| `hp` | `number` | Current HP |
| `maxHp` | `number` | Maximum HP |

**Sent:** When a new enemy is spawned in the game world
**Purpose:** Guest creates visual representation of enemy

---

#### `ENEMY_UPDATE`
Batch update of all active enemy states.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.ENEMY_UPDATE` | Message identifier |
| `enemies` | `Array<EnemyState>` | Array of enemy states |

**EnemyState Object:**
| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Enemy identifier |
| `x` | `number` | Current X position |
| `y` | `number` | Current Y position |
| `hp` | `number` | Current HP |
| `maxHp` | `number` | Maximum HP |
| `texture` | `string` | Sprite texture key |
| `state` | `string` | AI state (idle, chase, attack, etc.) |
| `facing` | `string` | Direction facing |

**Sent:** Every 50ms (20 updates/sec)
**Purpose:** Synchronize enemy positions and states for rendering

---

#### `ENEMY_DEATH`
Notification that an enemy has died.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.ENEMY_DEATH` | Message identifier |
| `id` | `string` | Dead enemy's identifier |
| `killerPlayerId` | `string` | ID of player who killed it |
| `enemyType` | `string` | Enemy class type |
| `x` | `number` | Death X position |
| `y` | `number` | Death Y position |

**Sent:** When enemy HP reaches 0
**Purpose:** Guest removes enemy sprite and plays death effects

---

#### `LOOT_SPAWN`
New loot item appeared in the world.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.LOOT_SPAWN` | Message identifier |
| `id` | `string` | Unique loot identifier |
| `itemData` | `string` | Serialized item JSON |
| `x` | `number` | Spawn X position |
| `y` | `number` | Spawn Y position |

**Sent:** When enemy drops loot or chest is opened
**Purpose:** Guest displays loot item in world

---

#### `LOOT_TAKEN`
Loot item was picked up.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.LOOT_TAKEN` | Message identifier |
| `id` | `string` | Loot identifier |
| `playerId` | `string` | Player who picked it up |

**Sent:** When any player picks up loot
**Purpose:** Remove loot from world on all clients

---

#### `ROOM_DATA`
Initial dungeon state on connection.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.ROOM_DATA` | Message identifier |
| `dungeonData` | `string` | Serialized dungeon structure |
| `currentRoomIndex` | `number` | Active room index |
| `hostX` | `number` | Host X position |
| `hostY` | `number` | Host Y position |

**Sent:** When guest first connects
**Purpose:** Initialize guest's view of the dungeon

---

#### `ROOM_CLEAR`
Room enemies have been defeated.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.ROOM_CLEAR` | Message identifier |
| `roomIndex` | `number` | Index of cleared room |

**Sent:** When all enemies in a room are dead
**Purpose:** Guest exits spectate mode if dead, opens doors

---

#### `ROOM_ACTIVATED`
Host has entered a new room.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.ROOM_ACTIVATED` | Message identifier |
| `roomId` | `number` | Room identifier |
| `hostX` | `number` | Host X position |
| `hostY` | `number` | Host Y position |

**Sent:** When host steps into a new room and triggers it
**Purpose:** Teleport guest to host location, mark room as safe

---

#### `PLAYER_DIED`
Player has died.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.PLAYER_DIED` | Message identifier |
| `playerId` | `string` | Peer ID of dead player |

**Sent:** When any player's HP reaches 0
**Purpose:** Enter spectate mode, show death UI

---

#### `PLAYER_REVIVE`
Player has been revived.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.PLAYER_REVIVE` | Message identifier |
| `playerId` | `string` | Peer ID of revived player |
| `x` | `number` | Revive X position |
| `y` | `number` | Revive Y position |

**Sent:** After room clear if player was dead
**Purpose:** Exit spectate mode, restore HP

---

#### `INVENTORY_UPDATE`
Synchronize inventory state.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.INVENTORY_UPDATE` | Message identifier |
| `inventorySerialized` | `string` | JSON-serialized inventory |
| `gold` | `number` | Current gold amount |

**Sent:** On initial connection, after loot pickup
**Purpose:** Keep guest inventory in sync

---

#### `SCENE_CHANGE`
Game is transitioning to a new scene.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.SCENE_CHANGE` | Message identifier |
| `sceneName` | `string` | Target scene name |
| `data` | `Record<string, unknown>` | Optional scene data |

**Sent:** When host changes scenes (e.g., floor transition)
**Purpose:** Synchronize scene transitions

---

### Bidirectional Messages

#### `PLAYER_POS`
Player position and animation state.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.PLAYER_POS` | Message identifier |
| `x` | `number` | X position |
| `y` | `number` | Y position |
| `facing` | `string` | Direction (north, south, east, west) |
| `animState` | `string` | Animation state (walk, idle) |
| `isMoving` | `boolean` | Whether player is moving |

**Sent By:** Both host and guest
**Frequency:** 20 updates/sec (50ms interval) when position changes
**Threshold:** Only sent if position changed > 2 pixels or facing changed

---

#### `PLAYER_ATTACK`
Player initiated an attack.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.PLAYER_ATTACK` | Message identifier |
| `attackType` | `string` | Type of attack |
| `direction` | `string` | Attack direction |
| `x` | `number` | Attack origin X |
| `y` | `number` | Attack origin Y |
| `angle` | `number` | (Optional) Attack angle in radians |

**Sent By:** Both host and guest
**Purpose:** Display attack visual effects on remote client

---

#### `PLAYER_HIT`
Player hit an enemy.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.PLAYER_HIT` | Message identifier |
| `enemyId` | `string` | Target enemy identifier |
| `damage` | `number` | Damage amount |

**Sent By:** Both host and guest
**Note:** When sent by guest, host validates before applying damage

---

#### `DAMAGE_NUMBER`
Floating damage number to render.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.DAMAGE_NUMBER` | Message identifier |
| `x` | `number` | X position |
| `y` | `number` | Y position |
| `damage` | `number` | Damage amount |
| `isPlayerDamage` | `boolean` | `true` if damage to player, `false` if to enemy |

**Sent By:** Both directions
**Purpose:** Render consistent floating damage text on both clients

---

#### `PICKUP`
Player picked up loot.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.PICKUP` | Message identifier |
| `lootId` | `string` | Loot identifier |

**Sent By:** Guest when picking up loot
**Purpose:** Host validates and broadcasts `LOOT_TAKEN`

---

#### `EQUIP_ITEM`
Player equipped an item.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.EQUIP_ITEM` | Message identifier |
| `itemId` | `string` | Item identifier |
| `slot` | `string` | Equipment slot |

**Sent By:** Both directions
**Purpose:** Synchronize equipment changes

---

#### `USE_ITEM`
Player used a consumable item.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.USE_ITEM` | Message identifier |
| `itemId` | `string` | Item identifier |

**Sent By:** Both directions
**Purpose:** Synchronize item usage (potions, etc.)

---

#### `COMBO_UPDATE`
Co-op combo counter update.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.COMBO_UPDATE` | Message identifier |
| `count` | `number` | Combo count |
| `lastKiller` | `string` | `'host'` or `'guest'` |
| `x` | `number` | X position |
| `y` | `number` | Y position |

**Sent By:** Both directions

---

#### `PLAYER_DOWNED`
A player was downed (revive system).

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.PLAYER_DOWNED` | Message identifier |
| `playerId` | `string` | `'host'` or `'guest'` |
| `x` | `number` | X position |
| `y` | `number` | Y position |

**Sent By:** The downed player's client; the host processes it authoritatively.

---

#### `REVIVE_PROGRESS`
Revive progress tick.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.REVIVE_PROGRESS` | Message identifier |
| `targetPlayerId` | `string` | Player being revived |
| `progress` | `number` | 0 to 1 |

**Sent By:** Host (authoritative revive progress).

---

#### `REVIVE_COMPLETE`
Revive finished.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.REVIVE_COMPLETE` | Message identifier |
| `targetPlayerId` | `string` | Player revived |
| `x` | `number` | X position |
| `y` | `number` | Y position |

**Sent By:** Host.

---

#### `PING_MARKER`
Co-op ping/marker.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.PING_MARKER` | Message identifier |
| `senderId` | `string` | Sender peer id |
| `x` | `number` | X position |
| `y` | `number` | Y position |
| `pingType` | `'alert' \| 'move' \| 'enemy'` | Marker type |

**Sent By:** Both directions

---

#### `XP_GAINED`
Shared XP gained.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.XP_GAINED` | Message identifier |
| `amount` | `number` | XP amount |
| `enemyType` | `string` | Source enemy type |
| `x` | `number` | X position |
| `y` | `number` | Y position |
| `totalXp` | `number` | Total XP |
| `xpToNext` | `number` | XP needed for next level |

**Sent By:** Both directions

---

#### `EMOTE`
Quick emote.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.EMOTE` | Message identifier |
| `senderId` | `string` | Sender peer id |
| `emoteType` | `'wave' \| 'thumbsUp' \| 'help' \| 'follow' \| 'wait' \| 'cheer'` | Emote type |
| `x` | `number` | X position |
| `y` | `number` | Y position |

**Sent By:** Both directions

---

#### `LEVEL_UP`
Player levelled up.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.LEVEL_UP` | Message identifier |
| `playerId` | `string` | Player who levelled up |
| `newLevel` | `number` | New level |
| `x` | `number` | X position |
| `y` | `number` | Y position |

**Sent By:** Both directions

---

#### `HEALTH_PICKUP`
Health pickup sync.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.HEALTH_PICKUP` | Message identifier |
| `playerId` | `string` | Player id |
| `amount` | `number` | Amount healed |
| `newHp` | `number` | New HP |
| `maxHp` | `number` | Maximum HP |
| `x` | `number` | X position |
| `y` | `number` | Y position |

**Sent By:** Both directions

---

#### `DUO_KILL`
Duo kill celebration.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `MessageType.DUO_KILL` | Message identifier |
| `enemyType` | `string` | Enemy type |
| `x` | `number` | X position |
| `y` | `number` | Y position |

**Sent By:** Both directions

---

## State Synchronization

### What State is Synced

| State Category | Synced | Authority | Frequency |
|----------------|--------|-----------|-----------|
| Player Position | Yes | Each player | 20/sec |
| Player HP/Stats | Yes | Host | 1/sec |
| Player Animation | Yes | Each player | 20/sec |
| Enemy Position | Yes | Host | 20/sec |
| Enemy HP | Yes | Host | 20/sec |
| Enemy AI State | Yes | Host | 20/sec |
| Loot Items | Yes | Host | On event |
| Inventory | Yes | Host | On change |
| Room State | Yes | Host | On event |
| Dungeon Layout | Yes | Host (seeded by room code) | On connect |

### Sync Frequency

```
┌─────────────────────────────────────────────────────────────────┐
│                    UPDATE FREQUENCIES                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PLAYER_POS     ████████████████████████████████████  20/sec    │
│                 (50ms interval)                                 │
│                                                                 │
│  ENEMY_UPDATE   ████████████████████████████████████  20/sec    │
│                 (50ms interval)                                 │
│                                                                 │
│  HOST_STATE     ████                                  1/sec     │
│                 (1000ms interval)                               │
│                                                                 │
│  Events         (On occurrence - attacks, pickups, etc.)        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Interpolation on Guest

The guest uses **linear interpolation** to smooth position updates:

```typescript
// RemotePlayer.ts - LERP_SPEED = 0.3
this.x = Phaser.Math.Linear(this.x, this.targetX, this.LERP_SPEED);
this.y = Phaser.Math.Linear(this.y, this.targetY, this.LERP_SPEED);
```

**Benefits:**
- Smooth visual movement despite 50ms update intervals
- Hides network jitter
- Prevents teleport-like jumps

**Guest enemy interpolation:**
```typescript
// GuestController.ts - Enemy position smoothing
guestEnemy.sprite.x = Phaser.Math.Linear(guestEnemy.sprite.x, enemyData.x, 0.3);
guestEnemy.sprite.y = Phaser.Math.Linear(guestEnemy.sprite.y, enemyData.y, 0.3);
```

---

## Host Responsibilities

### Authoritative Game State

The host maintains the single source of truth for:

- **Dungeon generation** - Room layouts, connections, decorations (seeded from the room code)
- **Enemy spawning** - When, where, and what type
- **Damage application** - Final say on HP changes
- **Loot drops** - Item generation and placement
- **Room progression** - Door states, room activation
- **Win/loss conditions** - Boss defeats, player deaths

### Enemy AI

All enemy AI runs exclusively on the host:

```
┌──────────────────────────────────────────────────────────────────┐
│                    ENEMY AI ON HOST                              │
└──────────────────────────────────────────────────────────────────┘

   Host                                             Guest
    │                                                  │
    │  Enemy AI Tick                                   │
    │  ├─ Calculate pathfinding                        │
    │  ├─ Check attack ranges                          │
    │  ├─ Update state machine                         │
    │  ├─ Apply movement                               │
    │  └─ Apply attacks                                │
    │                                                  │
    │  ENEMY_UPDATE (20/sec)                           │
    │ ────────────────────────────────────────────────►│
    │  {id, x, y, hp, state, facing}                   │
    │                                                  │
    │                                  Render sprites  │
    │                                  Update health   │
    │                                  Play animations │
    │                                                  │
```

**Secondary Target System:**
```typescript
// HostController.ts - Enemies can target guest player too
const guestPos = { x: this.remotePlayer.x, y: this.remotePlayer.y };
this.enemies.getChildren().forEach((child) => {
  const enemy = child as Enemy;
  if (enemy.active) {
    enemy.setSecondaryTarget(guestPos);
  }
});
```

### Damage Validation

When guest claims to hit an enemy, host validates:

1. **Message structure** - Required fields present
2. **Damage range** - Not negative, not exceeding max (1000)
3. **Enemy existence** - Enemy ID is in valid set
4. **Enemy active** - Enemy is not already dead

```typescript
// HostController.ts
private handleGuestHit(message: PlayerHitMessage, peerId: string): void {
  // 1. Validate damage value
  const damageValidation = validateDamage(message.damage);
  if (!damageValidation.valid) {
    console.warn(`Damage validation failed: ${damageValidation.reason}`);
    return;
  }

  // 2. Validate enemy ID exists
  const enemyValidation = validateEnemyId(message.enemyId, validEnemyIds);
  if (!enemyValidation.valid) {
    console.warn(`Enemy validation failed: ${enemyValidation.reason}`);
    return;
  }

  // 3. Apply damage only if enemy is active
  if (enemy.active) {
    enemy.takeDamage(message.damage);
  }
}
```

### Room Progression

Host controls all room-related logic:

1. **Room Activation** - Triggers when host enters
2. **Door Management** - Locks during combat, unlocks on clear
3. **Enemy Spawning** - Spawns enemies for the room
4. **Teleport Guest** - Brings guest to host on room activation

---

## Guest Responsibilities

### Input Sending

Guest sends input-related messages to host:

```
┌──────────────────────────────────────────────────────────────────┐
│                    GUEST INPUT FLOW                              │
└──────────────────────────────────────────────────────────────────┘

   Guest                                             Host
    │                                                  │
    │  Player presses attack                           │
    │  ├─ Local visual feedback                        │
    │  └─ Send PLAYER_ATTACK                           │
    │ ────────────────────────────────────────────────►│
    │                                                  │
    │  Attack hits enemy (local detection)             │
    │  └─ Send PLAYER_HIT                              │
    │ ────────────────────────────────────────────────►│
    │                                   Validate hit   │
    │                                   Apply damage   │
    │                                                  │
    │                          ENEMY_UPDATE            │
    │◄────────────────────────────────────────────────│
    │  (Reflects HP change)                            │
    │                                                  │
```

### Visual Rendering

Guest renders based on host data:

- **Host Player** - Rendered as `RemotePlayer` sprite
- **Enemies** - Created/updated from `ENEMY_UPDATE` messages
- **Loot** - Displayed from `LOOT_SPAWN` messages
- **Effects** - Attack projectiles from `PLAYER_ATTACK`

### State Reception

Guest receives and applies these state updates:

| Message | Guest Action |
|---------|--------------|
| `HOST_STATE` | Update helper stats (75% of host) |
| `ENEMY_UPDATE` | Create/update/destroy enemy sprites |
| `ROOM_ACTIVATED` | Teleport to host, mark room safe |
| `ROOM_CLEAR` | Exit spectate mode if dead |
| `SCENE_CHANGE` | Transition to new scene |
| `INVENTORY_UPDATE` | Sync inventory display |

---

## Anti-Cheat Validation

The host performs several validations to prevent cheating. All constants live in `MessageValidator.ts`.

### Damage Limits

```typescript
// MessageValidator.ts
const MAX_DAMAGE_PER_HIT = 1000;

export function validateDamage(damage: number): ValidationResult {
  if (typeof damage !== 'number' || isNaN(damage)) {
    return { valid: false, reason: 'Damage must be a number' };
  }
  if (damage < 0) {
    return { valid: false, reason: 'Damage cannot be negative' };
  }
  if (damage > MAX_DAMAGE_PER_HIT) {
    return { valid: false, reason: `Damage exceeds max of ${MAX_DAMAGE_PER_HIT}` };
  }
  return { valid: true };
}
```

### Position Delta Checks

```typescript
// MessageValidator.ts
const MAX_POSITION_DELTA = 100; // pixels per update

export function validatePositionDelta(
  oldX: number, oldY: number,
  newX: number, newY: number
): ValidationResult {
  const deltaX = Math.abs(newX - oldX);
  const deltaY = Math.abs(newY - oldY);

  if (deltaX > MAX_POSITION_DELTA || deltaY > MAX_POSITION_DELTA) {
    return { valid: false, reason: 'Position change too large (possible teleport)' };
  }
  return { valid: true };
}
```

**Note:** Position validation logs warnings but doesn't reject, as legitimate room transitions can cause large position changes.

### Enemy ID Validation

```typescript
// MessageValidator.ts
export function validateEnemyId(
  enemyId: string,
  validEnemyIds: Set<string>
): ValidationResult {
  if (!validEnemyIds.has(enemyId)) {
    return { valid: false, reason: 'Invalid enemy ID' };
  }
  return { valid: true };
}
```

The host maintains a map of all valid enemy IDs:
```typescript
// HostController.ts
private enemyIdMap: Map<Enemy, string> = new Map();

// Build validation set
const validEnemyIds = new Set<string>(this.enemyIdMap.values());
```

### Message Structure Validation

```typescript
// MessageValidator.ts
export function validateSyncMessage(message: SyncMessage): ValidationResult {
  if (!message || typeof message !== 'object') {
    return { valid: false, reason: 'Message must be an object' };
  }
  if (!message.type || typeof message.type !== 'string') {
    return { valid: false, reason: 'Message must have a type' };
  }
  return { valid: true };
}
```

### Room Code Validation

```typescript
// MessageValidator.ts
const VALID_ROOM_CODE_REGEX = /^[A-Z0-9]{4,8}$/;

export function validateRoomCode(code: string): ValidationResult {
  if (!VALID_ROOM_CODE_REGEX.test(code)) {
    return { valid: false, reason: 'Invalid room code format' };
  }
  return { valid: true };
}
```

---

## Sequence Diagrams

### Full Connection Sequence

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE CONNECTION SEQUENCE                          │
└──────────────────────────────────────────────────────────────────────────┘

   Host                    Relay                    Guest
    │                         │                           │
    │  hostGame()             │                           │
    │  WS connect             │                           │
    │  {t:'join', code,       │                           │
    │   role:'host'}          │                           │
    │────────────────────────►│                           │
    │                         │                           │
    │  {t:'joined', role:     │                           │
    │   'host'}               │                           │
    │◄────────────────────────│                           │
    │                         │                           │
    │  State: 'waiting'       │                           │
    │  Display code to user   │                           │
    │                         │           WS connect      │
    │                         │           {t:'join', code,│
    │                         │            role:'guest'}   │
    │                         │◄──────────────────────────│
    │                         │                           │
    │  {t:'peer-join'}        │      {t:'joined', role:   │
    │                         │       'guest', peers:[host]}
    │◄────────────────────────┼──────────────────────────►│
    │                         │                           │
    │  State: 'connected'     │        State: 'connected' │
    │                         │                           │
    │  createRemotePlayer()   │                           │
    │  sendInitialState()     │                           │
    │                         │                           │
    │  ─────────── HOST_STATE ────────────────────────────►
    │  ─────────── INVENTORY_UPDATE ──────────────────────►
    │  ─────────── ROOM_DATA ─────────────────────────────►
    │                         │                           │
    │                         │     createHostPlayer()    │
    │                         │     Apply initial state   │
    │                         │                           │
    │  ════════════════ GAMEPLAY BEGINS ══════════════════
    │                         │                           │
```

### Combat Sequence

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       COMBAT SEQUENCE                                    │
└──────────────────────────────────────────────────────────────────────────┘

   Host                                             Guest
    │                                                  │
    │  Enemy AI targets guest                          │
    │  Enemy moves toward guest                        │
    │                                                  │
    │  ─────────── ENEMY_UPDATE ──────────────────────►│
    │  {enemies: [{id: "enemy_1", x, y, hp, state}]}   │
    │                                                  │
    │                                  Render enemy    │
    │                                  movement        │
    │                                                  │
    │                                  Guest attacks   │
    │◄──────────── PLAYER_ATTACK ─────────────────────│
    │  {attackType, direction, x, y, angle}            │
    │                                                  │
    │  Render guest attack                             │
    │  visual effect                                   │
    │                                                  │
    │                                  Local hit       │
    │                                  detection       │
    │◄──────────── PLAYER_HIT ────────────────────────│
    │  {enemyId: "enemy_1", damage: 25}                │
    │                                                  │
    │  validateDamage(25) ✓                            │
    │  validateEnemyId("enemy_1") ✓                    │
    │  enemy.takeDamage(25)                            │
    │                                                  │
    │  ─────────── ENEMY_UPDATE ──────────────────────►│
    │  {enemies: [{id: "enemy_1", hp: 75, ...}]}       │
    │                                                  │
    │                                  Update enemy    │
    │                                  health bar      │
    │                                                  │
```

### Room Transition Sequence

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    ROOM TRANSITION SEQUENCE                              │
└──────────────────────────────────────────────────────────────────────────┘

   Host                                             Guest
    │                                                  │
    │  Host enters new room                            │
    │  Room activation triggers                        │
    │                                                  │
    │  broadcastRoomActivated(roomId)                  │
    │  ─────────── ROOM_ACTIVATED ────────────────────►│
    │  {roomId: 3, hostX: 500, hostY: 300}             │
    │                                                  │
    │                                  visitedRoomIds  │
    │                                    .add(3)       │
    │                                                  │
    │                                  Teleport to     │
    │                                  (520, 300)      │
    │                                                  │
    │                                  Visual flash    │
    │                                  effect          │
    │                                                  │
    │  Spawn room enemies                              │
    │  registerEnemy() for each                        │
    │                                                  │
    │  ─────────── ENEMY_UPDATE ──────────────────────►│
    │  {enemies: [new enemies...]}                     │
    │                                                  │
    │                                  Create enemy    │
    │                                  sprites         │
    │                                                  │
```

### Reconnection Sequence

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    RECONNECTION SEQUENCE                                 │
└──────────────────────────────────────────────────────────────────────────┘

   Host                                             Guest
    │                                                  │
    │  ═══════════ CONNECTION LOST ═══════════════════
    │                                                  │
    │  onPeerLeave() (peer-leave)                      │
    │  State: 'waiting'                                │
    │  showWaitingUI()                                 │
    │                                                  │
    │                               onPeerLeave()      │
    │                               State: 'reconnecting'
    │                               showReconnectingUI()
    │                                                  │
    │                               Attempt 1/5        │
    │                               Wait 2000ms        │
    │                               Re-open WS,        │
    │                               re-join room/role  │
    │                                                  │
    │  {t:'peer-join'}              {t:'joined'}       │
    │  State: 'connected'            State: 'connected'│
    │                                                  │
    │  hideWaitingUI()               hideReconnectUI() │
    │  sendInitialState()                              │
    │                                                  │
    │  ─────────── HOST_STATE ────────────────────────►│
    │  ─────────── ENEMY_UPDATE ──────────────────────►│
    │                                                  │
    │  ════════════════ GAMEPLAY RESUMES ═════════════
    │                                                  │
```

---

## File Reference

| File | Purpose |
|------|---------|
| `server/index.ts` | Combined static game host + WebSocket relay (same port) |
| `src/multiplayer/NetworkManager.ts` | WebSocket client: connection lifecycle, room join/leave, auto-reconnect, URL selection |
| `SyncMessages.ts` | Message type definitions and interfaces |
| `PlayerSync.ts` | Local player position broadcasting |
| `RemotePlayer.ts` | Remote player sprite with interpolation |
| `HostController.ts` | Host-side game state management |
| `GuestController.ts` | Guest-side state reception and rendering |
| `MessageValidator.ts` | Anti-cheat validation functions |
| `index.ts` | Module exports |

---

## Constants Reference

| Constant | Value | Location | Purpose |
|----------|-------|----------|---------|
| `RELAY_PORT` | `3001` (env `PORT`) | server/index.ts | Relay + static host port |
| `ROOM_CODE_CHARS` | `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` | NetworkManager.generateRoomCode | Room code charset |
| `ROOM_CODE_REGEX` (server) | `/^[A-HJ-NP-Z2-9]{6}$/` | server/index.ts | Server-side room code validation |
| `SEND_INTERVAL_MS` | 50 | PlayerSync | Position update rate |
| `POSITION_THRESHOLD` | 2 | PlayerSync | Min position delta to send |
| `LERP_SPEED` | 0.3 | RemotePlayer | Interpolation factor |
| `ENEMY_UPDATE_INTERVAL_MS` | 50 | HostController | Enemy sync rate |
| `HOST_STATE_INTERVAL_MS` | 1000 | HostController | Host stats sync rate |
| `MAX_RECONNECT_ATTEMPTS` | 5 | NetworkManager | Reconnection limit |
| `RECONNECT_DELAY_MS` | 2000 | NetworkManager | Delay between attempts |
| `MAX_DAMAGE_PER_HIT` | 1000 | MessageValidator | Anti-cheat limit |
| `MAX_POSITION_DELTA` | 100 | MessageValidator | Anti-cheat limit |
| `VALID_ROOM_CODE_REGEX` | `/^[A-Z0-9]{4,8}$/` | MessageValidator | Client-side room code validation |
| `MAX_MESSAGES_PER_SECOND` | 100 | MessageValidator | Rate-limit (flood protection) |
