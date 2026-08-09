# Engineering Review — HELL FIRE Co-op Prototype

**Status:** ✅ Live & pushed · **Date:** 2026-08-09
**Live game:** https://hell-fire-game.surge.sh
**Source:** https://github.com/Amitdev19/HELL-FIRE
**Local play:** `npm run dev` → game on `:3000`, relay on `:3001` (Vite proxy `/ws`)
**Production:** `npm run build:all && npm start` (combined game host + relay, single process, default `:3001`)

---

## 1. What We Built (Completed)

### Multiplayer — self-hosted WebSocket relay (no Trystero)
- `server/index.ts`: a **single Node process** that serves the built game from `/dist` over HTTP **and** runs the WebSocket relay on the **same port**.
  - Endpoints: `GET /health`, `GET /api/rooms`, `WS <connect>`.
  - Room codes: 6 chars from `A-HJ-NP-Z2-9` (≈1.07B space). First peer = host, second = guest. Hard cap of 2 peers/room.
  - Relays opaque `data` messages; emits `peer-join` / `peer-leave` / `joined`.
- `NetworkManager.ts` (`src/multiplayer`): WebSocket client, room join/host, **auto-reconnect** (re-joins the room on drop — fixed), smart `signalUrl()` default:
  - `localhost` → `ws://localhost:3001` (dev relay)
  - hosted site → same-origin `wss://` (works on Render/Railway/Docker out of the box)
  - override order: `VITE_SERVER_URL` → CAPACITOR → in-memory override → `SettingsManager` → `localStorage('hell_fire_relay_url')` → auto.
- `SettingsUI.ts`: **Co-op Server** section with LOCAL / PUBLIC / PRIVATE presets + an EDIT prompt.
- `HostController.ts` / `GuestController.ts`: host-authoritative sync — enemy positions/HP, damage, loot, room clears, revives, pings, emotes, combos, proximity buff, distance tether, kill feed.
- `PlayerSync.ts`: position + attack + hit broadcast (both peers send, so the host sees the guest too).
- `MessageValidator.ts`: validation for room codes, damage, position, position-delta, and an in-memory `MessageRateLimiter`.
- `GameSceneInit.ts:93` seeds `DungeonGenerator` with the **room code**, so both clients generate an **identical dungeon** (the core sync guarantee).

### Bug fixes
- Guest projectile attack-type resolves correctly.
- Enemy facing sync via `Enemy.getFacing()`.
- Reconnect re-joins room; host also reconnects on socket close.
- Reconnect timer cleanup in `disconnect()`.
- Double-kill guard on enemy death attribution.

### Deployment (zero-config for players)
- `Dockerfile`, `docker-compose.yml`, `render.yaml`, `railway.json`, `package.json` scripts (`build:all`, `start`, `dev:all`).
- Static game on Surge; GitHub repo `Amitdev19/HELL-FIRE`.

### Quality-of-life
- `SettingsManager` auto-defaults to mobile controls on touch devices.
- `.gitignore`/`.dockerignore` exclude build artifacts and secrets.

### Verified
- `tsc --noEmit` passes; `build:all` artifacts present; Vitest 25/25 passing.

---

## 2. Strengths

| Area | Strength |
|---|---|
| Player-experience | Two clicks → online co-op; same-origin relay means no URL config. |
| Architecture | Single-process server halves infra cost and removes cross-origin/TLS coordination. |
| Resilience | Reconnect re-joins the room; host recovers on disconnect; rate limiting + message validation. |
| UX | Proximity buff, combo, revive, pings, emotes, off-screen partner arrow, tether warnings. |
| Dev ergonomics | Dev proxy for local relay; type-safe message schema; `VITE_SERVER_URL` escape hatch. |
| Docs | `docs/ARCHITECTURE.md`, `docs/COMBAT.md`, etc. (now synced to the relay model). |

---

## 3. Flaws & Gaps — Status

> All items below have been **resolved** in the plan work (see `PLAN.md` / commit history).

1. **Host kill attribution broken** → FIXED: `PlayerAttackManager` emits `hostPlayerHit`; `HostController` records host as hitter.
2. **Dead/duplicated init code** (`GameSceneInit.initializeSystems`) → FIXED: removed.
3. **Stale Trystero/WebRTC docs** → FIXED: `MULTIPLAYER_PROTOCOL.md`, `ARCHITECTURE.md`, `NETWORK_API.md`, `CONSTANTS.md` rewritten.
4. **GitHub Pages workflow deploys no-relay build** → Documented: Pages = single-player only; co-op needs Docker/Render/Railway.
5. **No automated tests / CI** → FIXED: Vitest suite + `typecheck` script + `.github/workflows/ci.yml`.
6. **Dead reconnect timer field** → FIXED: removed.
7. **Relay `safeJoin` path-traversal check** → FIXED: `path.relative`-based.
8. **Guest loot parity** → Known limitation (host-authoritative); documented.
9. **2-player hard cap** → By design (co-op); not extensible without redesign.

---

## 4. Recommendations & Improvements (remaining)

- **>2 players**: refactor relay to N-member rooms if larger co-op is desired.
- **Spectator / watch mode**: leverage `/api/rooms`.
- **Latency telemetry**: add a `ping` message + RTT display.
- **Lint/format**: add ESLint + Prettier (CI already type-checks + tests).
- **Dependabot**: `.github/dependabot.yml` for `package.json` + Actions.
- **Release artifacts**: publish PC builds to Releases, not the repo.

---

## 5. Deployment Quick Reference

| Target | How | Co-op? |
|---|---|---|
| Local dev | `npm run dev` + `npm run server` | ✅ |
| Local prod | `npm run build:all && npm start` | ✅ same-origin |
| Docker | `docker build -t hell-fire . && docker run -p 3000:3000 -e PORT=3000 hell-fire` | ✅ |
| Render | `render.yaml` (Docker, injects `PORT`) | ✅ |
| Railway | push repo; `railway.json` provides `/health` | ✅ |
| GitHub Pages | `deploy.yml` (static `dist/` only) | ❌ no relay |
| Surge | `surge dist` (static only) | ❌ no relay |

> Public co-op at scale is best served by the **combined Docker server** (Render/Railway/self-host). Surge/Pages are static-only and single-player.
