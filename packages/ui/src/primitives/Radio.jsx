import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../ThemeProvider.jsx';
import { Text } from './Text.jsx';

/** @param {{selected: boolean, onPress: () => void, disabled?: boolean}} props */
export function Radio({ children, selected = false, onPress, disabled = false, style }) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: disabled ? 0.4 : 1 }, style]}
    >
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          borderWidth: 1,
          borderColor: selected ? c.accent : c.frost[400],
          backgroundColor: c.surfaceCard,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} />}
      </View>
      {children ? (
        <Text style={{ fontFamily: theme.typography.h4.fontFamily, fontWeight: '500', fontSize: 14 }}>{children}</Text>
      ) : null}
    </Pressable>
  );
}

export default Radio;
