import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LatLng } from '../lib/maps';

type Props = {
  origin?: LatLng | null;
  destination?: LatLng | null;
  driver?: LatLng | null;
  height?: number;
};

export default function MapView({ origin, destination, driver, height = 180 }: Props) {
  // Dynamic require keeps @react-google-maps/api out of native bundles.
  const { GoogleMap, Marker, DirectionsRenderer, useJsApiLoader } =
    require('@react-google-maps/api') as any;

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    libraries: ['places'],
  });

  const [directions, setDirections] = React.useState<any>(null);

  React.useEffect(() => {
    if (!isLoaded || !origin || !destination) {
      setDirections(null);
      return;
    }
    const g = (window as any).google;
    const ds = new g.maps.DirectionsService();
    ds.route(
      { origin, destination, travelMode: g.maps.TravelMode.DRIVING },
      (result: any, status: string) => {
        if (status === 'OK') setDirections(result);
      },
    );
  }, [isLoaded, origin?.lat, origin?.lng, destination?.lat, destination?.lng]);

  if (!isLoaded) {
    return (
      <View style={[styles.placeholder, { height }]}>
        <Text style={styles.placeholderText}>Loading map…</Text>
      </View>
    );
  }

  const center = driver ?? origin ?? destination ?? { lat: 51.5074, lng: -0.1278 };

  return (
    <View style={{ height, borderRadius: 12, overflow: 'hidden' }}>
      <GoogleMap
        center={center}
        zoom={13}
        mapContainerStyle={{ width: '100%', height: '100%' }}
        options={{ disableDefaultUI: true, zoomControl: true }}
      >
        {origin && !directions && <Marker position={origin} label="A" />}
        {destination && !directions && <Marker position={destination} label="B" />}
        {driver && <Marker position={driver} label="🚗" />}
        {directions && <DirectionsRenderer directions={directions} />}
      </GoogleMap>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: '#e8e8e8',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: { color: '#888', fontSize: 13 },
});
