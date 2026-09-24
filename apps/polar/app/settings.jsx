import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import { View } from 'react-native';
import { Screen, SplitFrame, GhostWord, Text, Card, Button, ListRow, useTheme } from '@snowman/ui';
import { PolarHeader } from '../src/components/PolarHeader.jsx';
import { tokenStore } from '../src/lib/tokenStore.js';
import { resetClient } from '../src/lib/client.js';
import { requestPermission, refreshReminders } from '../src/notifications.js';

export default function Settings() {
  const theme = useTheme();
  const [serverUrl, setServerUrl] = useState('');
  const [notifStatus, setNotifStatus] = useState('unknown');

  useEffect(() => {
    tokenStore.getServerUrl().then((url) => setServerUrl(url || ''));
  }, []);

  async function handleRepair() {
    await tokenStore.setToken(null);
    resetClient();
    router.replace('/pair');
  }

  async function handleTestVoice() {
    Speech.speak("This is Olaf. Let's go for a run.");
  }

  async function handleNotifications() {
    const granted = await requestPermission();
    setNotifStatus(granted ? 'granted' : 'denied');
    if (granted) await refreshReminders();
  }

  return (
    <Screen contentStyle={{ flexGrow: 1 }} staggerChildren={false}>
      <SplitFrame panelSide="left" panelWidth="40%" panelHeight={220} style={{ minHeight: '100%' }}>
        <GhostWord size={130} style={{ position: 'absolute', top: 20, left: -20 }}>Settings</GhostWord>
        <View style={{ padding: 24, paddingTop: 14, gap: 20 }}>
          <PolarHeader icon="x" label="Close" onPress={() => router.back()} />

          <View>
            <Text variant="eyebrow" color={theme.colors.accent} style={{ marginBottom: 14 }}>Polar</Text>
            <Text style={{ fontFamily: theme.typography.h1.fontFamily, fontWeight: '800', fontSize: 36, lineHeight: 38 }}>
              Settings{'\n'}& device
            </Text>
          </View>

          <Card tone="outline">
            <ListRow title="Server" subtitle={serverUrl || 'not set'} />
            <Button variant="secondary" onPress={handleRepair} style={{ marginTop: 12 }}>Re-pair device</Button>
          </Card>

          <Card tone="outline">
            <ListRow title="Voice" subtitle="Test Olaf's voice cues" />
            <Button variant="secondary" onPress={handleTestVoice} style={{ marginTop: 12 }}>Test voice</Button>
          </Card>

          <Card tone="outline">
            <ListRow title="Notifications" subtitle={`Reminders: ${notifStatus}`} />
            <Button variant="secondary" onPress={handleNotifications} style={{ marginTop: 12 }}>Enable reminders</Button>
          </Card>

          <Button variant="ghost" onPress={() => router.push('/dev/design')}>Design gallery</Button>
        </View>
      </SplitFrame>
    </Screen>
  );
}
