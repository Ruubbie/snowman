import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../ThemeProvider.jsx';
import { Text } from './Text.jsx';

/** @param {{tone?: 'neutral'|'accent'|'info'|'success'|'warning'|'danger'|'solid', dot?: boolean}} props */
export function Badge({ children, tone = 'neutral', dot = false, style }) {
  const theme = useTheme();
  const c = theme.colors;
  const palette = {
    neutral: { bg: c.snow[200], fg: c.ink[600] },
    accent: { bg: c.carrot[50], fg: c.carrot[700] },
    info: { bg: c.ice[100], fg: c.ice[700] },
    success: { bg: c.green[50], fg: '#1F7A51' },
    warning: { bg: c.amber[50], fg: '#8F5F00' },
    danger: { bg: c.red[50], fg: '#A92E26' },
    solid: { bg: c.accent, fg: c.accentOn },
  }[tone] || {};

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          height: 22,
          paddingHorizontal: 8,
          backgroundColor: palette.bg,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      {dot && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: palette.fg }} />}
      <Text style={{ fontFamily: theme.typography.eyebrow.fontFamily, fontWeight: '700', fontSize: 11, lineHeight: 11, letterSpacing: 0.7, textTransform: 'uppercase' }} color={palette.fg}>
        {children}
      </Text>
    </View>
  );
}

export default Badge;
