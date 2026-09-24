import React from 'react';
import { Text as RNText } from 'react-native';
import { useTheme } from '../ThemeProvider.jsx';

const VARIANTS = [
  'ghost', 'displayXl', 'display', 'h1', 'h2', 'h3', 'h4',
  'bodyLg', 'body', 'small', 'caption', 'eyebrow', 'data', 'dataMedium', 'numeric', 'label',
];

/**
 * @param {{variant?: 'displayXl'|'display'|'h1'|'h2'|'h3'|'h4'|'bodyLg'|'body'|'small'|'caption'|'eyebrow'|'data'|'dataMedium'|'numeric'|'label', color?: string, muted?: boolean}} props
 */
export function Text({ variant = 'body', color, muted = false, style, children, ...rest }) {
  const theme = useTheme();
  const typeStyle = theme.typography[VARIANTS.includes(variant) ? variant : 'body'];
  const resolvedColor = color || (muted ? theme.colors.textMuted : theme.colors.textStrong);
  return (
    <RNText style={[typeStyle, { color: resolvedColor }, style]} {...rest}>
      {children}
    </RNText>
  );
}

export default Text;
