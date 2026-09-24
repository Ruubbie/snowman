import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../ThemeProvider.jsx';
import { Text } from './Text.jsx';
import { Enter } from './Enter.jsx';

/** @param {{title: string, subtitle?: string, action?: React.ReactNode}} props */
export function EmptyState({ title, subtitle, action }) {
  const theme = useTheme();
  return (
    <Enter distance={0} style={{ alignItems: 'center', padding: theme.spacing.xxl, gap: theme.spacing.sm }}>
      <Text variant="h3" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="small" muted style={{ textAlign: 'center' }}>
          {subtitle}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: theme.spacing.md }}>{action}</View> : null}
    </Enter>
  );
}

export default EmptyState;
