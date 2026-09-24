import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../ThemeProvider.jsx';
import { Text } from './Text.jsx';

/**
 * @param {{label?: string, value: string|number, unit?: string, delta?: string, deltaTone?: 'up'|'down'|'accent'|'muted', size?: number, align?: 'left'|'center'}} props
 */
export function Metric({ label, value, unit, delta, deltaTone = 'muted', size = 44, align = 'left' }) {
  const theme = useTheme();
  const c = theme.colors;
  const unitSize = Math.max(12, Math.round(size * 0.36));
  const deltaColor = { up: c.success, down: c.danger, accent: c.accent, muted: c.textMuted }[deltaTone] || c.textMuted;

  return (
    <View style={{ alignItems: align === 'center' ? 'center' : 'flex-start', gap: 6 }}>
      {label ? (
        <Text variant="eyebrow" muted>
          {label}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <Text
          style={{
            fontFamily: theme.typography.display.fontFamily,
            fontWeight: '800',
            fontSize: size,
            lineHeight: size * 1.02,
            letterSpacing: size * -0.025,
            fontVariant: ['tabular-nums'],
          }}
        >
          {value}
        </Text>
        {unit ? (
          <Text style={{ fontFamily: theme.typography.h4.fontFamily, fontWeight: '600', fontSize: unitSize, marginLeft: 4 }} muted>
            {' '}
            {unit}
          </Text>
        ) : null}
      </View>
      {delta ? (
        <Text variant="dataMedium" color={deltaColor}>
          {delta}
        </Text>
      ) : null}
    </View>
  );
}

export default Metric;
