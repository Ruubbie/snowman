# Snowman progress

Direction, keep/throw-away list and the reasoning: [docs/olaf-plan.md](docs/olaf-plan.md).

## Done
- [x] Backbone (Fastify + MariaDB): pairing, events, jobs, websocket, module loader
- [x] Olaf brain: persona, budget, tools, chat; Kokoro voice for pre-made lines
- [x] Running module: 8-week program, rules, planner, analysis, brief, debrief, reminders, RunCoach import
- [x] Browser dashboard (`apps/desktop`): conversations, activity, usage, devices, workouts, plan
- [x] **Step 1 - cleanup (2026-09-25):** removed Polar (Expo app + native tracker), `packages/ui`, the Polar CI workflow, Electron shell, live cues, fake-run script

## Next (in order)
- [~] **Step 2 - Olaf iOS app skeleton:** SwiftUI + XcodeGen + GitHub Actions + SideStore (pipeline from RunCoach); pairing, token in Keychain, chat with Olaf. Code in `apps/ios` + `olaf-ios.yml`; first CI build + test on the phone still to do
- [ ] **Step 3 - HealthKit to Olaf:** workouts (route, HR), sleep, resting HR, HRV, VO2max; backbone `health` module
- [ ] **Step 4 - Olaf to WorkoutKit:** planner emits workout JSON, the app schedules a `CustomWorkout` on the Watch; the brief becomes a short pre-run message
- [ ] **Step 5 - App Intents:** "What should I train today?", "How am I recovering?"
- [ ] **Step 6 - Home:** only once there are real devices
