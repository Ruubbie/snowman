# olaf desktop (`@snowman/desktop`)

Olaf's home on the desktop: one place to see everything Snowman knows and did, across modules.
Today: Home, Conversations, Activity (event log), Olaf usage & budget, Devices, Settings, and the
**Running** module (Workouts with route replay, Plan decisions and briefs). "Talk to Olaf" is a placeholder.

Plain JS + React, built with Vite, runs in the browser. Styling is the Olaf Design System
(`design/olaf-ds/tokens.css` + `components.css`, imported directly). Dark mode is derived from the same tokens.

## Run it

All commands from the repo root.

1. Install once: `npm install`
2. Start the backbone and MariaDB (see the root README): `npm run dev -w @snowman/backbone` (port 4000).
3. Get a pairing code (valid 10 minutes):

   ```
   npm run pair -w @snowman/backbone -- Desktop
   ```

4. Start it: `npm run dev -w @snowman/desktop`, then open http://127.0.0.1:5178.

5. On the page: enter the server address (e.g. `http://127.0.0.1:4000`), the code, and a device name.

## Token storage

API calls go through a Vite dev-server proxy and the token is kept **unencrypted in localStorage**.
Fine on your own PC; don't expose the dev server to the network.

## How it is built

- `src/lib/bridge.js` - pairing, token storage and API requests (through the Vite proxy).
- `src/modules/index.js` - module registry. Adding a module = one descriptor
  `{ id, name, icon, screens, OverviewCard }` plus, on the backbone, admin routes under `/v1/admin/<module>/*`
  and `ctx.admin.registerOverview('<module>', fn)` for its Home card (see `packages/modules/running/src/adminRoutes.js`).

Backbone admin API used here: `/v1/admin/overview`, `/conversations`, `/ai-usage`, `/events`, `/devices`
and `/v1/admin/running/{runs,plan-decisions,briefs}` - all behind device auth, wrapped by `client.admin` in
`packages/sdk`.
