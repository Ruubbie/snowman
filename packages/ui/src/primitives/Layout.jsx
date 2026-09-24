import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../ThemeProvider.jsx';

/** Vertical flex layout with token-driven gap. */
export function Stack({ children, gap, align, style }) {
  const theme = useTheme();
  return (
    <View
      style={[
        { flexDirection: 'column', gap: gap ?? theme.semanticSpacing.gap, alignItems: align },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Horizontal flex layout with token-driven gap. */
export function Row({ children, gap, align = 'center', justify, style, wrap = false }) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          gap: gap ?? theme.semanticSpacing.gap,
          alignItems: align,
          justifyContent: justify,
          flexWrap: wrap ? 'wrap' : 'nowrap',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export default { Stack, Row };
