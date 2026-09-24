import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { tokenStore } from '../src/lib/tokenStore.js';
import { Screen, Stack as VStack, PulseDot } from '@snowman/ui';

export default function Index() {
  const [status, setStatus] = useState('checking'); // checking | paired | unpaired

  useEffect(() => {
    let cancelled = false;
    tokenStore.getToken().then((token) => {
      if (!cancelled) setStatus(token ? 'paired' : 'unpaired');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'checking') {
    return (
      <Screen scroll={false}>
        <VStack style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <PulseDot />
        </VStack>
      </Screen>
    );
  }

  return <Redirect href={status === 'paired' ? '/(tabs)/today' : '/pair'} />;
}
