// Mulish (display/body) + DM Mono (small data readouts), loaded in the app
// root via @expo-google-fonts/mulish + @expo-google-fonts/dm-mono. Replaces
// Jost. Falls back to the platform default automatically before fonts are
// ready (RN just ignores an unknown fontFamily).
const light = 'Mulish_300Light';
const regular = 'Mulish_400Regular';
const medium = 'Mulish_500Medium';
const semibold = 'Mulish_600SemiBold';
const bold = 'Mulish_700Bold';
const extrabold = 'Mulish_800ExtraBold';
const black = 'Mulish_900Black';
const mono = 'DMMono_400Regular';
const monoMedium = 'DMMono_500Medium';

// em -> px letterSpacing helpers (RN letterSpacing is absolute, CSS tracking is em-relative)
const em = (size, tracking) => Math.round(size * tracking * 1000) / 1000;

export const typography = {
  // the huge background ornament word — size is usually overridden per call site
  ghost: { fontFamily: black, fontWeight: '900', fontSize: 180, lineHeight: 153, letterSpacing: em(180, -0.04) },

  displayXl: { fontFamily: extrabold, fontWeight: '800', fontSize: 96, lineHeight: 101, letterSpacing: em(96, -0.025) },
  display: { fontFamily: extrabold, fontWeight: '800', fontSize: 64, lineHeight: 67, letterSpacing: em(64, -0.025) },
  h1: { fontFamily: extrabold, fontWeight: '800', fontSize: 44, lineHeight: 48, letterSpacing: em(44, -0.025) },
  h2: { fontFamily: bold, fontWeight: '700', fontSize: 30, lineHeight: 36, letterSpacing: em(30, -0.01) },
  h3: { fontFamily: bold, fontWeight: '700', fontSize: 20, lineHeight: 26, letterSpacing: em(20, -0.01) },
  h4: { fontFamily: bold, fontWeight: '700', fontSize: 17, lineHeight: 22, letterSpacing: em(17, -0.01) },

  bodyLg: { fontFamily: regular, fontWeight: '400', fontSize: 17, lineHeight: 29 },
  body: { fontFamily: regular, fontWeight: '400', fontSize: 15, lineHeight: 26 },
  small: { fontFamily: regular, fontWeight: '400', fontSize: 13, lineHeight: 21 },
  caption: { fontFamily: regular, fontWeight: '400', fontSize: 12, lineHeight: 17 },

  eyebrow: { fontFamily: bold, fontWeight: '700', fontSize: 11, lineHeight: 11, letterSpacing: em(11, 0.2), textTransform: 'uppercase' },

  data: { fontFamily: mono, fontWeight: '400', fontSize: 13, lineHeight: 13 },
  dataMedium: { fontFamily: monoMedium, fontWeight: '500', fontSize: 13, lineHeight: 13 },

  // tabular figures for big numbers (Metric/Ring center/timers)
  numeric: { fontFamily: extrabold, fontWeight: '800', fontSize: 34, lineHeight: 34, letterSpacing: em(34, -0.025), fontVariant: ['tabular-nums'] },

  label: { fontFamily: semibold, fontWeight: '600', fontSize: 13, lineHeight: 16 },
};

export const fontFamilies = { light, regular, medium, semibold, bold, extrabold, black, mono, monoMedium };

export default typography;
