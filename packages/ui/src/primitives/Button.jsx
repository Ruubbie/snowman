import React, { useState } from 'react';
import { Pressable, ActivityIndicator, Platform } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '../ThemeProvider.jsx';
import { Text } from './Text.jsx';
import { Icon } from './Icon.jsx';

const HEIGHTS = { sm: 36, md: 44, lg: 56 };
const PAD_X = { sm: 16, md: 22, lg: 30 };
const FONT_SIZE = { sm: 13, md: 14, lg: 15 };

/**
 * @param {{variant?: 'primary'|'secondary'|'outline'|'ghost', size?: 'sm'|'md'|'lg', iconLeft?: string, iconRight?: string, block?: boolean, disabled?: boolean, loading?: boolean, onPress?: () => void}} props
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  iconLeft,
  iconRight,
  block = false,
  disabled = false,
  loading = false,
  onPress,
  style,
  ...rest
}) {
  const theme = useTheme();
  const c = theme.colors;
  const [hovered, setHovered] = useState(false);
  const gap = useSharedValue(10);
  const translateY = useSharedValue(0);
  const isDisabled = disabled || loading;
  const resolvedIconRight = variant === 'ghost' ? iconRight || 'move-right' : iconRight;

  const palette = {
    primary: { bg: hovered ? c.accentHover : c.accent, border: 'transparent', fg: c.accentOn },
    secondary: { bg: hovered ? c.ink[700] : c.ink[800], border: 'transparent', fg: c.snow[0] },
    outline: { bg: hovered ? c.ink[800] : 'transparent', border: c.ink[800], fg: hovered ? c.snow[0] : c.textStrong },
    ghost: { bg: 'transparent', border: 'transparent', fg: hovered ? c.accent : c.textStrong },
  }[variant] || {};

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const gapStyle = useAnimatedStyle(() => ({ gap: gap.value }));

  const hoverProps =
    Platform.OS === 'web'
      ? {
          onHoverIn: () => {
            setHovered(true);
            if (variant === 'ghost') gap.value = withTiming(16, { duration: theme.motion.durations.base });
          },
          onHoverOut: () => {
            setHovered(false);
            gap.value = withTiming(10, { duration: theme.motion.durations.base });
          },
        }
      : {};

  return (
    <Animated.View style={[{ alignSelf: block ? 'stretch' : 'flex-start' }, pressStyle]}>
      <Pressable
        accessibilityRole="button"
        disabled={isDisabled}
        onPress={onPress}
        onPressIn={() => {
          if (!isDisabled) translateY.value = withTiming(theme.motion.press.translate, { duration: theme.motion.durations.fast });
        }}
        onPressOut={() => {
          translateY.value = withTiming(0, { duration: theme.motion.durations.fast });
        }}
        {...hoverProps}
        style={[
          {
            height: HEIGHTS[size] || HEIGHTS.md,
            paddingHorizontal: variant === 'ghost' ? 0 : PAD_X[size] || PAD_X.md,
            borderRadius: theme.radius.control,
            backgroundColor: palette.bg,
            borderWidth: variant === 'outline' ? 1 : 0,
            borderColor: palette.border,
            width: block ? '100%' : undefined,
            opacity: isDisabled ? 0.4 : 1,
          },
          style,
        ]}
        {...rest}
      >
        <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flex: 1 }, gapStyle]}>
          {loading && <ActivityIndicator size="small" color={palette.fg} />}
          {!loading && iconLeft && <Icon name={iconLeft} size={16} color={palette.fg} />}
          <Text style={{ fontFamily: theme.typography.h4.fontFamily, fontWeight: '700', fontSize: FONT_SIZE[size] || FONT_SIZE.md, letterSpacing: 0.14 }} color={palette.fg}>
            {children}
          </Text>
          {!loading && resolvedIconRight && <Icon name={resolvedIconRight} size={16} color={palette.fg} />}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

export default Button;
