import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../ThemeProvider.jsx';
import { Text } from './Text.jsx';

const ITEM_SIZE = 44; // px per index item along the timeline axis - fixed so the dash can slide without onLayout

/**
 * The pre-run "interval list" motif in the DashPager/Ring language: numbered
 * segments (01 · 02 · 03…) with a sliding carrot dash marking the active
 * one; other items sit faint/muted. `orientation="vertical"` stacks
 * top-to-bottom (used on the live /run screen); `orientation="horizontal"`
 * (default) runs left-to-right (used on the pre-run screen).
 * @param {{segments: {kind: string, seconds: number}[], currentIndex?: number, orientation?: 'horizontal'|'vertical'}} props
 */
export function SegmentTimeline({ segments = [], currentIndex = -1, orientation = 'horizontal' }) {
  const theme = useTheme();
  const c = theme.colors;
  const reducedMotion = useReducedMotion();
  const vertical = orientation === 'vertical';
  const dashPos = useSharedValue(Math.max(0, currentIndex) * ITEM_SIZE);

  useEffect(() => {
    const target = Math.max(0, currentIndex) * ITEM_SIZE;
    dashPos.value = reducedMotion ? target : withTiming(target, { duration: theme.motion.durations.slow, easing: theme.motion.easings.emphasized });
  }, [currentIndex, reducedMotion]);

  const dashStyle = useAnimatedStyle(() =>
    vertical ? { transform: [{ translateY: dashPos.value }] } : { transform: [{ translateX: dashPos.value }] },
  );

  return (
    <View style={{ flexDirection: vertical ? 'row' : 'column' }}>
      <View style={vertical ? { width: 14 } : { height: 14 }}>
        <Animated.View
          style={[
            {
              position: 'absolute',
              backgroundColor: c.accent,
              ...(vertical ? { width: 4, height: 20, top: ITEM_SIZE / 2 - 10 } : { height: 4, width: 20, left: ITEM_SIZE / 2 - 10 }),
            },
            dashStyle,
          ]}
        />
      </View>
      <View style={{ flexDirection: vertical ? 'column' : 'row' }}>
        {segments.map((seg, i) => {
          const active = i === currentIndex;
          return (
            <View
              key={i}
              style={{
                width: vertical ? undefined : ITEM_SIZE,
                height: vertical ? ITEM_SIZE : undefined,
                justifyContent: 'center',
                paddingHorizontal: vertical ? theme.spacing.sm : 0,
              }}
            >
              <Text
                variant="dataMedium"
                style={{ fontSize: active ? 15 : 13 }}
                color={active ? c.textStrong : c.textFaint}
              >
                {String(i + 1).padStart(2, '0')}
              </Text>
              {active && (
                <Text variant="caption" muted style={{ textTransform: 'capitalize' }}>
                  {seg.kind}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default SegmentTimeline;
