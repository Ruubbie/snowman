import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../ThemeProvider.jsx';
import { Text } from './Text.jsx';
import { Icon } from './Icon.jsx';

const TONE_ICON = { accent: 'flame', success: 'check', info: 'lightbulb', danger: 'triangle-alert' };

/**
 * @param {{visible: boolean, tone?: 'accent'|'success'|'info'|'danger', icon?: string, title?: string, children?: React.ReactNode, onHide?: () => void, durationMs?: number}} props
 */
export function Toast({ visible, tone = 'accent', icon, title, children, onHide, durationMs = 4000, style }) {
  const theme = useTheme();
  const c = theme.colors;
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    progress.value = 0;
    progress.value = reducedMotion ? 1 : withTiming(1, { duration: theme.motion.durations.slow, easing: theme.motion.easings.emphasized });
    if (!onHide) return;
    const id = setTimeout(onHide, durationMs);
    return () => clearTimeout(id);
  }, [visible, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 12 }],
  }));

  if (!visible) return null;
  const palette = {
    accent: { bg: c.accentSoft, fg: c.carrot[700] },
    success: { bg: c.green[50], fg: '#1F7A51' },
    info: { bg: c.ice[100], fg: c.ice[700] },
    danger: { bg: c.red[50], fg: '#A92E26' },
  }[tone] || {};

  return (
    <Animated.View
      style={[
        { flexDirection: 'row', gap: 14, padding: 16, paddingLeft: 18, backgroundColor: c.surfaceCard, maxWidth: 360 },
        theme.elevation.float,
        animatedStyle,
        style,
      ]}
    >
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon || TONE_ICON[tone] || 'flame'} size={16} color={palette.fg} />
      </View>
      <View style={{ flex: 1 }}>
        {title ? (
          <Text style={{ fontFamily: theme.typography.h4.fontFamily, fontWeight: '700', fontSize: 14, marginBottom: 3 }}>
            {title}
          </Text>
        ) : null}
        {typeof children === 'string' ? (
          <Text variant="small" muted>
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
    </Animated.View>
  );
}

export default Toast;
