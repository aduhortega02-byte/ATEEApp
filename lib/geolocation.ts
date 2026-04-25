import { Platform } from 'react-native';
import * as Location from 'expo-location';
import type { LatLng } from './maps';

export type GeolocationResult =
  | { status: 'ok'; coords: LatLng }
  | { status: 'denied' }
  | { status: 'unavailable' }
  | { status: 'timeout' }
  | { status: 'error'; message: string };

export async function getCurrentPosition(timeoutMs = 8000): Promise<GeolocationResult> {
  if (Platform.OS === 'web') {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return { status: 'unavailable' };
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            status: 'ok',
            coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          }),
        (err) => {
          if (err.code === err.PERMISSION_DENIED) return resolve({ status: 'denied' });
          if (err.code === err.TIMEOUT) return resolve({ status: 'timeout' });
          if (err.code === err.POSITION_UNAVAILABLE) return resolve({ status: 'unavailable' });
          resolve({ status: 'error', message: err.message });
        },
        { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 },
      );
    });
  }

  // Native branch
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { status: 'denied' };
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      status: 'ok',
      coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
    };
  } catch (e: any) {
    return { status: 'error', message: e?.message ?? 'Location error' };
  }
}
