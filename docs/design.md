# Polar design system — Olaf Design System

`packages/ui` is a 1:1 React Native port of the **Olaf Design System**
("olaf-ds"), the user's Claude Design project. The mirrored source of truth
lives at `design/olaf-ds/` (`README.md`, `tokens.css`, `components.css`,
`ui_kits/polar/*.jsx`) — read that first when changing anything here; this
file just maps it onto the RN implementation. The whole app restyles by
editing `packages/ui/src/tokens/*` and the primitives listed below, never
per-screen.

## Voice & rules (from `design/olaf-ds/README.md`)

Snow-light language only (no dark theme in the source — see Theme below).
Carrot `#FF6B1A` is the **only** warm colour, max one focal point per view.
Corners are 0 everywhere except intrinsically round things (icon buttons,
radios, switches, rings). Sentence case; eyebrows UPPERCASE; wordmarks
lowercase (`olaf`, `polar`). Olaf speaks first person, no emoji, no
exclamation-mark enthusiasm.

## Tokens (`packages/ui/src/tokens/`)

Translated 1:1 from `design/olaf-ds/tokens.css`, same scale names:

- `color.js` — `snow[0|50|100|200|300]`, `frost[400|500]`,
  `ink[600|700|800|900]`, `carrot[50|100|300|500|600|700]`,
  `ice[50|100|300|500|700]`, `green/amber/red`, plus semantic aliases
  (`surfacePage`, `surfacePanel`, `textStrong`, `accent`, …). `colors.dark`
  is an alias of `colors.light` — the design defines no dark variant;
  `ThemeProvider`'s `override` prop is kept for forward-compatibility only.
- `typography.js` — Mulish (`ghost`/`displayXl`/`display`/`h1`-`h4`/
  `bodyLg`/`body`/`small`/`caption`/`eyebrow`/`numeric`) + DM Mono
  (`data`/`dataMedium`).
- `spacing.js` — `space-0..10` (0/4/8/12/16/24/32/48/64/96/144) + aliases.
- `radius.js` — `0`/`xs`(2)/`sm`(4)/`full`(999); `control`/`card` = 0.
- `elevation.js` — `hair`/`soft`/`float`/`drift`, each a web `boxShadow`
  string (exact CSS values) or an equivalent iOS shadow + Android elevation.
- `motion.js` — durations `fast`(140)/`base`(240)/`slow`(480)/`drift`(900)ms,
  `easings.emphasized` = `cubic-bezier(.2,.7,.2,1)`, `easings.settle`
  (switch-thumb overshoot only).

## Fonts

`@expo-google-fonts/mulish` + `@expo-google-fonts/dm-mono`, loaded once in
`apps/polar/app/_layout.jsx`. Replaces the previous `@expo-google-fonts/jost`
(removed).

## Components (`packages/ui/src/primitives/`, `src/charts/`)

RN ports of every olaf-ds component, same names/props as the contracts in
`design/olaf-ds/README.md`: `Button`, `IconButton`, `Input`, `Select`,
`Checkbox`, `Radio`, `Switch`, `Card`, `Badge`, `Tag`, `Metric`, `Tabs`,
`DashPager`, `Dialog`, `Toast`, `Tooltip`, `Icon` (lucide-react-native,
kebab-case name → PascalCase lookup, 1.5px stroke), `GhostWord`, `Ring`.
Plus `SplitFrame` (the signature split-frame layout primitive) and our
restyled extras: `Screen`, `Stack`/`Row`, `Text`, `Sheet`,
`SegmentTimeline` (numbered interval list, DashPager/Ring motifs),
`PaceChart`, `SplitBars`, `RouteMap` (+ `.web.jsx`), `PulseDot`,
`EmptyState`, `Enter`.

Removed (superseded by the design): `Chip` → `Tag`/`Badge`, `Stat` →
`Metric`, `ProgressRing` → `Ring`, `Headline` → display type roles,
`BackgroundBand` → `GhostWord`.

## Animation rule

**Never** use Reanimated layout animations (`entering=`/`FadeIn` etc.) — they
get stuck half-faded on web. Every entrance uses `Enter` (shared-value
fade + rise 12px) or manual `useSharedValue`/`withTiming` with the design's
durations/easing. All animated primitives respect `useReducedMotion()`.
Hover states (darken/lift/gap-widen) are web-only, gated on `Platform.OS`.

## Frosted overlays

`Dialog`/`Sheet` scrims: `expo-blur`'s `BlurView` on iOS/Android, CSS
`backdropFilter: saturate(1.4) blur(14px)` on web — matches
`--blur-frost`.

## Polar screens → olaf-ds kit mapping

The `ui_kits/polar/*.jsx` example screens are the visual spec, translated
one-to-one; only fake data was swapped for real data (sdk calls, tracker,
cue events, upload queue, notifications, pairing all unchanged):

| Design screen | Route(s) | Notes |
|---|---|---|
| `TodayScreen` | `app/(tabs)/today.jsx` | + Olaf's brief opening line from `/session/[id]` brief endpoint |
| `RunScreen` | `app/run/index.jsx` | interval sessions: ring shows current-segment progress + DashPager; else distance ring |
| `SummaryScreen` | `app/run/summary.jsx` | "Heart rate" tab → "Pace" (ice-300/carrot bars from samples); effort Tags + note Input added |
| `HistoryScreen` | `app/(tabs)/log.jsx`, `app/runs/[id].jsx` | real Week/Month/Year totals computed client-side from `runs()` |
| tab bar (`Phone.jsx`) | `src/components/TabBar.jsx` | raised 56px carrot Start button, routes to today's session or a freeform run |

No heart-rate hardware, so: `Heart` metric → `Cadence` (spm); `Avg HR` →
`Avg cadence`. `run.kind` (easy/tempo/long) isn't joined onto the `runs`
table server-side yet, so `src/lib/runKind.js` infers a display label from
pace/distance — cosmetic only, never sent to the backend.

Screens outside the kit (Pair, Settings, the pre-run brief at
`session/[id]`, run detail at `runs/[id]`, the design gallery) share
`src/components/PolarHeader.jsx` (lowercase `polar` wordmark + one plain
IconButton) and the same eyebrow + 2-line headline + `SplitFrame` + square
controls language.

## Where things live

```
design/olaf-ds/                        mirrored source of truth (read-only)
packages/ui/src/tokens/*.js             color / typography / spacing / radius / elevation / motion
packages/ui/src/primitives/*.jsx        Button, Card, Dialog, Ring, GhostWord, SplitFrame, …
packages/ui/src/charts/*.jsx            PaceChart, SplitBars, RouteMap(+.web)
packages/ui/src/ThemeProvider.jsx       light only (dark aliases light)
apps/polar/src/components/TabBar.jsx    Today/Runs + raised Start button
apps/polar/src/components/PolarHeader.jsx  header for non-kit screens
apps/polar/app/dev/design.jsx           gallery: every component + foundations
```

## Known gaps vs. the design (not reproducible as specified)

- No dark theme (the source design has none — see Theme above).
- `Select` renders a native `<select>` on web but a simple tap-to-cycle row
  on native (no extra native picker dependency was added).
- History's kind filter tags (Easy/Tempo/Long) are a pace/distance
  heuristic, not the planned session's actual `kind`, since the backend
  doesn't join that onto `runs` yet.
