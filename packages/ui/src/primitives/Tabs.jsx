import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../ThemeProvider.jsx';
import { Text } from './Text.jsx';

function normalize(item) {
  return typeof item === 'string' ? { value: item, label: item } : item;
}

/**
 * @param {{items: (string|{value:string,label:string})[], value?: string, defaultValue?: string, onChange?: (v: string) => void, variant?: 'line'|'pill'}} props
 */
export function Tabs({ items = [], value, defaultValue, onChange, variant = 'line' }) {
  const theme = useTheme();
  const c = theme.colors;
  const reducedMotion = useReducedMotion();
  const normalized = items.map(normalize);
  const [internal, setInternal] = useState(defaultValue ?? normalized[0]?.value);
  const active = value ?? internal;
  const layouts = useRef({});
  const underlineX = useSharedValue(0);
  const underlineW = useSharedValue(0);

  function select(v) {
    if (value === undefined) setInternal(v);
    onChange?.(v);
  }

  useEffect(() => {
    const l = layouts.current[active];
    if (!l) return;
    underlineX.value = reducedMotion ? l.x : withTiming(l.x, { duration: theme.motion.durations.slow, easing: theme.motion.easings.emphasized });
    underlineW.value = reducedMotion ? l.width : withTiming(l.width, { duration: theme.motion.durations.slow, easing: theme.motion.easings.emphasized });
  }, [active, reducedMotion]);

  const underlineStyle = useAnimatedStyle(() => ({ transform: [{ translateX: underlineX.value }], width: underlineW.value }));

  if (variant === 'pill') {
    return (
      <View style={{ flexDirection: 'row', gap: 4, backgroundColor: c.snow[100], padding: 4, alignSelf: 'flex-start' }}>
        {normalized.map((item) => {
          const isActive = item.value === active;
          return (
            <Pressable
              key={item.value}
              onPress={() => select(item.value)}
              style={[
                { paddingVertical: 9, paddingHorizontal: 16, backgroundColor: isActive ? c.snow[0] : 'transparent' },
                isActive ? theme.elevation.hair : null,
              ]}
            >
              <Text style={{ fontFamily: theme.typography.h4.fontFamily, fontWeight: '600', fontSize: 14 }} color={isActive ? c.textStrong : c.textMuted}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', gap: 32, borderBottomWidth: 1, borderBottomColor: c.borderHair }}>
      {normalized.map((item) => {
        const isActive = item.value === active;
        return (
          <Pressable
            key={item.value}
            onPress={() => select(item.value)}
            onLayout={(e) => {
              layouts.current[item.value] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width };
              if (isActive) {
                underlineX.value = e.nativeEvent.layout.x;
                underlineW.value = e.nativeEvent.layout.width;
              }
            }}
            style={{ paddingBottom: 14 }}
          >
            <Text style={{ fontFamily: theme.typography.h4.fontFamily, fontWeight: '600', fontSize: 14 }} color={isActive ? c.textStrong : c.textMuted}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
      <Animated.View style={[{ position: 'absolute', left: 0, bottom: -1, height: 2, backgroundColor: c.accent }, underlineStyle]} />
    </View>
  );
}

export default Tabs;
