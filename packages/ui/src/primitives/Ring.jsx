import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withTiming, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../ThemeProvider.jsx';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The brand motif ring. Without `progress`, a plain carrot circle outline.
 * With `progress` (0..1), a --snow-200 track plus a carrot arc drawn from
 * 12 o'clock, animating over 900ms ease-out.
 * @param {{size?: number, weight?: number, color?: string, progress?: number}} props
 */
export function Ring({ size = 100, weight = 12, color, progress, style, children }) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const ringColor = color || theme.colors.accent;
  const radiusPx = (size - weight) / 2;
  const circumference = 2 * Math.PI * radiusPx;
  const animatedProgress = useSharedValue(0);

  const hasProgress = progress != null;

  useEffect(() => {
    if (!hasProgress) return;
    const clamped = Math.max(0, Math.min(1, progress));
    animatedProgress.value = reducedMotion ? clamped : withTiming(clamped, { duration: theme.motion.durations.drift, easing: theme.motion.easings.emphasized });
  }, [progress, reducedMotion, hasProgress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animatedProgress.value),
  }));

  if (!hasProgress) {
    return (
      <View style={[{ width: size, height: size }, style]}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={radiusPx} stroke={ringColor} strokeWidth={weight} fill="none" />
        </Svg>
        {children != null && (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
        )}
      </View>
    );
  }

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radiusPx} stroke={theme.colors.snow[200]} strokeWidth={weight} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radiusPx}
          stroke={ringColor}
          strokeWidth={weight}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children != null && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          {children}
        </View>
      )}
    </View>
  );
}

export default Ring;
