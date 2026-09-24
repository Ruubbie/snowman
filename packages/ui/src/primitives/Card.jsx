import React, { useState } from 'react';
import { Pressable, View, Platform } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '../ThemeProvider.jsx';
import { Text } from './Text.jsx';

/**
 * @param {{tone?: 'white'|'tint'|'outline'|'ink', eyebrow?: string, title?: string, padding?: number, interactive?: boolean, onPress?: () => void}} props
 */
export function Card({ children, tone = 'white', eyebrow, title, padding = 28, interactive = false, onPress, style }) {
  const theme = useTheme();
  const c = theme.colors;
  const [hovered, setHovered] = useState(false);
  const lift = useSharedValue(0);
  const canHover = (interactive || !!onPress) && Platform.OS === 'web';

  const toneStyle = {
    white: { backgroundColor: c.surfaceCard, ...theme.elevation.soft },
    tint: { backgroundColor: c.surfacePanel },
    outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.borderHair },
    ink: { backgroundColor: c.surfaceInverse },
  }[tone] || {};

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: lift.value }] }));

  const hoverProps = canHover
    ? {
        onHoverIn: () => {
          setHovered(true);
          lift.value = withTiming(-2, { duration: theme.motion.durations.base });
        },
        onHoverOut: () => {
          setHovered(false);
          lift.value = withTiming(0, { duration: theme.motion.durations.base });
        },
      }
    : {};

  const content = (
    <>
      {eyebrow ? (
        <Text variant="eyebrow" color={c.accent} style={{ marginBottom: 12 }}>
          {eyebrow}
        </Text>
      ) : null}
      {title ? (
        <Text variant="h3" color={tone === 'ink' ? c.snow[0] : c.textStrong} style={{ marginBottom: 8 }}>
          {title}
        </Text>
      ) : null}
      {children}
    </>
  );

  const baseStyle = [
    { borderRadius: theme.radius.card, padding, position: 'relative' },
    toneStyle,
    tone === 'white' && hovered && canHover ? theme.elevation.float : null,
    style,
  ];

  if (!onPress) {
    return (
      <Animated.View style={[...baseStyle, animatedStyle]} {...hoverProps}>
        {content}
      </Animated.View>
    );
  }

  return (
    <Animated.View style={animatedStyle} {...hoverProps}>
      <Pressable onPress={onPress} style={baseStyle}>
        {content}
      </Pressable>
    </Animated.View>
  );
}

export default Card;
