import { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { createClient } from '@snowman/sdk';
import { Screen, SplitFrame, GhostWord, Text, Button, Card, Input, useTheme } from '@snowman/ui';
import { PolarHeader } from '../src/components/PolarHeader.jsx';
import { tokenStore } from '../src/lib/tokenStore.js';
import { resetClient } from '../src/lib/client.js';

export default function Pair() {
  const theme = useTheme();
  const [serverUrl, setServerUrl] = useState('http://127.0.0.1:4000');
  const [code, setCode] = useState('');
  const [deviceName, setDeviceName] = useState('Browser');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handlePair() {
    setError(null);
    setLoading(true);
    try {
      const client = createClient({ baseUrl: serverUrl, getToken: () => null });
      const res = await client.pair({ code: code.toUpperCase(), deviceName });
      await tokenStore.setServerUrl(serverUrl);
      await tokenStore.setToken(res.token);
      resetClient();
      router.replace('/(tabs)/today');
    } catch (err) {
      setError(err.message || 'Pairing failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen contentStyle={{ flexGrow: 1 }} staggerChildren={false}>
      <SplitFrame panelSide="right" panelWidth="42%" panelHeight={260} style={{ minHeight: '100%' }}>
        <GhostWord size={150} style={{ position: 'absolute', top: 30, right: -30 }}>Pair</GhostWord>
        <View style={{ padding: 24, paddingTop: 14, gap: 24 }}>
          <PolarHeader onPress={undefined} />

          <View>
            <Text variant="eyebrow" color={theme.colors.accent} style={{ marginBottom: 14 }}>New device</Text>
            <Text style={{ fontFamily: theme.typography.h1.fontFamily, fontWeight: '800', fontSize: 40, lineHeight: 42 }}>
              Pair with{'\n'}your backbone
            </Text>
          </View>

          <Card tone="white">
            <View style={{ gap: 16 }}>
              <Input label="Server URL" value={serverUrl} onChangeText={setServerUrl} autoCapitalize="none" autoCorrect={false} placeholder="http://127.0.0.1:4000" />
              <Input label="Pairing code" value={code} onChangeText={(t) => setCode(t.slice(0, 6))} autoCapitalize="characters" autoCorrect={false} placeholder="ABC123" />
              <Input label="Device name" value={deviceName} onChangeText={setDeviceName} />
              {error && <Text variant="caption" color={theme.colors.danger}>{error}</Text>}
              <Button block size="lg" onPress={handlePair} loading={loading} disabled={code.length !== 6 || !serverUrl}>
                Pair device
              </Button>
            </View>
          </Card>

          <Text variant="caption" muted>
            Get a code by running `npm run pair -- "Browser"` on the backbone.
          </Text>
        </View>
      </SplitFrame>
    </Screen>
  );
}
