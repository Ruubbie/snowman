import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../ThemeProvider.jsx';

/**
 * The signature split-frame layout: page `--snow-50` with a `--snow-100`
 * panel bleeding off one top corner, content straddling the seam. Ports
 * the `<div style={{position:'absolute', top:0, ...}}>` panel from every
 * example screen (Today/Summary/History).
 * @param {{panelSide?: 'left'|'right', panelWidth?: number|string, panelHeight?: number, panel?: boolean}} props
 */
export function SplitFrame({ children, panelSide = 'right', panelWidth = '46%', panelHeight = 330, panel = true, style }) {
  const theme = useTheme();
  return (
    <View style={[{ flex: 1, backgroundColor: theme.colors.surfacePage, position: 'relative' }, style]}>
      {panel && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            [panelSide]: 0,
            width: panelWidth,
            height: panelHeight,
            backgroundColor: theme.colors.surfacePanel,
          }}
        />
      )}
      <View style={{ flex: 1, position: 'relative' }}>{children}</View>
    </View>
  );
}

export default SplitFrame;
