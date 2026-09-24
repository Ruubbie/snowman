import React, { useEffect } from 'react';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useTheme } from '../ThemeProvider.jsx';

/**
 * Entrance animation (fade + short rise) driven by a shared value.
 * Used instead of Reanimated layout animations, which get stuck half-faded
 * on web when nested. Instantly visible with reduced motion.
 * @param {{delay?: number, distance?: number, duration?: number}} props
 */
export function Enter({ children, delay = 0, distance = 12, duration, style }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: duration ?? theme.motion.durations.base, easing: theme.motion.easings.emphasized }),
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * distance }],
  }));

  return <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>;
}

export default Enter;
