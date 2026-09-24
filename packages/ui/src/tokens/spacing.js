// 1:1 from design/olaf-ds/tokens.css (spacing.css). space-0..space-10.
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 48,
  8: 64,
  9: 96,
  10: 144,
  // ergonomic aliases used throughout components/screens
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const semanticSpacing = {
  gutter: 40,
  framePad: 24, // 40 on web/tablet widths; screens use 24 at phone width
  screenPadding: 24,
  cardPadding: 20,
  gap: 12,
};

export default { ...spacing, ...semanticSpacing };
