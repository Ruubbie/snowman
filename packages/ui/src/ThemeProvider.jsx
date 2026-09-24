import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { colors } from './tokens/color.js';
import { spacing, semanticSpacing } from './tokens/spacing.js';
import { radius } from './tokens/radius.js';
import { typography } from './tokens/typography.js';
import { elevation } from './tokens/elevation.js';
import { durations, easings, springs, stagger, press } from './tokens/motion.js';

const ThemeContext = createContext(null);

function buildTheme(scheme) {
  const mode = scheme === 'dark' ? 'dark' : 'light';
  return {
    mode,
    colors: colors[mode],
    spacing,
    semanticSpacing,
    radius,
    typography,
    elevation,
    motion: { durations, easings, springs, stagger, press },
  };
}

/**
 * @param {{children: React.ReactNode, override?: 'light'|'dark'}} props
 * The Olaf Design System defines a single "snow-light" language — there is
 * no dark variant in the source (`colors.dark` is an alias of `colors.light`,
 * see tokens/color.js). The `override` prop and system-scheme lookup are
 * kept so this API doesn't change shape if a dark theme is added later; for
 * now every mode renders identically.
 */
export function ThemeProvider({ children, override }) {
  const systemScheme = useColorScheme();
  const theme = useMemo(() => buildTheme(override || systemScheme), [override, systemScheme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) return buildTheme('light'); // safe default outside a provider (e.g. tests)
  return theme;
}

export default ThemeProvider;
