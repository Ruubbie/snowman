# Snowman

Snowman is a personal AI backbone that runs locally (for now) and hosts
**Olaf**, an AI character built on the Claude API. This repo is step 1: a
monorepo skeleton, the Node backbone (Fastify + MariaDB), a running-coach
module, Olaf's brain core, and a browser dashboard (`apps/desktop`).
Direction and build order: [docs/olaf-plan.md](docs/olaf-plan.md).

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

apps/desktop/             browser dashboard: view and delete everything Olaf collected

NEXT (see docs/olaf-plan.md):
apps/ios/                 native SwiftUI Olaf app: HealthKit in, WorkoutKit out, App Intents
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
tracker contract in `packages/shared/src/runningTelemetry.js`, ; the
Olaf iPhone app will upload HealthKit workouts through it. `analysis.js` turns that
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

## Olaf on your iPhone

`apps/ios` is a native SwiftUI app. It's built from Windows: GitHub Actions
(`.github/workflows/olaf-ios.yml`) generates the Xcode project with XcodeGen
and builds an unsigned `Olaf.ipa`, and SideStore signs and installs it.

1. Push a change under `apps/ios/**` to `main` (or run "Olaf iOS build" by hand in Actions).
2. Open the **`olaf-latest`** release in Safari on the iPhone and download `Olaf.ipa`.
3. SideStore: My Apps > `+` > pick the IPA.
4. On the PC: `npm run pair -- iPhone`, then enter the PC's LAN address
   (e.g. `192.168.1.10:4000`) and the code in the app. Allow local network access.
