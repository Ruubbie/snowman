# Snowman progress

Direction, keep/throw-away list and the reasoning: [docs/olaf-plan.md](docs/olaf-plan.md).

## Done
- [x] Backbone (Fastify + MariaDB): pairing, events, jobs, websocket, module loader
- [x] Olaf brain: persona, budget, tools, chat; Kokoro voice for pre-made lines
- [x] Running module: 8-week program, rules, planner, analysis, brief, debrief, reminders, RunCoach import
- [x] Desktop app (`apps/desktop`, Electron): soft UI like the iPhone app; conversations, activity, usage, devices, health trends, workouts, plan
- [x] **Step 1 - cleanup (2026-09-25):** removed Polar (Expo app + native tracker), `packages/ui`, the Polar CI workflow, live cues, fake-run script

## Next (in order)
- [x] **Step 2 - Olaf iOS app skeleton:** SwiftUI + XcodeGen + GitHub Actions, installed with Impactor (SideStore/Sideloadly strip HealthKit); pairing, token in Keychain, chat with Olaf. Runs on the phone with HealthKit working
- [~] **Step 3 - HealthKit to Olaf:** health module (`/v1/health/import`, `/v1/health/summary`, tool `health_get_summary`) deployed; iOS sync on app open (resting HR, HRV, VO2max, weight, sleep stages, workouts). Tested on the phone. Still to do: background delivery; workout HR/route series
- [~] **Step 4 - Olaf to your run (no Watch):** the app shows today's session and Olaf's opening line; record it with the iPhone Fitness app; a running workout from Apple Health (last 3 days) becomes a run, completes that day's session and gets a debrief. WorkoutKit `CustomWorkout` scheduling only reaches an Apple Watch, so that waits for one
- [ ] **Step 5 - App Intents:** "What should I train today?", "How am I recovering?"
- [ ] **Step 6 - Home:** only once there are real devices
