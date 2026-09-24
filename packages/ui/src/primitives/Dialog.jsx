import React, { useEffect } from 'react';
import { Modal, Pressable, View, Platform, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../ThemeProvider.jsx';
import { Text } from './Text.jsx';

let BlurView = null;
if (Platform.OS === 'ios' || Platform.OS === 'android') {
  try {
    // optional native dep — only resolved on native platforms
    BlurView = require('expo-blur').BlurView;
  } catch {
    BlurView = null;
  }
}

function Scrim({ theme, children, onPress }) {
  if (Platform.OS === 'web') {
    return (
      <Pressable
        onPress={onPress}
        style={{ ...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.surfaceScrim, backdropFilter: 'saturate(1.4) blur(14px)', alignItems: 'center', justifyContent: 'center' }}
      >
        {children}
      </Pressable>
    );
  }
  if (BlurView) {
    return (
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onPress}>
        <BlurView intensity={40} tint="light" style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' }}>
          {children}
        </BlurView>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} style={{ ...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.surfaceScrim, alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </Pressable>
  );
}

/**
 * @param {{open: boolean, title?: string, children: React.ReactNode, actions?: React.ReactNode, onClose?: () => void, inline?: boolean}} props
 * `inline` renders the scrim+panel absolutely within the parent instead of
 * an OS Modal — used for the in-screen "End run?" confirm on /run.
 */
export function Dialog({ open, title, children, actions, onClose, inline = false }) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!open) return;
    progress.value = 0;
    progress.value = reducedMotion ? 1 : withTiming(1, { duration: theme.motion.durations.slow, easing: theme.motion.easings.emphasized });
  }, [open, reducedMotion]);

  const panelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 12 }],
  }));

  if (!open) return null;

  const panel = (
    <Pressable onPress={(e) => e.stopPropagation?.()}>
      <Animated.View
        style={[
          { backgroundColor: theme.colors.surfaceCard, padding: 36, width: 340, maxWidth: '90%' },
          theme.elevation.drift,
          panelStyle,
        ]}
      >
        {title ? <Text variant="h2" style={{ marginBottom: 10 }}>{title}</Text> : null}
        {typeof children === 'string' ? <Text variant="body" muted>{children}</Text> : children}
        {actions ? <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'flex-end', marginTop: 28 }}>{actions}</View> : null}
      </Animated.View>
    </Pressable>
  );

  if (inline) {
    return (
      <View style={StyleSheet.absoluteFillObject}>
        <Scrim theme={theme} onPress={onClose}>
          {panel}
        </Scrim>
      </View>
    );
  }

  return (
    <Modal transparent visible={open} animationType="none" onRequestClose={onClose}>
      <Scrim theme={theme} onPress={onClose}>
        {panel}
      </Scrim>
    </Modal>
  );
}

export default Dialog;
