import React from 'react';
import MapView, { Polyline } from 'react-native-maps';
import { View } from 'react-native';
import { useTheme } from '../ThemeProvider.jsx';

/**
 * iOS/native route map: Apple Maps (default provider, no API key) with the
 * run's polyline in carrot.
 * @param {{points: {lat: number, lon: number}[], height?: number}} props
 */
export function RouteMap({ points = [], height = 220 }) {
  const theme = useTheme();
  if (!points.length) return <View style={{ height, backgroundColor: theme.colors.surfacePanel }} />;

  const coords = points.map((p) => ({ latitude: p.lat, longitude: p.lon }));
  const lats = coords.map((c) => c.latitude);
  const lons = coords.map((c) => c.longitude);
  const region = {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
    longitude: (Math.min(...lons) + Math.max(...lons)) / 2,
    latitudeDelta: Math.max(0.005, Math.max(...lats) - Math.min(...lats)) * 1.4,
    longitudeDelta: Math.max(0.005, Math.max(...lons) - Math.min(...lons)) * 1.4,
  };

  return (
    <MapView style={{ height }} initialRegion={region} pointerEvents="none">
      <Polyline coordinates={coords} strokeColor={theme.colors.accent} strokeWidth={4} />
    </MapView>
  );
}

export default RouteMap;
