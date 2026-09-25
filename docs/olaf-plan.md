# Olaf: what to keep, what to throw away (2026-09-25)

The new direction is that Apple devices supply the sensors and the UI, and Olaf is the brain.
The Apple Workout app does the tracking. Olaf plans, analyses and coaches.
We follow KISS and YAGNI: we build only what the next step needs.

## Where we are and where we're going

| Area | Now | Target |
|---|---|---|
| Server | `apps/backbone` (Fastify + MariaDB) on Oracle, Claude API | Olaf Core. Oracle and Claude are fine for now. Local hosting comes later |
| iPhone | `apps/polar` (Expo/React Native) with its own GPS tracker, live cues, Live Activity | Native SwiftUI **Olaf app**: HealthKit in, WorkoutKit out, App Intents for Siri |
| Workouts | Polar tracks the run itself | Apple Workout app on the Watch tracks it, and HealthKit sends the result to Olaf |
| Smart home | nothing | nothing until there are devices (see "Not now") |
| Dashboard | `apps/desktop` (React + Electron) | The Olaf home app on the desktop: all data, trends, soft UI like the iPhone app |

## Keep

- **`apps/backbone` becomes Olaf Core.** We keep auth/pairing, the event bus, jobs, the websocket, the module loader, the brain (Claude, tools, budget, persona) and voice (Kokoro, used for pre-made brief audio).
- **`packages/modules/running` becomes the fitness module.** We keep program, rules, planner, analysis, brief/debrief and reminders. What changes:
  - input: HealthKit workouts instead of our own samples
  - output: a structured workout in JSON for WorkoutKit
- **`packages/shared`** (event names, helpers) and **`packages/sdk`** (the dashboard uses it).
- **`apps/desktop` React screens**, used to view and delete data. We don't invest in them any further.
- **MariaDB for everything.** Time-series data goes in plain tables (`health_samples(type, ts, value)`). That's plenty for one user.
- **`design/olaf-ds`**: its tokens are the reference for the SwiftUI theme.
- **RunCoach's build pipeline** (XcodeGen `project.yml`, GitHub Actions on macOS, SideStore). It's proven to work from Windows, so it becomes the template for the Olaf app.

## Throw away

- **`apps/polar`, all of it.** That includes RunTracker (GPS, CueEngine, VoiceCoach), the Live Activity, the simulator, the sync queue and the Expo config. Reasons:
  - the Apple Workout app now does the tracking
  - HealthKit, WorkoutKit and App Intents are Swift-only, so Expo plus native modules would mean two toolchains
- **`packages/ui`**: it's a React Native port of the design system and only Polar uses it.
- **`.github/workflows/polar-ios.yml`**: it gets replaced by a workflow for the Olaf app.
- **Live-cue code:** the `/v1/running/cue` route and `backbone/scripts/fake-run.js`. Olaf's voice can't run inside Apple's Workout app. (`shared/src/runningTelemetry.js` stays: the run upload uses it, and HealthKit workouts will come in the same way.)
- **RunCoach (Downloads)**: delete it once its pipeline has been copied. `import-runcoach.js` and `running/src/import.js` can go once the old runs have been imported.

## Not now (YAGNI). Build these when there's a concrete need

- Our own device registry, state engine and automation engine, plus Matter, Thread, Zigbee and Home Assistant. **There are no devices yet.** Once the first device appears: an MQTT broker and an ESP32 on a small local box, because the cloud server can't reach the LAN.
- The intent → validation → deterministic-action layer with risk levels. Add a `risk` field to `ToolDef` when the first home action exists. Today's tools only change plan data (low risk).
- A time-series DB, a vector DB, a local LLM, local STT, ML pattern detection, a separate context-engine service, and VLANs.

## Build order

1. ✅ **Cleanup (done 2026-09-25).** Delete everything on the "Throw away" list, then check that the backbone and running tests still pass.
2. **Olaf iOS app skeleton.** SwiftUI, XcodeGen and CI, copied from RunCoach. It pairs using the existing pairing flow, keeps the token in the Keychain, and has a chat screen that uses the existing brain routes.
3. **HealthKit → Olaf.**
   - Data: workouts (with route and heart rate), sleep, resting heart rate, HRV and VO2max.
   - How: `HKAnchoredObjectQuery` and `HKObserverQuery` with background delivery, then a POST to a new backbone `health` module. The tables are `workouts`, `health_samples` and `sleep_sessions`.
4. **Olaf → WorkoutKit (closes the loop).**
   - The planner emits a workout as JSON (warm-up, blocks, steps, goal, alert).
   - The app turns it into a `CustomWorkout` and schedules it with `WorkoutScheduler`, so it shows up on the Watch.
   - When it's done, step 3 imports it, the analysis runs, and the planner adjusts the plan.
5. **App Intents for Siri:** "What should I train today?" and "How am I recovering?", both through `AppShortcutsProvider`.
6. **Home, later.** Only once there are real devices.

## Apple: supported, workaround, or impossible

These weren't re-checked against Apple's docs in this session. **Check them at the start of each step.**

- **Supported:**
  - HealthKit reads and background delivery. Apple doesn't guarantee when background deliveries arrive, and for some types it's at most hourly.
  - WorkoutKit `CustomWorkout` and `WorkoutScheduler` (iOS 17 / watchOS 10). There's a cap on how many workouts can be scheduled at once.
  - App Intents and App Shortcuts (Siri phrases).
  - Local notifications.
  - Opening Maps with a destination.
- **Needs a workaround:**
  - Olaf only knows your travel destination if navigation starts *through* Olaf: an "I'm going to X" intent opens Maps.
  - CarPlay connecting, arriving and leaving, and Focus changes all go through Shortcuts personal automations that call an Olaf intent.
- **Impossible:**
  - Intercepting arbitrary Siri requests.
  - Reading the destination or state of a navigation someone else started in Maps.
  - Custom Olaf voice or cues inside Apple's Workout app.
  - Push notifications with a free Apple ID.
- **Sideloading with a free Apple ID:** you re-sign every 7 days and get no push. Whether the HealthKit capability works has to be checked on the first build. A paid developer account (€99/yr) removes all of these limits.

## Decision to confirm

Switching to the Apple Workout app means **no more live Olaf voice during runs**. Apple's own alerts replace it (pace, HR zone, interval changes). Olaf talks before the run (brief) and after it (debrief).
