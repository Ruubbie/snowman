import { Tabs } from 'expo-router';
import { TabBar } from '../../src/components/TabBar.jsx';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="log" options={{ title: 'Runs' }} />
    </Tabs>
  );
}
