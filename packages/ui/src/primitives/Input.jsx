import React, { useState } from 'react';
import { View, TextInput } from 'react-native';
import { useTheme } from '../ThemeProvider.jsx';
import { Text } from './Text.jsx';
import { Icon } from './Icon.jsx';

/** @param {{label?: string, hint?: string, error?: string, icon?: string, suffix?: React.ReactNode, disabled?: boolean}} props */
export function Input({ label, hint, error, icon, suffix, disabled = false, style, multiline, ...rest }) {
  const theme = useTheme();
  const c = theme.colors;
  const [focused, setFocused] = useState(false);

  const borderColor = error ? c.danger : focused ? c.ink[800] : c.borderHair;

  return (
    <View style={{ gap: 8 }}>
      {label ? <Text variant="eyebrow" muted>{label}</Text> : null}
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: multiline ? 'flex-start' : 'center',
            gap: 10,
            minHeight: 44,
            paddingHorizontal: 14,
            paddingVertical: multiline ? 10 : 0,
            backgroundColor: disabled ? c.snow[100] : c.surfaceCard,
            borderWidth: 1,
            borderColor,
            opacity: disabled ? 0.4 : 1,
          },
          focused && !error ? { borderBottomWidth: 2, borderBottomColor: c.accent } : null,
        ]}
      >
        {icon && <Icon name={icon} size={18} color={c.textMuted} />}
        <TextInput
          editable={!disabled}
          multiline={multiline}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={c.textFaint}
          style={[
            { flex: 1, fontFamily: theme.typography.h4.fontFamily, fontWeight: '500', fontSize: 15, color: c.textStrong, minHeight: multiline ? 60 : undefined, outlineStyle: 'none' },
            style,
          ]}
          {...rest}
        />
        {suffix}
      </View>
      {(hint || error) ? (
        <Text variant="caption" color={error ? c.danger : c.textMuted}>
          {error || hint}
        </Text>
      ) : null}
    </View>
  );
}

export default Input;
