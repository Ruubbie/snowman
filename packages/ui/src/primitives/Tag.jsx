import React, { useState } from 'react';
import { Pressable, View, Platform } from 'react-native';
import { useTheme } from '../ThemeProvider.jsx';
import { Text } from './Text.jsx';
import { Icon } from './Icon.jsx';

/** @param {{selected?: boolean, icon?: string, onRemove?: () => void, onPress?: () => void}} props */
export function Tag({ children, selected = false, icon, onRemove, onPress, style }) {
  const theme = useTheme();
  const c = theme.colors;
  const [hovered, setHovered] = useState(false);
  const hoverProps = Platform.OS === 'web' && onPress ? { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) } : {};
  const borderColor = selected ? c.ink[800] : hovered ? c.ink[800] : c.borderDefault;
  const textColor = selected ? c.snow[0] : hovered ? c.textStrong : c.textBody;
  const Container = onPress ? Pressable : View;

  return (
    <Container
      onPress={onPress}
      {...hoverProps}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          height: 30,
          paddingHorizontal: 12,
          borderWidth: 1,
          borderColor,
          backgroundColor: selected ? c.ink[800] : 'transparent',
        },
        style,
      ]}
    >
      {icon && <Icon name={icon} size={14} color={textColor} />}
      <Text style={{ fontFamily: theme.typography.h4.fontFamily, fontWeight: '600', fontSize: 13 }} color={textColor}>
        {children}
      </Text>
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={6} style={{ opacity: 0.6 }}>
          <Icon name="x" size={12} color={textColor} />
        </Pressable>
      )}
    </Container>
  );
}

export default Tag;
