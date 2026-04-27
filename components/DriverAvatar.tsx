import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useDriverPhoto } from '../hooks/useDriverPhoto';

type Props = {
  driverId: string | null;
  initials: string;
  size?: number;
  background?: string;
};

export default function DriverAvatar({ driverId, initials, size = 38, background = '#8B0000' }: Props) {
  const { url } = useDriverPhoto(driverId);
  const dim = { width: size, height: size, borderRadius: size / 2 };

  if (url) {
    return <Image source={{ uri: url }} style={[styles.image, dim]} />;
  }
  return (
    <View style={[styles.fallback, dim, { backgroundColor: background }]}>
      <Text style={[styles.initials, { fontSize: Math.max(10, Math.floor(size * 0.34)) }]}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: '#eee' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: 'white', fontWeight: '600' },
});
