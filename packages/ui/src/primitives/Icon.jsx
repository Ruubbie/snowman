import React from 'react';
import * as LucideIcons from 'lucide-react-native';
import { useTheme } from '../ThemeProvider.jsx';

function kebabToPascal(name) {
  return String(name)
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Lucide outline icon, kebab-case name -> PascalCase component lookup.
 * Stroke defaults to 1.5px per the design (1.25 above 32px, 2 below 16px —
 * pass `stroke` explicitly to override at those sizes).
 * @param {{name: string, size?: number, stroke?: number, color?: string, label?: string}} props
 */
export function Icon({ name, size = 20, stroke, color, label, style }) {
  const theme = useTheme();
  const Cmp = LucideIcons[kebabToPascal(name)];
  const strokeWidth = stroke ?? (size > 32 ? 1.25 : size < 16 ? 2 : 1.5);
  if (!Cmp) return null;
  return (
    <Cmp
      width={size}
      height={size}
      size={size}
      strokeWidth={strokeWidth}
      color={color || theme.colors.textStrong}
      style={style}
      accessibilityLabel={label}
    />
  );
}

export default Icon;
