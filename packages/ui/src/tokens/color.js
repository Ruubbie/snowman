// Olaf Design System — colors, translated 1:1 from design/olaf-ds/tokens.css
// (colors.css). Scale names match the CSS custom properties exactly
// (snow[0|50|100|200|300], frost[400|500], ink[600|700|800|900],
// carrot[50|100|300|500|600|700], ice[50|100|300|500|700], green/amber/red)
// plus the same semantic aliases (surface-page -> surfacePage, etc).
//
// The design defines a single ("snow-light") language — there is no dark
// variant in the source. `dark` is kept as an alias of `light` purely so
// ThemeProvider's existing override API keeps working; there is nothing to
// switch to yet.

const scale = {
  snow: { 0: '#FFFFFF', 50: '#F7F9FB', 100: '#EEF2F6', 200: '#E2E8EF', 300: '#CBD4DE' },
  frost: { 400: '#9AA7B6', 500: '#6B7888' },
  ink: { 600: '#475261', 700: '#2C3542', 800: '#1B222C', 900: '#10151C' },
  carrot: { 50: '#FFF4EC', 100: '#FFE3CF', 300: '#FFA366', 500: '#FF6B1A', 600: '#E85A0C', 700: '#B84406' },
  ice: { 50: '#F1F8FD', 100: '#E1F0FA', 300: '#A9D3F2', 500: '#4AA3DF', 700: '#1F6FA8' },
  green: { 50: '#EAF6F0', 500: '#2E9E6B' },
  amber: { 50: '#FDF5E4', 500: '#E0990F' },
  red: { 50: '#FCEDEC', 500: '#D9433A' },
};

const light = {
  ...scale,
  // semantic aliases (--surface-*, --text-*, --border-*, --accent*, etc.)
  surfacePage: scale.snow[50],
  surfacePanel: scale.snow[100],
  surfaceCard: scale.snow[0],
  surfaceSunken: scale.snow[200],
  surfaceInverse: scale.ink[800],
  surfaceScrim: 'rgba(247,249,251,.72)',

  textStrong: scale.ink[800],
  textBody: scale.ink[600],
  textMuted: scale.frost[500],
  textFaint: scale.frost[400],
  textInverse: scale.snow[0],
  textGhost: scale.snow[200],

  borderHair: scale.snow[200],
  borderDefault: scale.snow[300],
  borderStrong: scale.ink[800],

  accent: scale.carrot[500],
  accentHover: scale.carrot[600],
  accentPress: scale.carrot[700],
  accentSoft: scale.carrot[50],
  accentOn: scale.snow[0],

  info: scale.ice[500],
  success: scale.green[500],
  warning: scale.amber[500],
  danger: scale.red[500],

  focusRing: scale.carrot[100],

  // legacy aliases so any not-yet-ported call site keeps resolving to a
  // sane color instead of `undefined` (bg/surface/text/border/accentText)
  bg: scale.snow[50],
  surface: scale.snow[0],
  surfaceRaised: scale.snow[0],
  text: scale.ink[800],
  border: scale.snow[200],
  accentText: scale.snow[0],
};

export const colors = { light, dark: light };
export default colors;
