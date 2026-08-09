# HELL FIRE

A roguelike action RPG hell fire built with Phaser 3 and TypeScript. Battle through procedurally generated dungeons, defeat enemies, collect loot, and face challenging bosses every 5 floors.

## Features

- **Procedural Dungeon Generation** - Every run features unique room layouts and corridors
- **Room-Based Combat** - Doors seal when entering a room, enemies spawn with warning indicators
- **Fog of War** - Explore to reveal rooms and corridors
- **Multiple Enemy Types** - Basic, Fast, Tank, Ranged, and Boss enemies
- **Loot System** - Procedurally generated items with rarities (Common, Uncommon, Rare, Epic, Legendary)
- **Character Progression** - Level up and allocate stats (HP, Attack, Defense, Speed)
- **Boss Battles** - Face a boss every 5 floors, with the final boss on floor 20
- **Minimap** - Track your exploration in real-time
- **Save System** - Progress is saved between sessions
- **Co-op Multiplayer** - Team up with a friend in the browser. Host a room, share the 6-character code, and play together over the internet — no install for either player.

## Controls

| Key | Action |
|-----|--------|
| `W` `A` `S` `D` | Move |
| `Left Click` | Attack (shoot projectile) |
| `Space` | Dodge roll |
| `E` | Open inventory |
| `L` | Open character stats / level up |
| `ESC` | Close menus / Settings |

### Dev Controls (for testing)

| Key | Action |
|-----|--------|
| `F1` | Toggle god mode |
| `F2` | Skip to next floor |
| `F3` | Jump to final boss (floor 20) |
| `F4` | Instant level up |
| `F5` | Spawn epic loot |
| `F6` | Kill all enemies |

## Development

### Prerequisites

- Node.js 22+
- npm

### Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## Tech Stack

- **[Phaser 3](https://phaser.io/)** - HTML5 game framework
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe JavaScript
- **[Vite](https://vitejs.dev/)** - Fast build tool and dev server

## Project Structure

```
src/
├── entities/          # Player and enemy classes
│   ├── Player.ts
│   ├── Enemy.ts
│   └── enemies/       # Enemy type variants
├── scenes/            # Phaser scenes
│   ├── BootScene.ts   # Asset loading
│   ├── MenuScene.ts   # Main menu
│   ├── GameScene.ts   # Main gameplay
│   └── ...
├── systems/           # Game systems
│   ├── DungeonGenerator.ts
│   ├── RoomManager.ts
│   ├── CombatSystem.ts
│   ├── LootSystem.ts
│   └── ...
├── ui/                # UI components
│   ├── InventoryUI.ts
│   ├── MinimapUI.ts
│   └── LevelUpUI.ts
└── utils/             # Constants and utilities
```

## Hosting (Public & Private Multiplayer)

The game is a static browser build; the co-op relay is a tiny WebSocket server.
`server/index.ts` runs **both in one process** — it serves the built game from
`/dist` over HTTP *and* the relay WebSocket on the **same port**. This means:

- Players open the URL in any browser — **no install required**.
- Public multiplayer works out of the box: the hosted game connects back to the
  relay on the same origin (`wss://your-domain`).
- Private servers: a player can enter their own relay URL in
  **Settings → Co-op Server → PRIVATE**.

### 1. Build

```bash
npm install
npm run build:all     # builds the game (dist/) and compiles the server (server/dist/)
```

### 2. Run locally (single process, same port)

```bash
PORT=3000 npm start   # serves game + relay on http://localhost:3000
```

### 3. Deploy (one of these)

**Docker**
```bash
docker build -t hell-fire .
docker run -p 3000:3000 -e PORT=3000 hell-fire
```

**Railway** — push the repo; `railway.json` sets the start command and `/health`
health check. No config needed.

**Render** — create a Web Service using the included `render.yaml` (Docker runtime).
Set the branch and deploy; Render injects `PORT` automatically.

> The relay exposes `GET /health` (liveness) and `GET /api/rooms` (active rooms)
> for monitoring.

### 4. Private relay (optional)

Run the server anywhere and point players to it via
**Settings → Co-op Server → PRIVATE** (or build with `VITE_SERVER_URL=wss://…`).
You can also set `VITE_SERVER_URL` in a `.env` file (see `.env.example`).

## License

MIT
