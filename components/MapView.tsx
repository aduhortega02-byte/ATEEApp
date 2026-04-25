import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import RNMapView, { Marker, Polyline } from 'react-native-maps';
import { getRouteInfo, type LatLng } from '../lib/maps';

type Props = {
  origin?: LatLng | null;
  destination?: LatLng | null;
  driver?: LatLng | null;
  height?: number;
};

type Coord = { latitude: number; longitude: number };

// Google's Encoded Polyline Algorithm — decodes the overview_polyline.points
// string returned by the Directions API into an array of lat/lng coordinates.
function decodePolyline(encoded: string): Coord[] {
  const points: Coord[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return points;
}

// This file is the native-only implementation.
// Metro resolves MapView.web.tsx for the web bundle and never loads this file on web.
export default function MapView({ origin, destination, driver, height = 180 }: Props) {
  const [routeCoords, setRouteCoords] = React.useState<Coord[]>([]);

  React.useEffect(() => {
    if (!origin || !destination) {
      setRouteCoords([]);
      return;
    }
    getRouteInfo(origin, destination).then((info) => {
      if (info?.polyline) {
        setRouteCoords(decodePolyline(info.polyline));
      } else {
        setRouteCoords([]);
      }
    });
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng]);

  const center = driver ?? origin ?? destination;

  if (!center) {
    return (
      <View style={[styles.placeholder, { height }]}>
        <Text style={styles.placeholderText}>Locating…</Text>
      </View>
    );
  }

  return (
    <View style={{ height, borderRadius: 12, overflow: 'hidden' }}>
      <RNMapView
        style={{ width: '100%', height: '100%' }}
        region={{
          latitude: center.lat,
          longitude: center.lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
      >
        {origin && (
          <Marker
            coordinate={{ latitude: origin.lat, longitude: origin.lng }}
            title="Pickup"
            pinColor="green"
          />
        )}
        {destination && (
          <Marker
            coordinate={{ latitude: destination.lat, longitude: destination.lng }}
            title="Destination"
            pinColor="red"
          />
        )}
        {driver && (
          <Marker
            coordinate={{ latitude: driver.lat, longitude: driver.lng }}
            title="Driver"
          />
        )}
        {routeCoords.length > 1 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor="#8B0000"
            strokeWidth={3}
          />
        )}
      </RNMapView>
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
