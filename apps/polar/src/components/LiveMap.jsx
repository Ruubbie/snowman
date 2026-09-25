import MapView, { Polyline } from 'react-native-maps';
import { useTheme } from '@snowman/ui';

/**
 * The run screen's map: Apple Maps following the runner, with the route so
 * far in carrot.
 * @param {{route: {lat: number, lon: number}[], height: number}} props
 */
export function LiveMap({ route = [], height }) {
  const theme = useTheme();
  const coords = route.map((p) => ({ latitude: p.lat, longitude: p.lon }));
  const last = coords[coords.length - 1];
  return (
    <MapView
      style={{ height, alignSelf: 'stretch' }}
      showsUserLocation
      followsUserLocation
      showsMyLocationButton={false}
      showsCompass={false}
      initialRegion={last ? { ...last, latitudeDelta: 0.006, longitudeDelta: 0.006 } : undefined}
    >
      {coords.length > 1 && <Polyline coordinates={coords} strokeColor={theme.colors.accent} strokeWidth={5} />}
    </MapView>
  );
}

export default LiveMap;
