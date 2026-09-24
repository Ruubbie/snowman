import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withTiming, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../ThemeProvider.jsx';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Web fallback: no map tiles available, so the route is drawn as an
 * animated carrot SVG path on a tint panel, scaled to fit.
 * @param {{points: {lat: number, lon: number}[], height?: number, width?: number}} props
 */
export function RouteMap({ points = [], height = 220, width = 320 }) {
  const theme = useTheme();
  const c = theme.colors;
  const reducedMotion = useReducedMotion();
  const dash = useSharedValue(0);
  const pathLength = (width + height) * 2;

  if (!points.length) {
    return <View style={{ height, backgroundColor: c.surfacePanel }} />;
  }

  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const rangeLat = maxLat - minLat || 0.0001;
  const rangeLon = maxLon - minLon || 0.0001;
  const pad = 16;

  const d = points
    .map((p, i) => {
      const x = pad + ((p.lon - minLon) / rangeLon) * (width - pad * 2);
      const y = height - pad - ((p.lat - minLat) / rangeLat) * (height - pad * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  useEffect(() => {
    dash.value = 0;
    dash.value = reducedMotion ? 1 : withTiming(1, { duration: theme.motion.durations.slow });
  }, [d, reducedMotion]);

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: pathLength * (1 - dash.value) }));

  return (
    <View style={{ height, width, backgroundColor: c.surfacePanel }}>
      <Svg width={width} height={height}>
        <AnimatedPath
          d={d}
          stroke={c.accent}
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${pathLength} ${pathLength}`}
          animatedProps={animatedProps}
        />
      </Svg>
    </View>
  );
}

export default RouteMap;
