# Contributing to HELL FIRE

First off, **thank you** for considering contributing! This is a prototype project by devils_call. Contributions of all kinds are welcome - from bug fixes to new features.

## Getting Started

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

The game will be available at `http://localhost:5173`.

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
- **[WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)** - Self-hosted co-op relay

## Project Structure

```
src/
├── entities/          # Player and enemy classes
├── scenes/            # Phaser scenes (Menu, Game, etc.)
├── systems/           # Game systems (Dungeon, Combat, Loot)
├── ui/                # UI components (Inventory, Minimap)
├── multiplayer/       # Co-op networking (NetworkManager)
└── utils/             # Constants and utilities
```

## Dev Controls (for testing)

| Key | Action |
|-----|--------|
| `F1` | Toggle god mode |
| `F2` | Skip to next floor |
| `F3` | Jump to final boss (floor 20) |
| `F4` | Instant level up |
| `F5` | Spawn epic loot |
| `F6` | Kill all enemies |

## Areas Where Contributions Are Especially Welcome

- **New enemy types** - The game supports various enemy variants
- **New items/weapons** - The loot system is designed to be extensible
- **UI improvements** - Better inventory, stats screens, or HUD elements
- **Performance optimizations** - Especially for dungeon generation and rendering
- **Multiplayer features** - The co-op system can always be improved
- **Bug fixes** - Always appreciated!

## Questions?

- Open an issue
