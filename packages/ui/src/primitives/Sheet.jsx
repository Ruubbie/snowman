import React, { useEffect } from 'react';
import { Modal, Pressable, View, useWindowDimensions, Platform, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../ThemeProvider.jsx';

/**
 * Bottom sheet, square corners, frosted scrim behind it (matches Dialog's
 * treatment). Controlled via `visible`.
 * @param {{visible: boolean, onClose: () => void}} props
 */
export function Sheet({ visible, onClose, children }) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const { height } = useWindowDimensions();
  const translateY = useSharedValue(height);

  useEffect(() => {
    const target = visible ? 0 : height;
    translateY.value = reducedMotion
      ? target
      : withTiming(target, { duration: theme.motion.durations.slow, easing: theme.motion.easings.emphasized });
  }, [visible, height, reducedMotion]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
      <Pressable
        style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.colors.surfaceScrim }, Platform.OS === 'web' ? { backdropFilter: 'saturate(1.4) blur(14px)' } : null]}
        onPress={onClose}
        accessibilityLabel="Close sheet"
      />
      <Animated.View
        style={[
          { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: theme.colors.surfaceCard, padding: theme.spacing.xl, paddingBottom: theme.spacing[7] },
          theme.elevation.drift,
          sheetStyle,
        ]}
      >
        {children}
      </Animated.View>
    </Modal>
  );
}

export default Sheet;
