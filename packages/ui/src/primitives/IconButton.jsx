import React, { useState } from 'react';
import { Pressable, Platform } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '../ThemeProvider.jsx';
import { Icon } from './Icon.jsx';

/**
 * Round icon tile. @param {{icon: string, variant?: 'outline'|'solid'|'dark'|'plain', size?: number, iconSize?: number, label: string, onPress?: () => void, disabled?: boolean}} props
 */
export function IconButton({ icon, variant = 'plain', size = 44, iconSize, label, onPress, disabled = false, style, ...rest }) {
  const theme = useTheme();
  const c = theme.colors;
  const [hovered, setHovered] = useState(false);
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const palette = {
    outline: { bg: 'transparent', border: hovered ? c.accent : c.ink[800], fg: hovered ? c.accent : c.textStrong },
    solid: { bg: hovered ? c.accentHover : c.accent, border: 'transparent', fg: c.accentOn },
    dark: { bg: hovered ? c.ink[700] : c.ink[800], border: 'transparent', fg: c.snow[0] },
    plain: { bg: 'transparent', border: 'transparent', fg: hovered ? c.accent : c.textStrong },
  }[variant] || {};

  const hoverProps = Platform.OS === 'web' ? { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) } : {};

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => {
          if (!disabled) scale.value = withTiming(theme.motion.press.scale, { duration: theme.motion.durations.fast });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: theme.motion.durations.fast });
        }}
        {...hoverProps}
        style={[
          {
            width: size,
            height: size,
            borderRadius: theme.radius.full,
            backgroundColor: palette.bg,
            borderWidth: variant === 'outline' ? 1 : 0,
            borderColor: palette.border,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled ? 0.4 : 1,
          },
          style,
        ]}
        {...rest}
      >
        <Icon name={icon} size={iconSize || Math.round(size * 0.45)} color={palette.fg} />
      </Pressable>
    </Animated.View>
  );
}

export default IconButton;
