# Snowman

Snowman is a personal AI backbone that runs locally (for now) and hosts
**Olaf**, an AI character built on the Claude API. This repo is step 1: a
monorepo skeleton, the Node backbone (Fastify + MariaDB), a running-coach
module, and Olaf's brain core. There is no UI yet - everything is driven by
HTTP/WebSocket and `curl`.

## Repo layout

```
package.json            npm workspaces: apps/*, packages/*, packages/modules/*
apps/backbone/           @snowman/backbone - the Node server
  src/server.js          entry point: config -> db pool -> migrate -> app -> listen
  src/app.js              buildApp({config, db, brain, clock, ...}) -> Fastify instance (tests inject fakes)
  src/config.js            env parsing/defaults/validation
  src/db/                  mysql2 pool + plain-SQL migration runner
  src/core/                auth (pairing/tokens), events (bus), realtime (websocket), jobs (queue), modules (loader)
  src/brain/                Olaf: claude.js, persona.js, models.js, budget.js, tools.js, agent.js, routes.js
  migrations/001_core.sql  devices, pairing_codes, events, jobs, conversations, ai_usage
  scripts/                  pair.js, migrate.js, import-runcoach.js
  config/persona.example.md placeholder persona (the real character is still to be written)
packages/shared/          @snowman/shared - event names, card kinds, pace/duration helpers,
                           shared JSON Schemas, and the run-telemetry contract (samples/events)
packages/modules/running/ @snowman/module-running - the 8-week run/walk program, plan rules,
                           the old-app import parser, run analysis, routes, and Olaf tools

FUTURE (not built yet):
apps/snowball/            Expo iPhone app - the actual running tracker UI
apps/olaf/                 a dedicated Olaf-facing surface, if it ends up separate from the backbone
apps/desktop/               Electron overlay for Olaf on the desktop
native/ios/                 native iOS glue for Snowball, if Expo isn't enough
```

## Local setup (Windows)

1. **Install MariaDB 11.8.** Either the official MSI installer, or:
   ```powershell
   winget install MariaDB.Server
   ```
2. **Create the database and user** (run via the MariaDB client / HeidiSQL / etc.):
   ```sql
   CREATE DATABASE snowman CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'snowman'@'localhost' IDENTIFIED BY 'snowman';
   GRANT ALL PRIVILEGES ON snowman.* TO 'snowman'@'localhost';
   FLUSH PRIVILEGES;
   ```
3. **Copy the env file** and fill in real values (never commit `.env`):
   ```powershell
   copy .env.example .env
   ```
   Set `DATABASE_URL=mysql://snowman:snowman@127.0.0.1:3306/snowman` and, if you
   have one, `ANTHROPIC_API_KEY=...` (Olaf runs with `available=false` and
   returns `503 olaf_unavailable` on any Olaf route without it).
4. **Install dependencies and run migrations:**
   ```powershell
   npm install
   npm run migrate
   ```
5. **Start the backbone:**
   ```powershell
   npm run dev
   ```
6. **Pair a device** (creates a 6-character one-time code, valid 10 minutes):
   ```powershell
   npm run pair -- "iPhone"
   ```
   Then redeem it for a token:
   ```powershell
   curl -X POST http://127.0.0.1:4000/v1/pair -H "Content-Type: application/json" -d "{\"code\":\"ABC123\",\"deviceName\":\"iPhone\"}"
   ```
   Use the returned `token` as `Authorization: Bearer <token>` on every other
   `/v1/*` route (except `/v1/pair` and `/v1/health`).

## Environment variables

See `.env.example` for the full list with defaults: `PORT`, `HOST`,
`TZ_NAME` (default `Europe/Amsterdam`), `DATABASE_URL`, `ANTHROPIC_API_KEY`,
`OLAF_MODEL_FAST` / `OLAF_MODEL_SMART`, `AI_MONTHLY_BUDGET_USD`,
`PERSONA_FILE`, and `TEST_DATABASE_URL` (only for opt-in DB integration
tests - unset, those tests are skipped).

## curl examples

```bash
# Health check (no auth)
curl http://127.0.0.1:4000/v1/health

# Today's running card
curl http://127.0.0.1:4000/v1/running/today -H "Authorization: Bearer $TOKEN"

# Chat with Olaf
curl -X POST http://127.0.0.1:4000/v1/olaf/chat -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"message":"How is my training going?"}'

# Import an old RunCoach export
curl -X POST http://127.0.0.1:4000/v1/running/import/runcoach -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"text":"..."}'
```

Or, with a file and direct DB access (needs `DATABASE_URL`, not just the API):

```powershell
npm run import:runcoach -- "C:\path\to\summary.txt"
```

## Running module

Ports the old Swift app's 8-week run/walk-to-30-minutes program. See
`packages/modules/running/src/program.js` for the exact interval table and
`rules.js` for the plan guardrails (rest days, consecutive-run limits, the
10% weekly increase cap). Uploaded runs can carry rich ~1Hz GPS/motion
telemetry (`run_samples`/`run_events`) - the schema is documented as a
tracker contract in `packages/shared/src/runningTelemetry.js`, for the
future Swift Snowball tracker to implement. `analysis.js` turns that
telemetry into splits, elevation, pace-over-time, and segment performance,
pure-function style, with no DB access.

## Testing

```powershell
npm test
```

Runs every `*.test.js` file under `apps/` and `packages/` via Node's built-in
test runner. Tests that need a real MariaDB are skipped unless
`TEST_DATABASE_URL` is set (none exist yet in this step - all business logic
is written as pure functions or repo-fake-friendly modules so it's testable
without a database).

## Polar on your iPhone

Polar (the running app) has no Mac in the loop: GitHub Actions builds an
unsigned `.ipa` on `macos-15` and SideStore signs/installs it on your phone.

1. **Push to `main`** (or run the workflow manually: Actions > "Polar iOS
   build" > Run workflow). Any change under `apps/polar/**` or `packages/**`
   triggers it automatically.
2. **Wait for the build**, then open the **`polar-latest`** release on
   GitHub - either in the Actions run summary or under Releases. Open it
   **in Safari on your iPhone** and download `Polar.ipa`.
3. **Install it with SideStore**: My Apps > `+` > pick the downloaded IPA
   from Files. SideStore signs it with your Apple ID and installs it,
   same as the RunCoach build it replaces.
4. **On first launch**, allow the location, motion, and notification
   permission prompts - the run tracker, cadence/elevation sensors, and
   Live Activity all need them to work.

Until the backbone runs on the Oracle server, the phone can only reach
Olaf while both devices are on the same Wi-Fi (fetch today's brief at home,
so the phone can reach the PC's LAN IP). Once you head out the door without
Wi-Fi, the run itself still works fully offline: GPS, splits, cadence, the
Live Activity, and Olaf's brief-provided fallback lines all keep announcing
segment switches and splits. You just won't get live, freshly-generated
Olaf lines mid-run until either the backbone is reachable (same Wi-Fi) or
it's deployed to the public Oracle server.
