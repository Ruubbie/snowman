import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme, Text, Icon } from '@snowman/ui';
import { getClient } from '../lib/client.js';

const TAB_META = {
  today: { label: 'Today', icon: 'sun' },
  log: { label: 'Runs', icon: 'footprints' },
};

const BAR_HEIGHT = 56;
const START_SIZE = 56;

/**
 * The Polar tab bar (from the design's Phone.jsx): white bar, 1px top
 * hairline, "Today"/"Runs" items with a sliding carrot dash for the active
 * one, and a 56px round carrot Start button raised above the bar's centre.
 * Start jumps straight into today's pre-run brief when one exists, else
 * starts a freeform run.
 */
export function TabBar({ state, descriptors, navigation }) {
  const theme = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const [starting, setStarting] = useState(false);

  async function handleStart() {
    if (starting) return;
    setStarting(true);
    try {
      const client = await getClient();
      const res = await client.running.today();
      const session = res?.session;
      if (session && (session.kind === 'run' || session.kind === 'walk') && session.status !== 'done') {
        router.push({
          pathname: '/run',
          params: { sessionId: session.id, runClientId: `${session.id}-${Date.now()}`, segments: JSON.stringify(session.segments || []) },
        });
      } else {
        router.push({ pathname: '/run', params: { runClientId: `freeform-${Date.now()}`, segments: '[]' } });
      }
    } catch {
      router.push({ pathname: '/run', params: { runClientId: `freeform-${Date.now()}`, segments: '[]' } });
    } finally {
      setStarting(false);
    }
  }

  return (
    <View style={{ backgroundColor: c.surfaceCard, borderTopWidth: 1, borderTopColor: c.borderHair, paddingBottom: insets.bottom }}>
      <View style={{ flexDirection: 'row', height: BAR_HEIGHT, alignItems: 'center' }}>
        {state.routes.map((route, index) => {
          const meta = TAB_META[route.name];
          if (!meta) return <View key={route.key} style={{ flex: 1 }} />;
          const isFocused = state.index === index;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <Pressable key={route.key} onPress={onPress} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <View style={{ height: 2, width: 28, backgroundColor: isFocused ? c.accent : 'transparent' }} />
              <Icon name={meta.icon} size={20} color={isFocused ? c.textStrong : c.textFaint} />
              <Text style={{ fontFamily: theme.typography.h4.fontFamily, fontWeight: '700', fontSize: 11 }} color={isFocused ? c.textStrong : c.textFaint}>
                {meta.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Start run"
        onPress={handleStart}
        disabled={starting}
        style={{
          position: 'absolute',
          top: -22,
          left: '50%',
          marginLeft: -START_SIZE / 2,
          width: START_SIZE,
          height: START_SIZE,
          borderRadius: START_SIZE / 2,
          backgroundColor: c.accent,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: starting ? 0.7 : 1,
          ...theme.elevation.float,
        }}
      >
        <Icon name="play" size={24} color={c.accentOn} />
      </Pressable>
    </View>
  );
}

export default TabBar;
