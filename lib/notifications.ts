import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Show notifications as banners even when the app is in the foreground.
// Must be called before any notification can appear (module-level side effect).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const FUNCTIONS_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`;

// Ask for permission and save the Expo push token to the user's profile row.
// Call once on app startup after the user is signed in.
export async function registerForPushNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;

  const tokenData = await Notifications.getExpoPushTokenAsync();
  const token = tokenData.data;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('profiles').update({ push_token: token }).eq('id', user.id);
}

// Fires an immediate local notification on the current device.
// Used for proximity alerts that must work even when the app is backgrounded.
export async function scheduleLocalNotification(title: string, body: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: null,
  });
}

// Fire-and-forget helper used by lib/rides.ts, lib/chat.ts, and edge functions.
// Sends a push notification to a single user via the send-push edge function.
export function notifyUser(userId: string, title: string, body: string): void {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) return;
    fetch(`${FUNCTIONS_BASE}/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ user_id: userId, title, body }),
    }).catch(() => {});
  });
}

// Notify multiple users at once (e.g. all online drivers).
export function notifyUsers(userIds: string[], title: string, body: string): void {
  if (userIds.length === 0) return;
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) return;
    fetch(`${FUNCTIONS_BASE}/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ user_ids: userIds, title, body }),
    }).catch(() => {});
  });
}
