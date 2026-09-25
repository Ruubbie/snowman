import { View } from 'react-native';
import { RouteMap } from '@snowman/ui';

/** Web (simulator) stand-in: no map tiles, just the route so far. */
export function LiveMap({ route = [], height }) {
  return (
    <View style={{ height, alignSelf: 'stretch' }}>
      <RouteMap points={route} height={height} />
    </View>
  );
}

export default LiveMap;
