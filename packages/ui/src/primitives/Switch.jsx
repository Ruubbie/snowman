import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../ThemeProvider.jsx';
import { Text } from './Text.jsx';

/**
 * The one place the design allows a slight settle overshoot: the thumb.
 * @param {{checked: boolean, onChange: (v: boolean) => void, disabled?: boolean}} props
 */
export function Switch({ children, checked = false, onChange, disabled = false, style }) {
  const theme = useTheme();
  const c = theme.colors;
  const reducedMotion = useReducedMotion();
  const x = useSharedValue(checked ? 18 : 0);

  useEffect(() => {
    const target = checked ? 18 : 0;
    x.value = reducedMotion ? target : withTiming(target, { duration: theme.motion.durations.base, easing: theme.motion.easings.settle });
  }, [checked, reducedMotion]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange?.(!checked)}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: disabled ? 0.4 : 1 }, style]}
    >
      <View style={{ width: 40, height: 22, borderRadius: 11, backgroundColor: checked ? c.accent : c.snow[300], justifyContent: 'center' }}>
        <Animated.View
          style={[
            { position: 'absolute', top: 3, left: 3, width: 16, height: 16, borderRadius: 8, backgroundColor: c.snow[0] },
            theme.elevation.hair,
            thumbStyle,
          ]}
        />
      </View>
      {children ? (
        <Text style={{ fontFamily: theme.typography.h4.fontFamily, fontWeight: '500', fontSize: 14 }}>{children}</Text>
      ) : null}
    </Pressable>
  );
}

export default Switch;
