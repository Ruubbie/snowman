import { View } from 'react-native';
import { useTheme, Text, IconButton } from '@snowman/ui';

/**
 * Shared header for screens outside the design's own kit (Pair, Settings,
 * the pre-run brief, run detail, the design gallery): lowercase `polar`
 * wordmark left, one plain IconButton right — the same pattern Today uses
 * for its bell, just with whatever action makes sense on that screen.
 * @param {{icon?: string, label?: string, onPress?: () => void}} props
 */
export function PolarHeader({ icon = 'settings', label = 'Settings', onPress }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ fontFamily: theme.typography.h1.fontFamily, fontWeight: '800', fontSize: 22, letterSpacing: -0.03 * 22 }}>
        polar
      </Text>
      {onPress ? <IconButton icon={icon} variant="plain" label={label} iconSize={22} onPress={onPress} /> : <View style={{ width: 44, height: 44 }} />}
    </View>
  );
}

export default PolarHeader;
