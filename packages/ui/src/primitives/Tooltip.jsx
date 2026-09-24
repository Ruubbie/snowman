import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../ThemeProvider.jsx';
import { Text } from './Text.jsx';

/** @param {{visible: boolean, children: string, placement?: 'top'|'bottom'}} props */
export function Tooltip({ visible, children, placement = 'top' }) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = reducedMotion ? (visible ? 1 : 0) : withTiming(visible ? 1 : 0, { duration: theme.motion.durations.fast });
  }, [visible, reducedMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: 4 - progress.value * 4 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: '50%',
          [placement === 'top' ? 'bottom' : 'top']: '100%',
          marginLeft: -40,
          backgroundColor: theme.colors.ink[800],
          paddingVertical: 7,
          paddingHorizontal: 10,
          zIndex: 50,
        },
        style,
      ]}
    >
      <Text style={{ fontFamily: theme.typography.h4.fontFamily, fontWeight: '600', fontSize: 12 }} color={theme.colors.snow[0]}>
        {children}
      </Text>
    </Animated.View>
  );
}

export default Tooltip;
