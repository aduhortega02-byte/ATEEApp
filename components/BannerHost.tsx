import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type BannerVariant = 'info' | 'success' | 'warning' | 'error';

type Banner = {
  id: string;
  message: string;
  variant: BannerVariant;
  durationMs: number;
};

type BannerCtx = {
  showBanner: (message: string, variant?: BannerVariant, durationMs?: number) => void;
};

const BannerContext = createContext<BannerCtx>({ showBanner: () => {} });

export function useBanner() {
  return useContext(BannerContext);
}

const VARIANT_COLORS: Record<BannerVariant, string> = {
  info: '#1D4ED8',
  success: '#3B6D11',
  warning: '#BA7517',
  error: '#8B0000',
};

function BannerCard({ banner, onDone }: { banner: Banner; onDone: () => void }) {
  const translateY = useRef(new Animated.Value(-80)).current;

  useEffect(() => {
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
    const t = setTimeout(onDone, banner.durationMs);
    return () => clearTimeout(t);
  }, []);

  return (
    <Animated.View
      style={[
        bs.card,
        { backgroundColor: VARIANT_COLORS[banner.variant], transform: [{ translateY }] },
      ]}
    >
      <Text style={bs.msg} numberOfLines={2}>{banner.message}</Text>
      <TouchableOpacity onPress={onDone}>
        <Text style={bs.close}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function BannerHost({ children }: { children: React.ReactNode }) {
  const [banners, setBanners] = useState<Banner[]>([]);

  const showBanner = useCallback(
    (message: string, variant: BannerVariant = 'info', durationMs: number = 4000) => {
      const id = `${Date.now()}-${Math.random()}`;
      setBanners((prev) => [...prev, { id, message, variant, durationMs }].slice(-3));
    },
    [],
  );

  const dismiss = useCallback((id: string) => {
    setBanners((prev) => prev.filter((b) => b.id !== id));
  }, []);

  return (
    <BannerContext.Provider value={{ showBanner }}>
      <View style={{ flex: 1 }}>
        {children}
        <View style={bs.host} pointerEvents="box-none">
          {banners.map((b) => (
            <BannerCard key={b.id} banner={b} onDone={() => dismiss(b.id)} />
          ))}
        </View>
      </View>
    </BannerContext.Provider>
  );
}

const bs = StyleSheet.create({
  host: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 16 : 56,
    left: 16,
    right: 16,
    zIndex: 9999,
    gap: 8,
  },
  card: {
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 5,
  },
  msg: { flex: 1, color: 'white', fontSize: 13, fontWeight: '500', lineHeight: 18 },
  close: { color: 'rgba(255,255,255,0.7)', fontSize: 16, marginLeft: 10, fontWeight: '600' },
});
