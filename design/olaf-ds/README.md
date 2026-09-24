# Olaf Design System (mirror)

Source of truth: the user's Claude Design project "Olaf Design System"
(https://claude.ai/design/p/43c4a5b6-8d4e-4caf-a345-d0b7df1fed3f). This folder mirrors what Polar needs:
`tokens.css`, `components.css`, component contracts below, and the Polar UI kit in `ui_kits/polar/`.
The design's own reference image is third-party and intentionally not mirrored.

## Rules (from the design's readme)
- **Voice:** Olaf speaks in first person ("I moved your run to 08:15"). UI addresses the user as "you". Warm, calm, brief. No exclamation-mark enthusiasm, no snowman puns, no emoji.
- **Casing:** sentence case everywhere. Eyebrows/kickers UPPERCASE with wide tracking (via transform). Wordmarks lowercase: `olaf`, `polar`.
- **Length:** display headlines 2–3 words per line, max two lines ("Easy 5 km / at 08:15"). Body one or two short sentences.
- **Numbers:** metric, 24h clock, true minus `−`, `°`. Units smaller and muted next to the value (`5:12 /km`).
- **Colour:** Snow for surfaces, Frost/Ink for text & lines, **Carrot #FF6B1A is the only warm colour** (primary buttons, rings, active dashes, eyebrows). Ice blue for data/info. Semantic green/amber/red with pale tints. Never more than one carrot focal point per view.
- **Type:** Mulish throughout (800 display −0.025em; 700 headings; 400 body 15/1.7). DM Mono for small data readouts. Big numbers Mulish 800 tabular.
- **Layout:** split frame — page `--snow-50` with a `--snow-100` panel on part of the screen; content straddles the seam. Offset tint blocks bleed to the edge behind text.
- **Backgrounds:** flat colour only, no gradients/textures. The **ghost word** (huge black-weight word in `--snow-200`, cropped by the frame) is the one background ornament, one per screen.
- **Corners: 0.** Buttons, inputs, cards, dialogs, badges are square. Only intrinsically round things are round: icon buttons, radios, switches, rings.
- **Cards:** white with `--shadow-soft` (no border), flat `tint` blocks, or 1px `outline`. Never a coloured left border.
- **Shadows:** cool blue-grey, long and soft (hair, soft, float, drift). Drift only for the single hero object / dialogs.
- **Lines:** 1px hairlines (`--snow-200`), 1.5px icon strokes, 2–4px carrot bars for active states.
- **Motion:** ease-out `cubic-bezier(.2,.7,.2,1)`; 140/240/480ms, 900ms drift for rings. Entrances fade + rise 12px. Only switch thumbs use a slight settle overshoot. No bounces, no spins.
- **Press:** 1px translate down (buttons) or scale .96 (round buttons); carrot-700 on primary. **Hover (web):** primary darkens; outline fills ink; ghost turns carrot and its arrow gap widens; cards lift 2px to `float`.
- **Focus:** 3px `--carrot-100` ring; inputs get a 2px carrot underline inside the box.
- **Transparency/blur:** only overlays — scrim `rgba(247,249,251,.72)` + 14px backdrop blur.
- **Icons:** Lucide outline at 1.5px stroke (1.25 above 32px, 2 below 16px). Common: menu, move-right, play, pause, snowflake, house, lightbulb, thermometer, footprints, timer, heart-pulse, mic, send, x, check, chevron-down, bell, sun, map, lock, square, chevron-right, arrow-right.

## Component contracts (web originals; port to React Native with the same props)
- **Button** `{variant: 'primary'|'secondary'|'outline'|'ghost' (default primary), size: 'sm'|'md'|'lg', iconLeft?, iconRight? (Lucide; ghost defaults to 'move-right'), block?, disabled?, onPress}`. Heights 36/44/56, padding 16/22/30, font 13/14/15 bold, gap 10 (ghost hover gap 16).
- **IconButton** `{icon, variant: 'outline'|'solid'|'dark'|'plain', size (diameter, default 44), iconSize?, label (a11y, required)}`. Round.
- **Input** `{label? (eyebrow), hint?, error?, icon? (leading), suffix?}`; Select/Checkbox/Radio/Switch per components.css.
- **Card** `{tone: 'white'|'tint'|'outline'|'ink', eyebrow? (carrot uppercase kicker), title?, padding (default 28), interactive?}`.
- **Badge** `{tone: 'neutral'|'accent'|'info'|'success'|'warning'|'danger'|'solid', dot?}` — tiny uppercase, sharp.
- **Tag** `{selected?, icon?, onRemove?}` — outline chip, selected fills ink.
- **Metric** `{label?, value, unit?, delta?, deltaTone: 'up'|'down'|'accent'|'muted', size (default 44), align: 'left'|'center'}` — unit font = max(12, round(size*0.36)); delta colours: up=success, down=danger, accent=accent, else muted.
- **Tabs** `{items: (string|{value,label})[], value?, defaultValue?, onChange?, variant: 'line'|'pill'}` — line: carrot 2px bar draws under active (480ms); pill: segmented control on snow-100.
- **DashPager** `{count, index, onChange?}` — active = 64×4 carrot bar, others 14×2 frost; width animates 480ms.
- **Dialog** `{open, title?, children, actions?, onClose?}` — frosted scrim + white square panel, drift shadow, rise 12px.
- **Toast** `{tone: 'accent'|'success'|'info'|'danger', icon?, title?, children, onClose?}` — white, float shadow, round tinted icon mark 32px.
- **Tooltip** — ink bubble, 12px semibold, fades/rises 4px.
- **Icon** `{name (Lucide kebab-case), size (default 20), stroke (default 1.5), color?, label?}`.
- **GhostWord** `{children, outline?, size (default ~140–260)}` — weight 900, line-height .85, letter-spacing −0.04em, color `--snow-200`, bleeds off the frame.
- **Ring** `{size (default 100), weight (default 12), color (default accent), progress?}` — without progress: a plain carrot circle outline (brand motif); with progress: track `--snow-200` + carrot arc from 12 o'clock, stroke-dashoffset animates over 900ms ease-out.

## Polar UI kit (ui_kits/polar)
- Tab bar (from Phone.jsx): white bar with 1px top hairline; items "Today" (sun icon) and "Runs" (footprints icon), 11px bold labels, active = strong text + 28×2 carrot dash at the top, inactive = faint; a **56px round carrot Start button (play icon) in the centre**, raised 22px above the bar with float shadow.
- Screens: `TodayScreen.jsx`, `RunScreen.jsx`, `SummaryScreen.jsx`, `HistoryScreen.jsx` (web mocks with fake data; wire real data).
