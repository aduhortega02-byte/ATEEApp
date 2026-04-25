import { Platform } from 'react-native';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

export type LatLng = { lat: number; lng: number };

export type PlacePrediction = {
  place_id: string;
  description: string;
  main_text: string;
  secondary_text: string;
};

export type RouteInfo = {
  distance_mi: number;
  eta_min: number;
  polyline: string | null;
};

// ── Native REST helpers ───────────────────────────────────────
// Calls Google Places / Directions REST APIs directly via fetch.
// Used when Platform.OS !== 'web' — no native SDK required.

async function nativeSearchPlaces(query: string): Promise<PlacePrediction[]> {
  if (!API_KEY || !query.trim()) return [];
  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${API_KEY}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.status !== 'OK') return [];
    return (json.predictions ?? []).map((p: any) => ({
      place_id: p.place_id,
      description: p.description,
      main_text: p.structured_formatting?.main_text ?? p.description,
      secondary_text: p.structured_formatting?.secondary_text ?? '',
    }));
  } catch (e) {
    console.warn('[maps] nativeSearchPlaces failed', e);
    return [];
  }
}

async function nativeGeocodePlace(placeId: string): Promise<LatLng | null> {
  if (!API_KEY) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?place_id=${placeId}&key=${API_KEY}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    const loc = json.results?.[0]?.geometry?.location;
    if (!loc) return null;
    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return null;
  }
}

async function nativeReverseGeocode(point: LatLng): Promise<string | null> {
  if (!API_KEY) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${point.lat},${point.lng}&key=${API_KEY}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    return json.results?.[0]?.formatted_address ?? null;
  } catch {
    return null;
  }
}

async function nativeGetRouteInfo(origin: LatLng, destination: LatLng): Promise<RouteInfo | null> {
  if (!API_KEY) return null;
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&mode=driving&key=${API_KEY}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    const leg = json.routes?.[0]?.legs?.[0];
    if (!leg) return null;
    return {
      distance_mi: +(leg.distance.value / 1609.344).toFixed(1),
      eta_min: Math.round(leg.duration.value / 60),
      polyline: json.routes[0].overview_polyline?.points ?? null,
    };
  } catch {
    return null;
  }
}

// ── Web script loader ─────────────────────────────────────────

let scriptPromise: Promise<typeof google> | null = null;

async function loadGoogle(): Promise<typeof google> {
  if (Platform.OS !== 'web') throw new Error('Google Maps JS SDK: web only.');
  if (!API_KEY) throw new Error('Missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in .env');
  if (typeof window === 'undefined') throw new Error('Window not available');

  // If already loaded by MapView component, reuse it
  if ((window as any).google?.maps?.places) {
    return (window as any).google;
  }

  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<typeof google>((resolve, reject) => {
    const existing = document.getElementById('google-maps-script') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve((window as any).google));
      existing.addEventListener('error', () => reject(new Error('Google Maps script failed')));
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places,geometry&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve((window as any).google);
    script.onerror = () => reject(new Error('Google Maps script failed to load'));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

// ── Public API ────────────────────────────────────────────────

export async function searchPlaces(query: string): Promise<PlacePrediction[]> {
  if (!query.trim()) return [];
  if (Platform.OS !== 'web') return nativeSearchPlaces(query);
  const g = await loadGoogle();
  const service = new g.maps.places.AutocompleteService();
  return new Promise((resolve) => {
    service.getPlacePredictions({ input: query }, (results, status) => {
      if (status !== g.maps.places.PlacesServiceStatus.OK || !results) {
        resolve([]);
        return;
      }
      resolve(
        results.map((r) => ({
          place_id: r.place_id,
          description: r.description,
          main_text: r.structured_formatting.main_text,
          secondary_text: r.structured_formatting.secondary_text ?? '',
        })),
      );
    });
  });
}

export async function geocodePlace(placeId: string): Promise<LatLng | null> {
  if (Platform.OS !== 'web') return nativeGeocodePlace(placeId);
  const g = await loadGoogle();
  const geocoder = new g.maps.Geocoder();
  return new Promise((resolve) => {
    geocoder.geocode({ placeId }, (results, status) => {
      if (status !== 'OK' || !results?.[0]) {
        resolve(null);
        return;
      }
      const loc = results[0].geometry.location;
      resolve({ lat: loc.lat(), lng: loc.lng() });
    });
  });
}

export async function getRouteInfo(
  origin: LatLng,
  destination: LatLng,
): Promise<RouteInfo | null> {
  if (Platform.OS !== 'web') return nativeGetRouteInfo(origin, destination);
  const g = await loadGoogle();
  const service = new g.maps.DirectionsService();
  return new Promise((resolve) => {
    service.route(
      { origin, destination, travelMode: g.maps.TravelMode.DRIVING },
      (result, status) => {
        if (status !== 'OK' || !result?.routes?.[0]?.legs?.[0]) {
          resolve(null);
          return;
        }
        const leg = result.routes[0].legs[0];
        const distance_m = leg.distance?.value ?? 0;
        const duration_s = leg.duration?.value ?? 0;
        resolve({
          distance_mi: +(distance_m / 1609.344).toFixed(1),
          eta_min: Math.round(duration_s / 60),
          polyline: result.routes[0].overview_polyline ?? null,
        });
      },
    );
  });
}

export async function reverseGeocode(point: LatLng): Promise<string | null> {
  if (Platform.OS !== 'web') return nativeReverseGeocode(point);
  const g = await loadGoogle();
  const geocoder = new g.maps.Geocoder();
  return new Promise((resolve) => {
    geocoder.geocode({ location: point }, (results, status) => {
      if (status !== 'OK' || !results?.[0]) {
        resolve(null);
        return;
      }
      resolve(results[0].formatted_address);
    });
  });
}
