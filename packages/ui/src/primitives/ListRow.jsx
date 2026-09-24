import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../ThemeProvider.jsx';
import { Text } from './Text.jsx';
import { Row } from './Layout.jsx';

/**
 * @param {{title: string, subtitle?: string, right?: React.ReactNode, onPress?: () => void}} props
 */
export function ListRow({ title, subtitle, right, onPress, style }) {
  const theme = useTheme();
  const Container = onPress ? Pressable : View;

  return (
    <Container
      onPress={onPress}
      style={[
        {
          paddingVertical: theme.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.borderHair,
        },
        style,
      ]}
    >
      <Row justify="space-between">
        <View style={{ flex: 1 }}>
          <Text variant="body">{title}</Text>
          {subtitle ? (
            <Text variant="caption" muted>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </Row>
    </Container>
  );
}

export default ListRow;
