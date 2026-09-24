# Snowman progress

Open this file in VS Code and press `Ctrl+Shift+V` for a live preview. Agents tick boxes as they finish work.
The Source Control panel (`Ctrl+Shift+G`) shows every file that changed.

## Step 1 — Backbone ✅
- [x] Monorepo, backbone (Fastify + MariaDB), pairing, events, jobs, websocket
- [x] Olaf core: persona, budget, tools, chat
- [x] Running module: program, rules, planner, import, analysis, brief, live cues, debrief, reminders
- [x] Local MariaDB running, migrations applied, first RunCoach run imported
- [x] Olaf live test: brief (~23 s, prepared before a run) and live cue (~1.5 s)

## Step 2 — Polar (running app)

### A. Design system + app screens (JS)
- [x] `packages/ui`: tokens (color, spacing, radius, type, motion) + theme provider (light/dark)
- [x] Animated primitives: Screen, Stack, Text, Card, Button, Chip, Stat, ProgressRing, SegmentTimeline, ListRow, Sheet, Toast
- [x] Charts + route: PaceChart, RouteMap (Apple Maps on iOS, SVG on web), route draw animation
- [x] Design gallery screen (`/dev/design`) to preview every component in the browser
- [x] `apps/polar` Expo app scaffold (expo-router, JS), pairing screen, secure token storage
- [x] Today screen (card kinds), pre-run brief screen
- [x] Run screen (live stats, segment ring, Olaf lines) with web run simulator
- [x] Post-run: effort + note, offline upload queue, Olaf debrief
- [x] Log + run detail: route, pace-over-time, splits, segment vs target
- [x] Local reminders from the backbone
- [x] Web build passes (`npx expo export -p web`)

### B. Native iOS + build pipeline (Swift)
- [x] `RunTracker` Expo module: GPS filter, 1 s clock, segments, cadence, barometer, voice with music ducking
- [x] Live Olaf cues from native (works with the screen locked) + brief fallback lines
- [x] Samples/events recorded to file per the telemetry contract
- [x] Live Activity / Dynamic Island (segment, countdown, distance, pace)
- [x] GitHub Actions: unsigned IPA build → release for SideStore
- [x] README: install Polar on iPhone

## Step 3 — Olaf everywhere (later)
- [ ] Olaf's character (persona)
- [ ] Desktop overlay (Electron)
- [ ] Olaf iPhone app, Siri Shortcut
- [ ] Oracle server deploy
