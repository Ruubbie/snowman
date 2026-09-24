// Schedules the backbone's /running/reminders as local iOS notifications.
// No-op on web/Android (spec: iOS only). Call refreshReminders() on app
// foreground so the list is cancelled + rescheduled with fresh data.
import { Platform } from 'react-native';
import { getClient } from './lib/client.js';

async function getNotifications() {
  if (Platform.OS !== 'ios') return null;
  return import('expo-notifications');
}

export async function requestPermission() {
  const Notifications = await getNotifications();
  if (!Notifications) return false;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function refreshReminders() {
  const Notifications = await getNotifications();
  if (!Notifications) return { scheduled: 0 };

  // Ask once (iOS only shows the prompt the first time); Settings can ask again.
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'undetermined') await Notifications.requestPermissionsAsync();

  await Notifications.cancelAllScheduledNotificationsAsync();

  const client = await getClient();
  const { reminders } = await client.running.reminders();

  let scheduled = 0;
  for (const reminder of reminders) {
    const fireDate = new Date(reminder.fireAt);
    if (fireDate.getTime() <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
      content: { title: reminder.title, body: reminder.body, data: { sessionId: reminder.sessionId } },
      trigger: fireDate,
    });
    scheduled += 1;
  }
  return { scheduled };
}

export default { requestPermission, refreshReminders };
