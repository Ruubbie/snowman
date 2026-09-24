import React from 'react';
import { View, Platform } from 'react-native';
import { useTheme } from '../ThemeProvider.jsx';
import { Text } from './Text.jsx';
import { Icon } from './Icon.jsx';

/**
 * Minimal cross-platform select. On web it renders a native <select> for
 * correct accessibility/keyboard behaviour; on native it falls back to a
 * plain row that cycles through options on press (no extra native deps).
 * @param {{label?: string, value: string, options: (string|{value,label})[], onChange: (v: string) => void, disabled?: boolean}} props
 */
export function Select({ label, value, options = [], onChange, disabled = false }) {
  const theme = useTheme();
  const c = theme.colors;
  const normalized = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));

  const wrapStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    paddingHorizontal: 14,
    backgroundColor: c.surfaceCard,
    borderWidth: 1,
    borderColor: c.borderHair,
    opacity: disabled ? 0.4 : 1,
  };

  return (
    <View style={{ gap: 8 }}>
      {label ? <Text variant="eyebrow" muted>{label}</Text> : null}
      {Platform.OS === 'web' ? (
        <View style={wrapStyle}>
          <select
            value={value}
            disabled={disabled}
            onChange={(e) => onChange?.(e.target.value)}
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: theme.typography.h4.fontFamily, fontWeight: 500, fontSize: 15, color: c.textStrong, appearance: 'none' }}
          >
            {normalized.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <Icon name="chevron-down" size={16} color={c.textMuted} />
        </View>
      ) : (
        <View
          onTouchEnd={() => {
            if (disabled) return;
            const idx = normalized.findIndex((o) => o.value === value);
            const next = normalized[(idx + 1) % normalized.length];
            onChange?.(next?.value);
          }}
          style={wrapStyle}
        >
          <Text style={{ fontFamily: theme.typography.h4.fontFamily, fontWeight: '500', fontSize: 15 }}>
            {normalized.find((o) => o.value === value)?.label || ''}
          </Text>
          <Icon name="chevron-down" size={16} color={c.textMuted} />
        </View>
      )}
    </View>
  );
}

export default Select;
