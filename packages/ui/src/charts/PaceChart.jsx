import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withTiming, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../ThemeProvider.jsx';

const AnimatedPath = Animated.createAnimatedComponent(Path);

function pathFromPoints(points, width, height, min, max) {
  if (!points.length) return '';
  const range = max - min || 1;
  const stepX = width / Math.max(1, points.length - 1);
  return points
    .map((p, i) => {
      const x = i * stepX;
      const y = height - ((p - min) / range) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/**
 * Line chart of pace (s/km) over time, with an optional target band.
 * @param {{samples: number[], targetMin?: number, targetMax?: number, width?: number, height?: number}} props
 */
export function PaceChart({ samples = [], targetMin, targetMax, width = 320, height = 140 }) {
  const theme = useTheme();
  const c = theme.colors;
  const reducedMotion = useReducedMotion();
  const dash = useSharedValue(0);

  const values = samples.length ? samples : [0];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const d = pathFromPoints(values, width, height, min, max);
  const pathLength = width * 2;

  useEffect(() => {
    dash.value = 0;
    dash.value = reducedMotion ? 1 : withTiming(1, { duration: theme.motion.durations.slow });
  }, [d, reducedMotion]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: pathLength * (1 - dash.value),
  }));

  const bandTop = targetMax != null ? height - ((targetMax - min) / (max - min || 1)) * height : null;
  const bandHeight =
    targetMin != null && targetMax != null ? ((targetMax - targetMin) / (max - min || 1)) * height : 0;

  return (
    <View>
      <Svg width={width} height={height}>
        {bandTop != null && <Rect x={0} y={bandTop} width={width} height={bandHeight} fill={c.accent} opacity={0.12} />}
        <AnimatedPath
          d={d}
          stroke={c.accent}
          strokeWidth={2.5}
          fill="none"
          strokeDasharray={`${pathLength} ${pathLength}`}
          animatedProps={animatedProps}
        />
      </Svg>
    </View>
  );
}

export default PaceChart;
