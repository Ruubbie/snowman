import React, { Children, cloneElement, isValidElement } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeProvider.jsx';
import { Enter } from './Enter.jsx';

/**
 * Full-screen wrapper: safe area on `--surface-page`, optional scroll, and a
 * staggered fade+rise entrance applied to each direct child. No background
 * band — the design's one background ornament is the per-screen GhostWord,
 * placed by each screen itself (see SplitFrame).
 */
export function Screen({ children, scroll = true, style, contentStyle, staggerChildren = true, edges = ['top', 'bottom'] }) {
  const theme = useTheme();
  const Container = scroll ? ScrollView : View;
  const containerProps = scroll
    ? { contentContainerStyle: [{ flexGrow: 1 }, contentStyle], showsVerticalScrollIndicator: false }
    : { style: [{ flex: 1 }, contentStyle] };

  const kids = staggerChildren
    ? Children.map(children, (child, index) =>
        isValidElement(child) ? (
          <Enter delay={index * theme.motion.stagger.step}>{child}</Enter>
        ) : (
          child
        ),
      )
    : children;

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: theme.colors.surfacePage }, style]} edges={edges}>
      <Container {...containerProps}>{kids}</Container>
    </SafeAreaView>
  );
}

export default Screen;
