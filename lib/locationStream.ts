import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { supabase } from './supabase';

let webWatchId: number | null = null;
let nativeSubscription: Location.LocationSubscription | null = null;
let lastWriteTs = 0;
const WRITE_INTERVAL_MS = 10_000;

async function pushLocation(lat: number, lng: number) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;
  const { error } = await supabase
    .from('drivers')
    .update({
      current_lat: lat,
      current_lng: lng,
      last_seen: new Date().toISOString(),
    })
    .eq('user_id', userData.user.id);
  if (error) console.warn('[locationStream] update failed', error.message);
}

export async function startLocationStream(): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      console.warn('[locationStream] geolocation unavailable');
      return;
    }
    if (webWatchId !== null) return;
    webWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastWriteTs < WRITE_INTERVAL_MS) return;
        lastWriteTs = now;
        pushLocation(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => console.warn('[locationStream] watch error', err.message),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
    );
    return;
  }

  // Native branch
  if (nativeSubscription !== null) return;
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    console.warn('[locationStream] permission denied');
    return;
  }
  nativeSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5_000,
      distanceInterval: 5,
    },
    (pos) => {
      const now = Date.now();
      if (now - lastWriteTs < WRITE_INTERVAL_MS) return;
      lastWriteTs = now;
      pushLocation(pos.coords.latitude, pos.coords.longitude);
    },
  );
}

export function stopLocationStream(): void {
  if (Platform.OS === 'web') {
    if (webWatchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(webWatchId);
      webWatchId = null;
    }
  } else {
    if (nativeSubscription) {
      nativeSubscription.remove();
      nativeSubscription = null;
    }
  }
  lastWriteTs = 0;
}
