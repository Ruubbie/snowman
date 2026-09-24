# olaf desktop (`@snowman/desktop`)

Olaf's home on the desktop: one place to see everything Snowman knows and did, across modules.
Today: Home, Conversations, Activity (event log), Olaf usage & budget, Devices, Settings, and the
**Running** module (Workouts with route replay, Plan decisions and briefs). "Talk to Olaf" is a placeholder;
the hotkey/voice overlay will be a second window in the same Electron main process.

Plain JS + React, built with Vite, run by Electron. Styling is the Olaf Design System
(`design/olaf-ds/tokens.css` + `components.css`, imported directly). Dark mode is derived from the same tokens.

## Run it

All commands from the repo root.

1. Install once: `npm install`
2. Start the backbone and MariaDB (see the root README): `npm run dev -w @snowman/backbone` (port 4000).
3. Get a pairing code (valid 10 minutes):

   ```
   npm run pair -w @snowman/backbone -- Desktop
   ```

4. Start the app:

   ```
   npm run dev -w @snowman/desktop     # Vite + Electron together, with hot reload
   npm run start -w @snowman/desktop   # build the renderer, then run Electron on the build
   npm run build -w @snowman/desktop   # renderer only -> apps/desktop/dist
   ```

   The first Electron start downloads the Electron binary (~150 MB zip, ~300 MB unpacked).

5. In the window: enter the server address (e.g. `http://127.0.0.1:4000`), the code, and a device name.

## Browser dev mode

`npm run dev:web -w @snowman/desktop` serves the renderer at http://127.0.0.1:5178 so it can be checked in a
normal browser. There, API calls go through a Vite dev-server proxy and the token is kept **unencrypted in
localStorage** - dev only; use the Electron app for real use.

## Test data

`npm run fake-run -w @snowman/backbone` inserts one clearly-marked fake run (300 samples on a loop, events, cues;
no jobs, no AI calls). It shows up in Workouts flagged "Simulator" - delete it from there.

## How it is built

- `electron/main.js` - window manager (dashboard now, overlay slot reserved), single-instance, hardened navigation.
- `electron/preload.js` - exposes a tiny `window.snowman` API (contextIsolation on, nodeIntegration off, sandbox on).
- `electron/ipc.js` - pairing and API requests run in the main process; the device token is added there and only
  ever sent to the paired server's `/v1/` API.
- `electron/store.js` - server/device settings in `userData`; the token encrypted with `safeStorage`
  (never written in plain text; memory-only if encryption is unavailable).
- `src/lib/bridge.js` - the same interface for Electron and for browser dev mode.
- `src/modules/index.js` - module registry. Adding a module = one descriptor
  `{ id, name, icon, screens, OverviewCard }` plus, on the backbone, admin routes under `/v1/admin/<module>/*`
  and `ctx.admin.registerOverview('<module>', fn)` for its Home card (see `packages/modules/running/src/adminRoutes.js`).

Backbone admin API used here: `/v1/admin/overview`, `/conversations`, `/ai-usage`, `/events`, `/devices`
and `/v1/admin/running/{runs,plan-decisions,briefs}` - all behind device auth, wrapped by `client.admin` in
`packages/sdk`.
