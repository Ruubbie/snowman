import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../ThemeProvider.jsx';

/** A pulsing dot used as the "recording" indicator during a live run. */
export function PulseDot({ color, size = 10 }) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) return;
    scale.value = withRepeat(
      withSequence(
        withTiming(1.6, { duration: theme.motion.durations.slow }),
        withTiming(1, { duration: theme.motion.durations.slow }),
      ),
      -1,
      false,
    );
  }, [reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const dotColor = color || theme.colors.danger;

  return (
    <View style={{ width: size * 2, height: size * 2, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          { width: size, height: size, borderRadius: size / 2, backgroundColor: dotColor, opacity: 0.5 },
          animatedStyle,
        ]}
      />
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: dotColor,
        }}
      />
    </View>
  );
}

export default PulseDot;
