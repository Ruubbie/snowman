import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeProvider.jsx';

/**
 * The signature split-frame layout: page `--snow-50` with a `--snow-100`
 * panel bleeding off one top corner, content straddling the seam. Ports
 * the `<div style={{position:'absolute', top:0, ...}}>` panel from every
 * example screen (Today/Summary/History).
 * At the top of a Screen (`bleedTop`, the default) the frame reaches up
 * behind the status bar, so the panel starts at the very top of the display.
 * @param {{panelSide?: 'left'|'right', panelWidth?: number|string, panelHeight?: number, panel?: boolean, bleedTop?: boolean}} props
 */
export function SplitFrame({ children, panelSide = 'right', panelWidth = '46%', panelHeight = 330, panel = true, bleedTop = true, style }) {
  const theme = useTheme();
  const inset = useSafeAreaInsets().top;
  const bleed = bleedTop ? inset : 0;
  return (
    <View style={[{ flex: 1, backgroundColor: theme.colors.surfacePage, position: 'relative', marginTop: -bleed, paddingTop: bleed }, style]}>
      {panel && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            [panelSide]: 0,
            width: panelWidth,
            height: panelHeight + bleed,
            backgroundColor: theme.colors.surfacePanel,
          }}
        />
      )}
      <View style={{ flex: 1, position: 'relative' }}>{children}</View>
    </View>
  );
}

export default SplitFrame;
