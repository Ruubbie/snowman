// Motion tokens — 1:1 from design/olaf-ds/tokens.css (effects.css). One
// ease-out curve everywhere, three "human" durations, one long drift for
// rings. No bounces, no spins; only switch thumbs get a slight settle
// overshoot. Components must read from here (not hardcode) and must
// respect reduced motion via useReducedMotion() at the call site.
import { Easing } from 'react-native-reanimated';

export const durations = {
  fast: 140,
  base: 240,
  slow: 480,
  drift: 900,
  // legacy alias
  instant: 90,
  ambient: 14000,
};

const easeOut = Easing.bezier(0.2, 0.7, 0.2, 1);
const easeInOut = Easing.bezier(0.6, 0, 0.3, 1);
const easeSettle = Easing.bezier(0.34, 1.3, 0.5, 1);

export const easings = {
  standard: easeOut,
  emphasized: easeOut,
  inOut: easeInOut,
  settle: easeSettle,
  exit: Easing.bezier(0.4, 0, 1, 1),
};

export const springs = {
  // only used for the switch-thumb settle; everything else is withTiming
  settle: { damping: 14, stiffness: 220, mass: 0.7 },
  snappy: { damping: 22, stiffness: 300, mass: 0.6 },
  gentle: { damping: 26, stiffness: 170, mass: 1 },
};

export const stagger = {
  step: 50,
};

export const press = {
  // round controls (IconButton, Ring-adjacent buttons) scale .96 on press
  scale: 0.96,
  // rectangular buttons translate 1px down instead of scaling
  translate: 1,
};

export default { durations, easings, springs, stagger, press };
