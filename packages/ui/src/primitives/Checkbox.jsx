import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../ThemeProvider.jsx';
import { Text } from './Text.jsx';
import { Icon } from './Icon.jsx';

/** @param {{checked: boolean, onChange: (v: boolean) => void, disabled?: boolean}} props */
export function Checkbox({ children, checked = false, onChange, disabled = false, style }) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange?.(!checked)}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: disabled ? 0.4 : 1 }, style]}
    >
      <View
        style={{
          width: 18,
          height: 18,
          borderWidth: 1,
          borderColor: checked ? c.accent : c.frost[400],
          backgroundColor: checked ? c.accent : c.surfaceCard,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked && <Icon name="check" size={13} stroke={2.5} color={c.snow[0]} />}
      </View>
      {children ? (
        <Text style={{ fontFamily: theme.typography.h4.fontFamily, fontWeight: '500', fontSize: 14 }}>{children}</Text>
      ) : null}
    </Pressable>
  );
}

export default Checkbox;
