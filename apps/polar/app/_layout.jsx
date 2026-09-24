import { useEffect, useCallback } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Mulish_300Light,
  Mulish_400Regular,
  Mulish_500Medium,
  Mulish_600SemiBold,
  Mulish_700Bold,
  Mulish_800ExtraBold,
  Mulish_900Black,
} from '@expo-google-fonts/mulish';
import { DMMono_400Regular, DMMono_500Medium } from '@expo-google-fonts/dm-mono';
import { ThemeProvider } from '@snowman/ui';
import { processPendingUploads } from '../src/sync/index.js';
import { refreshReminders } from '../src/notifications.js';

SplashScreen.preventAutoHideAsync().catch(() => {});

function onForeground() {
  processPendingUploads().catch(() => {});
  refreshReminders().catch(() => {});
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Mulish_300Light,
    Mulish_400Regular,
    Mulish_500Medium,
    Mulish_600SemiBold,
    Mulish_700Bold,
    Mulish_800ExtraBold,
    Mulish_900Black,
    DMMono_400Regular,
    DMMono_500Medium,
  });

  const onLayout = useCallback(async () => {
    if (fontsLoaded) await SplashScreen.hideAsync();
  }, [fontsLoaded]);

  useEffect(() => {
    onLayout();
  }, [onLayout]);

  useEffect(() => {
    onForeground();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') onForeground();
    });
    return () => sub.remove();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="pair" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="olaf" />
        <Stack.Screen name="session/[id]" />
        <Stack.Screen name="run/index" options={{ gestureEnabled: false }} />
        <Stack.Screen name="run/summary" options={{ gestureEnabled: false }} />
        <Stack.Screen name="runs/[id]" />
        <Stack.Screen name="dev/design" />
      </Stack>
    </ThemeProvider>
  );
}
