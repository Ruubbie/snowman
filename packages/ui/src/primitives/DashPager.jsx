import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../ThemeProvider.jsx';

function Seg({ active, theme, reducedMotion, onPress }) {
  const c = theme.colors;
  const width = useSharedValue(active ? 64 : 14);
  useEffect(() => {
    const target = active ? 64 : 14;
    width.value = reducedMotion ? target : withTiming(target, { duration: theme.motion.durations.slow, easing: theme.motion.easings.emphasized });
  }, [active, reducedMotion]);
  const style = useAnimatedStyle(() => ({ width: width.value }));
  const Container = onPress ? Pressable : View;
  return (
    <Container onPress={onPress}>
      <Animated.View style={[{ height: active ? 4 : 2, backgroundColor: active ? c.accent : c.frost[400] }, style]} />
    </Container>
  );
}

/** @param {{count: number, index: number, onChange?: (i: number) => void}} props */
export function DashPager({ count = 0, index = 0, onChange }) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {Array.from({ length: count }, (_, i) => (
        <Seg key={i} active={i === index} theme={theme} reducedMotion={reducedMotion} onPress={onChange ? () => onChange(i) : undefined} />
      ))}
    </View>
  );
}

export default DashPager;
