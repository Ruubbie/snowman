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

## Next up (agreed 2026-09-24, in this order)
- [x] **Fix real tracking on iPhone.** The first real walk used the web simulator: `apps/polar/modules/run-tracker` has no `.podspec`, so the native RunTracker module was never compiled in and `src/tracker/index.js` silently fell back to `simulator.js`. Fix: add podspec, never use the simulator on a device (show a clear error instead), confirm in CI that the module is linked, and give the user a home test checklist before the next walk.
  Done: podspec + SDK 57 autolinking config, CI checks RunTracker is linked, Swift compile fixes; the polar-latest IPA has the real tracker. Still to do: the home test on the phone.
- [x] **Stop wasted AI calls.** Each app refresh triggers a new Olaf call for the Today message. Cache per session/day on the server and only regenerate when something changes.
  Done: the brief is stored with a hash of its inputs and reused until they change (`force` regenerates).
- [x] **Desktop dashboard (Electron).** View everything collected: conversations with Olaf, workouts (routes, samples, cues), plan decisions, AI usage and costs. Delete test/false data (runs incl. samples/events/cues, conversations).
  Done: `apps/desktop` (Electron + Vite + React, Olaf DS, light/dark; not yet launched as Electron, only checked in the browser) as Olaf's home - Home, Conversations, Activity, Usage & budget, Devices, Settings, plus the Running module (workouts with speed-coloured route replay, charts, timeline, cues, fake-data badges, bulk delete; plan decisions + briefs); backbone `/v1/admin/*` + `/v1/admin/running/*`, SDK `client.admin`.
- [x] **Server voice engine (TTS).** The server generates Olaf's audio so the voice is identical on every device and sounds human. Choose between a local model on the Oracle server (e.g. Kokoro/Piper, free, check speed on 2 Arm cores) and a paid API; cache audio for repeated lines.
  - Done (backbone): Kokoro-82M (fp32) in `apps/backbone/src/voice`, one job at a time, disk cache, `/v1/voice/speak|audio|status`, cue + brief responses carry `audio`, SDK `voice.*`. Estimated ~1.0-1.5x realtime on 2 Arm cores, so brief lines are pre-made and a live cue arrives a few seconds late. Voice samples are in `data/voice-samples/`. Voice blends (`am_puck*0.6+af_heart*0.4`) and `OLAF_VOICE_PITCH` give Olaf his own voice; candidates in `data/voice-samples/olaf/`. Next: pick a voice, then Polar plays server audio with on-device speech as the fallback.

## Step 3 — Olaf everywhere (later)
- [x] Olaf's character (persona): energetic, own version of the snowman; personal file `data/persona.md`, uploaded to the server by scp
- [ ] Desktop overlay (Electron)
- [ ] Olaf iPhone app, Siri Shortcut
- [ ] Oracle server deploy
