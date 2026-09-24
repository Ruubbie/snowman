import React from 'react';
import { Text as RNText, Platform } from 'react-native';
import { useTheme } from '../ThemeProvider.jsx';

/**
 * The one background ornament per screen: a huge black-weight word in
 * --snow-200, cropped by the frame. Purely decorative — absolutely
 * positioned by the caller, non-interactive.
 * @param {{children: string, outline?: boolean, size?: number}} props
 */
export function GhostWord({ children, outline = false, size = 160, style }) {
  const theme = useTheme();
  const webOutline = outline
    ? Platform.select({ web: { color: 'transparent', WebkitTextStroke: `1.5px ${theme.colors.snow[300]}` }, default: {} })
    : {};
  return (
    <RNText
      pointerEvents="none"
      accessible={false}
      numberOfLines={1}
      style={[
        theme.typography.ghost,
        {
          fontSize: size,
          lineHeight: size * 0.85,
          color: outline ? 'transparent' : theme.colors.textGhost,
        },
        webOutline,
        style,
      ]}
    >
      {children}
    </RNText>
  );
}

export default GhostWord;
