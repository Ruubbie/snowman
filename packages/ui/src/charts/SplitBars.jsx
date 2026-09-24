import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../ThemeProvider.jsx';
import { Text } from '../primitives/Text.jsx';

function Bar({ heightPct, isFastest, index, theme, reducedMotion }) {
  const h = useSharedValue(0);
  useEffect(() => {
    h.value = reducedMotion
      ? heightPct
      : withDelay(index * theme.motion.stagger.step, withTiming(heightPct, { duration: theme.motion.durations.base }));
  }, [heightPct, reducedMotion]);
  const style = useAnimatedStyle(() => ({ height: `${h.value}%` }));
  return (
    <View style={{ flex: 1, height: 80, justifyContent: 'flex-end' }}>
      <Animated.View style={[{ backgroundColor: isFastest ? theme.colors.accent : theme.colors.ink[800] }, style]} />
    </View>
  );
}

/** @param {{splits: number[]}} props splits in seconds/km, lower is faster — bars sized inverse to pace, fastest split in carrot. */
export function SplitBars({ splits = [] }) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  if (!splits.length) return null;
  const max = Math.max(...splits);
  const min = Math.min(...splits);
  const range = max - min || 1;

  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.xs, alignItems: 'flex-end' }}>
      {splits.map((s, i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center', gap: theme.spacing.xs }}>
          <Bar heightPct={20 + ((max - s) / range) * 80} isFastest={s === min} index={i} theme={theme} reducedMotion={reducedMotion} />
          <Text variant="caption" muted>
            {i + 1}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default SplitBars;
