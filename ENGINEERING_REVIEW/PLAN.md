# Action Plan — HELL FIRE Co-op Prototype

Prioritized follow-ups from `ENGINEERING_REVIEW/REPORT.md`. ✅ = implemented.

---

## P0 — Correctness

### ✅ 1. Fix host kill attribution / duo-kill
- `src/systems/PlayerAttackManager.ts` (`broadcastHit`) now emits `hostPlayerHit` (host + multiplayer only).
- `src/multiplayer/HostController.ts` listens for `hostPlayerHit` and calls `trackHostHit(enemy)`.
- Result: duo-kill + kill-feed attribution correct for host final blows.

### ✅ 2. Remove dead duplicated initializer
- Deleted unused `initializeSystems`, `GameSceneSystems`, `InitParams` (and dead `createExit`) from `src/scenes/game/GameSceneInit.ts`; kept `createDungeonTiles`. File 385→114 lines.

### ✅ 3. Fix reconnect timer dead field
- Removed `reconnectTimer` field + no-op cleanup from `src/multiplayer/NetworkManager.ts`.

---

## P1 — Stability & Hygiene

### ✅ 4. Harden static path traversal
- `server/index.ts` `safeJoin` now uses `path.relative` + `..` rejection.

### ✅ 5. Add CI type gate + scripts
- `package.json`: added `typecheck` (`tsc --noEmit`).
- `.github/workflows/ci.yml`: checkout → `npm ci` → `typecheck` → `test:run` → `build`.

### ✅ 6. Add a test runner + baseline tests
- Vitest added; `test` / `test:run` scripts.
- `src/multiplayer/__tests__/MessageValidator.test.ts` (17), `roomcode.test.ts` (5), `server/__tests__/relay.test.ts` (3) → 25 passing.

### 7. Lint/format (optional)
- Add ESLint + Prettier; wire into CI. (Type-check + tests already gate.)

---

## P2 — Documentation

### ✅ 8. Rewrite multiplayer docs for the relay model
- `docs/MULTIPLAYER_PROTOCOL.md` rewritten (server + WS envelope + presets + seeding).
- `docs/ARCHITECTURE.md`, `docs/api/NETWORK_API.md`, `docs/reference/CONSTANTS.md` updated; old Trystero plan marked superseded.

### ✅ 9. Clarify the GitHub Pages workflow
- Documented: Pages = static only, no co-op relay.

### ✅ 10. Pin Node version
- Dockerfile pins Node 22; README says 22+. (`.nvmrc` optional.)

---

## P3 — Features / Hardening

### 11. >2 player support (optional)
- Relay room cap from 2; broadcast to all; define host among N. Only if 3+ co-op is on the roadmap.

### 12. Spectator / watch mode
- Add `spectator` role that receives `data` but doesn't send input (leverages `/api/rooms`).

### 13. Latency telemetry
- Add a `ping` message type; surface RTT in `MultiplayerHUD`.

### 14. Guest loot parity
- Either sync loot-pickup for the guest, or document as host-authoritative (current state).

---

## P4 — Ops / Release hygiene

### 15. CI deploy to Render/Railway
- Render auto-deploys on push (uses Dockerfile). Optional Actions webhook.

### 16. Release artifact publishing
- Keep `hell-fire-pc.zip` out of git; publish PC builds to Releases.

### 17. Dependabot / lockfile hygiene
- `.github/dependabot.yml` for `package.json` + GitHub Actions.

---

## Suggested sequencing (done)

| Sprint | Goal | Tickets |
|---|---|---|
| ✅ This pass | Correctness + trust the build | #1, #2, #3, #4, #5, #6, #8 |
| Next | Lint/format + hardening | #7, #11, #12, #13, #17 |

## Notes
- Repo clean on `main`; plan work committed after execution.
- To test co-op locally: `npm run dev` + `npm run server`; join via a second tab at `http://localhost:3000`.
- Surge host is static only — for public co-op, deploy the combined server (Docker/Render) and use **Settings → Co-op Server → PUBLIC** (same origin) or **PRIVATE** for a custom relay.
