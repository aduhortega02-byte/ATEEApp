import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import MapView from '../../components/MapView';
import { BannerHost, useBanner } from '../../components/BannerHost';
import DriverAvatar from '../../components/DriverAvatar';
import { getCurrentPosition } from '../../lib/geolocation';
import {
  geocodePlace,
  getRouteInfo,
  haversineDistanceMi,
  reverseGeocode,
  searchPlaces,
  type LatLng,
  type PlacePrediction,
  type RouteInfo,
} from '../../lib/maps';
import { supabase } from '../../lib/supabase';
import {
  acceptRide,
  cancelRide,
  chooseDriver,
  completeRideWithPayment,
  createRide,
  PaymentMethod,
  Ride,
  RideBid,
  RideStatus,
  setDriverOnline,
  startRide,
} from '../../lib/rides';
import { useDriverDocuments } from '../../hooks/useDriverDocuments';
import { useDriverLocation } from '../../hooks/useDriverLocation';
import { useDriverQueue } from '../../hooks/useDriverQueue';
import { useDriverTodayStats } from '../../hooks/useDriverTodayStats';
import { useDriverWallet } from '../../hooks/useDriverWallet';
import { useMyProfile } from '../../hooks/useMyProfile';
import { updateMyProfile } from '../../lib/profile';
import { usePassengerRecentRides } from '../../hooks/usePassengerRecentRides';
import { useRideBids } from '../../hooks/useRideBids';
import { useRideStatus } from '../../hooks/useRideStatus';
import { uploadDocument, type DocumentType, type DriverDocument } from '../../lib/kycDocs';
import { startLocationStream, stopLocationStream } from '../../lib/locationStream';
import { fetchRecentRidesForPassenger, fetchDriverRides } from '../../lib/passenger';
import type { Ride as RideType } from '../../lib/types';
import { sendTextMessage, sendLocationMessage, sendQuickReply, type ChatMessage } from '../../lib/chat';
import { submitRating } from '../../lib/ratings';
import { saveMyVehicle, isVehicleComplete, formatVehicleDisplay, type VehicleInput } from '../../lib/vehicle';
import { useMyVehicle } from '../../hooks/useMyVehicle';
import { useDriverVehicle } from '../../hooks/useDriverVehicle';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useChatMessages } from '../../hooks/useChatMessages';
import { useUnreadChatCount } from '../../hooks/useUnreadChatCount';
import { postTrip, cancelTrip, fetchTripById, type Trip, type PostTripInput } from '../../lib/trips';
import { bookSeats, cancelBooking, type TripBooking } from '../../lib/tripBookings';
import { findMatchingTrips, type MatchedTrip } from '../../lib/tripMatching';
import { useAvailableTrips } from '../../hooks/useAvailableTrips';
import { useMyPostedTrips } from '../../hooks/useMyPostedTrips';
import { useMyBookings } from '../../hooks/useMyBookings';
import { useTripBookings } from '../../hooks/useTripBookings';
import { Session } from '@supabase/supabase-js';
import AuthScreen from '../auth';

const { width } = Dimensions.get('window');
const RED = '#8B0000';
const GREEN = '#3B6D11';
const AMBER = '#BA7517';

function getInitials(name?: string | null): string {
  if (!name?.trim()) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Safe haptics wrapper — won't crash on web
const haptic = {
  select: () => { if (Platform.OS !== 'web') Haptics.selectionAsync(); },
  impact: (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(style);
  },
  notify: (type: Haptics.NotificationFeedbackType) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(type);
  },
};

type ScreenName =
  | 'Onboarding'
  | 'Home'
  | 'Book'
  | 'Schedule'
  | 'Matching'
  | 'Drivers'
  | 'Confirmed'
  | 'DriverHome'
  | 'DriverRequest'
  | 'DriverActive'
  | 'DriverComplete'
  | 'DriverEarnings'
  | 'Auth'
  | 'Profile'
  | 'DriverVerification'
  | 'Trips'
  | 'Chat'
  | 'RateTrip'
  | 'VehicleProfile'
  | 'PostTrip'
  | 'BrowseTrips'
  | 'TripDetails'
  | 'MyPostedTrips'
  | 'MyBookings';

type NavProp = { navigate: (s: ScreenName) => void };

// ─── RIDE CONTEXT ─────────────────────────────────────────────
// Holds the currently-active ride id so Matching/Drivers/Confirmed can read it.
// Also holds the driver's currently-selected request so DriverRequest can read it.

type RideCtx = {
  rideId: string | null;
  setRideId: (id: string | null) => void;
  selectedRide: Ride | null;
  setSelectedRide: (r: Ride | null) => void;
  chosenBid: RideBid | null;
  setChosenBid: (b: RideBid | null) => void;
  currentScreen: ScreenName;
  selectedTripId: string | null;
  setSelectedTripId: (id: string | null) => void;
  searchOriginCoords: LatLng | null;
  setSearchOriginCoords: (c: LatLng | null) => void;
  searchDestinationCoords: LatLng | null;
  setSearchDestinationCoords: (c: LatLng | null) => void;
};

const RideContext = createContext<RideCtx>({
  rideId: null,
  setRideId: () => {},
  selectedRide: null,
  setSelectedRide: () => {},
  chosenBid: null,
  setChosenBid: () => {},
  currentScreen: 'Onboarding',
  selectedTripId: null,
  setSelectedTripId: () => {},
  searchOriginCoords: null,
  setSearchOriginCoords: () => {},
  searchDestinationCoords: null,
  setSearchDestinationCoords: () => {},
});

// ─── SCREEN TRANSITION ────────────────────────────────────────
function ScreenTransition({ children }: { children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={{ flex: 1, opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

// ─── SKELETON CARD ────────────────────────────────────────────
function SkeletonCard() {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 850, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 850, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] });
  return (
    <Animated.View style={[s.skeletonRow, { opacity }]}>
      <View style={s.skeletonAvatar} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={s.skeletonLine} />
        <View style={[s.skeletonLine, { width: '55%' }]} />
      </View>
      <View style={s.skeletonPrice} />
    </Animated.View>
  );
}

// ─── ROUTE CARD ───────────────────────────────────────────────
function RouteCard({
  pickup,
  destination,
  eta,
  distance,
}: {
  pickup: string;
  destination: string;
  eta: string;
  distance: string;
}) {
  return (
    <View style={s.routeCard}>
      <View style={s.routeTrack}>
        <View style={[s.routeDot, { backgroundColor: GREEN }]} />
        <View style={s.routeLine} />
        <View style={[s.routeDot, { backgroundColor: RED }]} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.routeFrom} numberOfLines={1}>{pickup}</Text>
        <View style={{ height: 0.5, backgroundColor: '#eee', marginVertical: 6 }} />
        <Text style={s.routeTo} numberOfLines={1}>{destination}</Text>
      </View>
      <View style={{ gap: 6, alignItems: 'flex-end' }}>
        <View style={s.routeBadge}>
          <Text style={s.routeBadgeText}>🕐 {eta}</Text>
        </View>
        <View style={[s.routeBadge, { backgroundColor: '#eaf3de' }]}>
          <Text style={[s.routeBadgeText, { color: GREEN }]}>📍 {distance}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── TOP BAR ──────────────────────────────────────────────────
function TopBar({
  title,
  onBack,
  onRight,
  rightLabel,
  rightElement,
}: {
  title: string;
  onBack?: () => void;
  onRight?: () => void;
  rightLabel?: string;
  rightElement?: React.ReactNode;
}) {
  return (
    <View style={s.topBar}>
      {onBack ? (
        <TouchableOpacity onPress={onBack}>
          <Text style={s.backBtn}>← Back</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ width: 60 }} />
      )}
      <Text style={s.logo}>{title}</Text>
      {rightElement ? (
        <View style={{ width: 60, alignItems: 'flex-end' }}>{rightElement}</View>
      ) : onRight && rightLabel ? (
        <TouchableOpacity onPress={onRight}>
          <Text style={s.switchRoleText}>{rightLabel}</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ width: 60 }} />
      )}
    </View>
  );
}

// ─── BOTTOM NAV ───────────────────────────────────────────────
type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const NAV_ICONS: Record<string, { outline: IoniconsName; filled: IoniconsName }> = {
  Home:     { outline: 'home-outline',         filled: 'home' },
  Search:   { outline: 'search-outline',       filled: 'search' },
  Trips:    { outline: 'car-outline',          filled: 'car' },
  Earnings: { outline: 'wallet-outline',       filled: 'wallet' },
  Profile:  { outline: 'person-outline',       filled: 'person' },
};

function BottomNav({
  active,
  navigate,
  mode,
}: {
  active: string;
  navigate: (s: ScreenName) => void;
  mode: 'passenger' | 'driver';
}) {
  const { rideId, selectedRide } = useContext(RideContext);
  const passengerTabs = ['Home', 'Search', 'Trips', 'Profile'];
  const driverTabs = ['Home', 'Trips', 'Earnings', 'Profile'];
  const tabs = mode === 'driver' ? driverTabs : passengerTabs;
  const routes: Record<string, ScreenName> =
    mode === 'driver'
      ? {
          Home: 'DriverHome',
          Trips: 'Trips',
          Earnings: 'DriverEarnings',
          Profile: 'Profile',
        }
      : {
          Home: 'Home',
          Search: 'Book',
          Trips: 'Trips',
          Profile: 'Profile',
        };
  return (
    <View style={s.bottomNav}>
      {tabs.map((tab) => {
        const isActive = active === tab;
        const icons = NAV_ICONS[tab];
        return (
          <TouchableOpacity
            key={tab}
            style={s.navItem}
            onPress={() => {
              haptic.select();
              navigate(routes[tab]);
            }}
          >
            <Ionicons
              name={isActive ? icons.filled : icons.outline}
              size={24}
              color={isActive ? RED : '#aaa'}
            />
            <Text style={[s.navLabel, isActive && { color: RED, fontWeight: '600' }]}>{tab}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── ONBOARDING ───────────────────────────────────────────────
function OnboardingScreen({ navigate }: NavProp) {
  return (
    <ScreenTransition>
      <View style={{ flex: 1, backgroundColor: RED }}>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
          <StatusBar barStyle="light-content" />
          <Text style={s.logoLarge}>ATEE</Text>
          <Text style={s.heroTitle}>Pick it, Price it,{'\n'}Ride it.</Text>
          <Text style={s.heroSub}>
            Name your price as a passenger.{'\n'}Keep 100% as a driver.
          </Text>

          <View style={{ width: '100%', gap: 12, marginTop: 24 }}>
            <View style={s.whiteCard}>
              <Text style={s.roleTitle}>🚶 Passenger</Text>
              <Text style={s.roleSub}>You set the price. Drivers compete for your ride.</Text>
              <TouchableOpacity
                style={s.redBtn}
                onPress={() => {
                  haptic.impact();
                  navigate('Home');
                }}
              >
                <Text style={s.redBtnText}>Continue as Passenger →</Text>
              </TouchableOpacity>
            </View>
            <View style={s.ghostCard}>
              <Text style={s.roleTitle2}>🚗 Driver</Text>
              <Text style={s.roleSub2}>Zero commission. Every dollar is yours.</Text>
              <TouchableOpacity
                style={s.ghostBtn}
                onPress={() => {
                  haptic.impact();
                  navigate('DriverHome');
                }}
              >
                <Text style={s.ghostBtnText}>Continue as Driver →</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity onPress={() => navigate('Auth')}>
            <Text style={s.signInText}>
              Already have an account?{' '}
              <Text style={{ textDecorationLine: 'underline' }}>Sign in to ATEE</Text>
            </Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </ScreenTransition>
  );
}

// ─── HOME ─────────────────────────────────────────────────────
function HomeScreen({ navigate }: NavProp) {
  const { profile } = useMyProfile();
  const { rides, loading: ridesLoading } = usePassengerRecentRides();

  const greeting = (() => {
    const h = new Date().getHours();
    const salutation = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const first = profile?.full_name?.split(' ')[0] ?? 'there';
    return `${salutation}, ${first} 👋`;
  })();

  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <StatusBar barStyle="light-content" />
        <TopBar title="ATEE" onRight={() => navigate('Onboarding')} rightLabel="Switch role" />
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Text style={s.greeting}>{greeting}</Text>
          <Text style={s.bigTitle}>Where to?</Text>
          <TouchableOpacity
            style={s.searchBar}
            onPress={() => { haptic.select(); navigate('Book'); }}
          >
            <Text style={{ fontSize: 15, marginRight: 8 }}>📍</Text>
            <Text style={s.searchPlaceholder}>Enter destination</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.redBtn}
            onPress={() => { haptic.impact(); navigate('Book'); }}
          >
            <Text style={s.redBtnText}>Book a New Ride</Text>
          </TouchableOpacity>
          <View style={s.rowBetween}>
            <Text style={s.sectionTitle}>Recent Trips</Text>
            <TouchableOpacity onPress={() => navigate('Trips')}>
              <Text style={s.seeAll}>See All</Text>
            </TouchableOpacity>
          </View>
          {ridesLoading ? (
            <><SkeletonCard /><SkeletonCard /></>
          ) : rides.length === 0 ? (
            <Text style={s.muted}>No completed trips yet.</Text>
          ) : (
            rides.map((r) => (
              <View key={r.id} style={s.tripRow}>
                <View style={s.tripIcon}>
                  <Text style={{ fontSize: 15 }}>📍</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.tripName} numberOfLines={1}>{r.destination_address}</Text>
                  <Text style={s.tripSub} numberOfLines={1}>{r.pickup_address}</Text>
                </View>
                <Text style={s.tripPrice}>${r.offered_price.toFixed(2)}</Text>
              </View>
            ))
          )}
        </ScrollView>
        <BottomNav active="Home" navigate={navigate} mode="passenger" />
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── BOOK ─────────────────────────────────────────────────────
function BookScreen({ navigate }: NavProp) {
  const { setRideId, setSelectedTripId, setSearchOriginCoords, setSearchDestinationCoords } = useContext(RideContext);
  const [price, setPrice] = useState(40);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [note, setNote] = useState('');
  const [destination, setDestination] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [pickupCoords, setPickupCoords] = useState<LatLng | null>(null);
  const [pickupAddress, setPickupAddress] = useState<string>('Detecting location…');
  const [pickupStatus, setPickupStatus] = useState<'loading' | 'ok' | 'denied' | 'error'>('loading');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [destinationCoords, setDestinationCoords] = useState<LatLng | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect user location on mount
  useEffect(() => {
    (async () => {
      const result = await getCurrentPosition();
      if (result.status === 'ok') {
        setPickupCoords(result.coords);
        setPickupStatus('ok');
        const addr = await reverseGeocode(result.coords);
        setPickupAddress(addr ?? 'Current location');
      } else if (result.status === 'denied') {
        setPickupStatus('denied');
        setPickupAddress('Location access denied');
      } else {
        setPickupStatus('error');
        setPickupAddress('Could not detect location');
      }
    })();
  }, []);

  // Compute route whenever both endpoints are known
  useEffect(() => {
    if (!pickupCoords || !destinationCoords) {
      setRouteInfo(null);
      return;
    }
    (async () => {
      const info = await getRouteInfo(pickupCoords, destinationCoords);
      setRouteInfo(info);
    })();
  }, [pickupCoords?.lat, pickupCoords?.lng, destinationCoords?.lat, destinationCoords?.lng]);

  // Auto-suggest fare once route is known
  const [suggestedPrice, setSuggestedPrice] = useState<number | null>(null);
  useEffect(() => {
    if (!routeInfo) { setSuggestedPrice(null); return; }
    const s = Math.max(8, Math.round(5 + routeInfo.distance_mi * 2.5 + routeInfo.eta_min * 0.2));
    setSuggestedPrice(s);
    setPrice(s);
  }, [routeInfo?.distance_mi, routeInfo?.eta_min]);

  // Find matching driver-posted trips when both endpoints are known
  const [matchedTrips, setMatchedTrips] = useState<MatchedTrip[]>([]);
  useEffect(() => {
    if (!pickupCoords || !destinationCoords) { setMatchedTrips([]); return; }
    setSearchOriginCoords(pickupCoords);
    setSearchDestinationCoords(destinationCoords);
    findMatchingTrips({
      pickupLat: pickupCoords.lat,
      pickupLng: pickupCoords.lng,
      destinationLat: destinationCoords.lat,
      destinationLng: destinationCoords.lng,
    }).then(setMatchedTrips).catch(() => {});
  }, [pickupCoords?.lat, pickupCoords?.lng, destinationCoords?.lat, destinationCoords?.lng]);

  const onDestChange = (text: string) => {
    setDestination(text);
    setShowSuggestions(text.length > 0);
    setDestinationCoords(null);
    setRouteInfo(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) { setPredictions([]); return; }
    debounceRef.current = setTimeout(async () => {
      const results = await searchPlaces(text);
      setPredictions(results);
    }, 250);
  };

  const onSelectPlace = async (pred: PlacePrediction) => {
    haptic.select();
    setDestination(pred.description);
    setShowSuggestions(false);
    setPredictions([]);
    const coords = await geocodePlace(pred.place_id);
    setDestinationCoords(coords);
  };

  const base = suggestedPrice ?? 40;
  const priceColor = price >= base ? GREEN : price >= Math.round(base * 0.85) ? AMBER : RED;
  const priceLabel =
    price >= base ? 'Great offer — drivers will accept ✓' :
    price >= Math.round(base * 0.85) ? 'Might get drivers' :
    'Low — few drivers may accept';

  const fillFlex = (price - 1) / 99;

  const submitDisabled = submitting || !(pickupCoords && destinationCoords && routeInfo);
  const helperText =
    pickupStatus === 'denied' ? 'Enable location to continue' :
    !destinationCoords ? 'Pick a destination' :
    !routeInfo ? 'Calculating route…' :
    null;

  const submitRequest = async () => {
    if (submitDisabled || !pickupCoords || !destinationCoords || !routeInfo) return;
    try {
      setSubmitting(true);
      haptic.notify(Haptics.NotificationFeedbackType.Success);
      const ride = await createRide({
        pickup_address: pickupAddress,
        pickup_lat: pickupCoords.lat,
        pickup_lng: pickupCoords.lng,
        destination_address: destination,
        destination_lat: destinationCoords.lat,
        destination_lng: destinationCoords.lng,
        offered_price: price,
        distance_mi: routeInfo.distance_mi,
        eta_min: routeInfo.eta_min,
        payment_method: paymentMethod,
        passenger_note: note.trim() || null,
      });
      setRideId(ride.id);
      navigate('Matching');
    } catch (e: any) {
      console.warn('[BookScreen] createRide failed', e?.message ?? e);
      haptic.notify(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <TopBar title="ATEE" onBack={() => navigate('Home')} />
        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <View style={{ marginBottom: 12 }}>
            <MapView origin={pickupCoords} destination={destinationCoords} height={180} />
          </View>

          <View style={s.card}>
            <Text style={s.cardLabel}>PICKUP</Text>
            <Text style={s.cardValue}>📍 {pickupAddress}</Text>
            <View style={s.divider} />
            <Text style={s.cardLabel}>DESTINATION</Text>
            <TextInput
              style={s.destInput}
              placeholder="Where are you going?"
              placeholderTextColor="#aaa"
              value={destination}
              onChangeText={onDestChange}
            />
            {showSuggestions && predictions.length > 0 && (
              <View style={s.suggestBox}>
                {predictions.map((pred) => (
                  <TouchableOpacity
                    key={pred.place_id}
                    style={s.suggestRow}
                    onPress={() => onSelectPlace(pred)}
                  >
                    <Text style={{ marginRight: 8 }}>📍</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.suggestText}>{pred.main_text}</Text>
                      {pred.secondary_text ? (
                        <Text style={[s.suggestText, { fontSize: 11, color: '#999' }]} numberOfLines={1}>
                          {pred.secondary_text}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <RouteCard
            pickup={pickupAddress}
            destination={destination.length > 0 ? destination : '—'}
            eta={routeInfo ? `${routeInfo.eta_min} min` : '—'}
            distance={routeInfo ? `${routeInfo.distance_mi} mi` : '—'}
          />

          <View style={s.statRow}>
            <View style={s.statBox}>
              <Text style={s.statLabel}>Est. Time</Text>
              <Text style={s.statValue}>{routeInfo ? `${routeInfo.eta_min} MIN` : '—'}</Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statLabel}>Distance</Text>
              <Text style={s.statValue}>{routeInfo ? `${routeInfo.distance_mi} MI` : '—'}</Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statLabel}>Nearby</Text>
              <Text style={[s.statValue, { color: GREEN }]}>8 🚗</Text>
            </View>
          </View>

          <View style={s.tabRow}>
            <TouchableOpacity style={s.tabActive}>
              <Text style={s.tabActiveText}>Instant</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.tabInactive} onPress={() => navigate('Schedule')}>
              <Text style={s.tabInactiveText}>Scheduled</Text>
            </TouchableOpacity>
          </View>

          {matchedTrips.length > 0 && (
            <TouchableOpacity
              style={s.matchBanner}
              activeOpacity={0.8}
              onPress={() => {
                setSelectedTripId(matchedTrips[0].id);
                navigate('TripDetails');
              }}
            >
              <Text style={s.matchBannerTitle}>🚗 {matchedTrips.length} driver-posted trip{matchedTrips.length > 1 ? 's' : ''} match your route</Text>
              <Text style={s.matchBannerBody}>
                Nearest: {shortCity(matchedTrips[0].origin_address)} → {shortCity(matchedTrips[0].destination_address)} · ${Number(matchedTrips[0].price_per_seat).toFixed(2)}/seat · {fmtDeparture(matchedTrips[0].departure_at)}
              </Text>
              <Text style={[s.matchBannerBody, { marginTop: 4, fontWeight: '600' }]}>Tap to view →</Text>
            </TouchableOpacity>
          )}

          <View style={s.pricingCard}>
            <Text style={s.pricingTitle}>Set your price.</Text>
            <Text style={s.pricingSub}>Higher bid = faster match.</Text>
            <Text style={[s.priceBig, { textAlign: 'center', marginVertical: 14 }]}>${price}</Text>

            <View style={s.sliderTrack}>
              <View style={{ flex: fillFlex, height: 6, backgroundColor: priceColor, borderRadius: 3 }} />
              <View style={{ flex: 1 - fillFlex, height: 6 }} />
            </View>

            <View style={s.sliderRow}>
              <TouchableOpacity
                style={s.priceBtn}
                onPress={() => { haptic.select(); setPrice((p) => Math.max(1, p - 1)); }}
              >
                <Text style={s.priceBtnText}>−</Text>
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={[s.priceStatusLabel, { color: priceColor }]}>{priceLabel}</Text>
                <Text style={s.priceRec}>
                  {suggestedPrice ? `Suggested for this route: $${suggestedPrice}` : 'Higher bid = faster match'}
                </Text>
              </View>
              <TouchableOpacity
                style={s.priceBtn}
                onPress={() => { haptic.select(); setPrice((p) => Math.min(100, p + 1)); }}
              >
                <Text style={s.priceBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            <View style={[s.tabRow, { marginTop: 14 }]}>
              {(['cash', 'etransfer'] as PaymentMethod[]).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[s.payMethodBtn, paymentMethod === m && s.payMethodBtnActive]}
                  onPress={() => { haptic.select(); setPaymentMethod(m); }}
                >
                  <Text style={[s.payMethodText, paymentMethod === m && s.payMethodTextActive]}>
                    {m === 'cash' ? '💵 Cash' : '📱 E-transfer'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={{ backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12, fontSize: 13, color: '#111', borderWidth: 0.5, borderColor: '#e0e0e0', marginTop: 14, minHeight: 44 }}
              placeholder="Any notes for your driver? (optional)"
              placeholderTextColor="#aaa"
              value={note}
              onChangeText={setNote}
              maxLength={280}
              multiline
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[s.redBtn, { backgroundColor: 'white', marginTop: 14, opacity: submitDisabled ? 0.4 : 1 }]}
              onPress={submitRequest}
              disabled={submitDisabled}
            >
              {submitting ? (
                <ActivityIndicator color={RED} />
              ) : (
                <Text style={[s.redBtnText, { color: RED }]}>Request Drivers →</Text>
              )}
            </TouchableOpacity>
            {helperText && !submitting && (
              <Text style={s.submitHelper}>{helperText}</Text>
            )}
          </View>
        </ScrollView>
        <BottomNav active="Search" navigate={navigate} mode="passenger" />
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── MATCHING ─────────────────────────────────────────────────
function MatchingScreen({ navigate }: NavProp) {
  const { rideId, setRideId } = useContext(RideContext);
  const { bids } = useRideBids(rideId);
  const [dots, setDots] = useState('');
  const scale = useRef(new Animated.Value(1)).current;

  // Pulse animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.14, duration: 600, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();

    const dotTimer = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : d + '.'));
    }, 400);

    return () => clearInterval(dotTimer);
  }, []);

  // As soon as at least 1 bid comes in, advance to Drivers list after a brief pause
  useEffect(() => {
    if (bids.length >= 1) {
      haptic.notify(Haptics.NotificationFeedbackType.Success);
      const t = setTimeout(() => navigate('Drivers'), 900);
      return () => clearTimeout(t);
    }
  }, [bids.length]);

  const handleCancel = async () => {
    if (rideId) {
      try { await cancelRide(rideId); } catch (e) { console.warn('cancel failed', e); }
    }
    setRideId(null);
    navigate('Home');
  };

  return (
    <ScreenTransition>
      <SafeAreaView style={{ flex: 1, backgroundColor: RED }}>
        <StatusBar barStyle="light-content" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Animated.View style={[s.pulseRing, { transform: [{ scale }] }]} />
          <View style={s.pulseInner}>
            <Text style={{ fontSize: 34 }}>📡</Text>
          </View>
          <Text style={s.matchTitle}>Notifying drivers{dots}</Text>
          <Text style={s.matchSub}>Your price has been broadcast to nearby drivers</Text>
          {bids.length > 0 && (
            <View style={s.matchBadge}>
              <Text style={s.matchBadgeText}>
                {bids.length} driver{bids.length > 1 ? 's' : ''} accepted your price 🎉
              </Text>
            </View>
          )}
          <Text style={s.matchNote}>Average wait: 45 seconds</Text>

          <TouchableOpacity style={{ marginTop: 28 }} onPress={handleCancel}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textDecorationLine: 'underline' }}>
              Cancel request
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── SCHEDULE ─────────────────────────────────────────────────
function ScheduleScreen({ navigate }: NavProp) {
  const { setRideId } = useContext(RideContext);
  const [price, setPrice] = useState(40);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [note, setNote] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [destination, setDestination] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [pickupCoords, setPickupCoords] = useState<LatLng | null>(null);
  const [pickupAddress, setPickupAddress] = useState<string>('Detecting location…');
  const [pickupStatus, setPickupStatus] = useState<'loading' | 'ok' | 'denied' | 'error'>('loading');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [destinationCoords, setDestinationCoords] = useState<LatLng | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const result = await getCurrentPosition();
      if (result.status === 'ok') {
        setPickupCoords(result.coords);
        setPickupStatus('ok');
        const addr = await reverseGeocode(result.coords);
        setPickupAddress(addr ?? 'Current location');
      } else if (result.status === 'denied') {
        setPickupStatus('denied');
        setPickupAddress('Location access denied');
      } else {
        setPickupStatus('error');
        setPickupAddress('Could not detect location');
      }
    })();
  }, []);

  useEffect(() => {
    if (!pickupCoords || !destinationCoords) {
      setRouteInfo(null);
      return;
    }
    (async () => {
      const info = await getRouteInfo(pickupCoords, destinationCoords);
      setRouteInfo(info);
    })();
  }, [pickupCoords?.lat, pickupCoords?.lng, destinationCoords?.lat, destinationCoords?.lng]);

  const [suggestedPrice, setSuggestedPrice] = useState<number | null>(null);
  useEffect(() => {
    if (!routeInfo) { setSuggestedPrice(null); return; }
    const s = Math.max(8, Math.round(5 + routeInfo.distance_mi * 2.5 + routeInfo.eta_min * 0.2));
    setSuggestedPrice(s);
    setPrice(s);
  }, [routeInfo?.distance_mi, routeInfo?.eta_min]);

  const onDestChange = (text: string) => {
    setDestination(text);
    setShowSuggestions(text.length > 0);
    setDestinationCoords(null);
    setRouteInfo(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) { setPredictions([]); return; }
    debounceRef.current = setTimeout(async () => {
      const results = await searchPlaces(text);
      setPredictions(results);
    }, 250);
  };

  const onSelectPlace = async (pred: PlacePrediction) => {
    haptic.select();
    setDestination(pred.description);
    setShowSuggestions(false);
    setPredictions([]);
    const coords = await geocodePlace(pred.place_id);
    setDestinationCoords(coords);
  };

  const base = suggestedPrice ?? 40;
  const priceColor = price >= base ? GREEN : price >= Math.round(base * 0.85) ? AMBER : RED;
  const priceLabel =
    price >= base ? 'Great offer — drivers will accept ✓' :
    price >= Math.round(base * 0.85) ? 'Might get drivers' :
    'Low — few drivers may accept';
  const fillFlex = (price - 1) / 99;

  const submitDisabled = submitting || !(pickupCoords && destinationCoords && routeInfo);
  const helperText =
    pickupStatus === 'denied' ? 'Enable location to continue' :
    !destinationCoords ? 'Pick a destination' :
    !routeInfo ? 'Calculating route…' :
    null;

  const submit = async () => {
    if (submitDisabled || !pickupCoords || !destinationCoords || !routeInfo) return;
    try {
      setSubmitting(true);
      haptic.notify(Haptics.NotificationFeedbackType.Success);
      const when = new Date(selectedDate);
      when.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
      const ride = await createRide({
        pickup_address: pickupAddress,
        pickup_lat: pickupCoords.lat,
        pickup_lng: pickupCoords.lng,
        destination_address: destination,
        destination_lat: destinationCoords.lat,
        destination_lng: destinationCoords.lng,
        offered_price: price,
        distance_mi: routeInfo.distance_mi,
        eta_min: routeInfo.eta_min,
        scheduled_for: when.toISOString(),
        payment_method: paymentMethod,
        passenger_note: note.trim() || null,
      });
      setRideId(ride.id);
      navigate('Matching');
    } catch (e: any) {
      console.warn('[ScheduleScreen] createRide failed', e?.message ?? e);
      haptic.notify(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <TopBar title="ATEE" onBack={() => navigate('Book')} />
        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <View style={{ marginBottom: 12 }}>
            <MapView origin={pickupCoords} destination={destinationCoords} height={180} />
          </View>

          <View style={s.card}>
            <Text style={s.cardLabel}>PICKUP</Text>
            <Text style={s.cardValue}>📍 {pickupAddress}</Text>
            <View style={s.divider} />
            <Text style={s.cardLabel}>DESTINATION</Text>
            <TextInput
              style={s.destInput}
              placeholder="Where are you going?"
              placeholderTextColor="#aaa"
              value={destination}
              onChangeText={onDestChange}
            />
            {showSuggestions && predictions.length > 0 && (
              <View style={s.suggestBox}>
                {predictions.map((pred) => (
                  <TouchableOpacity
                    key={pred.place_id}
                    style={s.suggestRow}
                    onPress={() => onSelectPlace(pred)}
                  >
                    <Text style={{ marginRight: 8 }}>📍</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.suggestText}>{pred.main_text}</Text>
                      {pred.secondary_text ? (
                        <Text style={[s.suggestText, { fontSize: 11, color: '#999' }]} numberOfLines={1}>
                          {pred.secondary_text}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <RouteCard
            pickup={pickupAddress}
            destination={destination.length > 0 ? destination : '—'}
            eta={routeInfo ? `${routeInfo.eta_min} min` : '—'}
            distance={routeInfo ? `${routeInfo.distance_mi} mi` : '—'}
          />

          <View style={s.tabRow}>
            <TouchableOpacity style={s.tabInactive} onPress={() => navigate('Book')}>
              <Text style={s.tabInactiveText}>Instant</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.tabActive}>
              <Text style={s.tabActiveText}>Scheduled</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.sectionTitle}>Select Date</Text>
          <TouchableOpacity style={s.inputField} onPress={() => setShowDatePicker(true)}>
            <Text>📅 {selectedDate.toDateString()}</Text>
          </TouchableOpacity>
          <Text style={s.sectionTitle}>Select Time</Text>
          <TouchableOpacity style={s.inputField} onPress={() => setShowTimePicker(true)}>
            <Text>🕐 {selectedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          </TouchableOpacity>

          <View style={s.pricingCard}>
            <Text style={s.pricingTitle}>Set your price.</Text>
            <Text style={s.pricingSub}>Higher bid = faster match.</Text>
            <Text style={[s.priceBig, { textAlign: 'center', marginVertical: 14 }]}>${price}</Text>

            <View style={s.sliderTrack}>
              <View style={{ flex: fillFlex, height: 6, backgroundColor: priceColor, borderRadius: 3 }} />
              <View style={{ flex: 1 - fillFlex, height: 6 }} />
            </View>

            <View style={s.sliderRow}>
              <TouchableOpacity
                style={s.priceBtn}
                onPress={() => { haptic.select(); setPrice((p) => Math.max(1, p - 1)); }}
              >
                <Text style={s.priceBtnText}>−</Text>
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={[s.priceStatusLabel, { color: priceColor }]}>{priceLabel}</Text>
                <Text style={s.priceRec}>
                  {suggestedPrice ? `Suggested for this route: $${suggestedPrice}` : 'Higher bid = faster match'}
                </Text>
              </View>
              <TouchableOpacity
                style={s.priceBtn}
                onPress={() => { haptic.select(); setPrice((p) => Math.min(100, p + 1)); }}
              >
                <Text style={s.priceBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            <View style={[s.tabRow, { marginTop: 14 }]}>
              {(['cash', 'etransfer'] as PaymentMethod[]).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[s.payMethodBtn, paymentMethod === m && s.payMethodBtnActive]}
                  onPress={() => { haptic.select(); setPaymentMethod(m); }}
                >
                  <Text style={[s.payMethodText, paymentMethod === m && s.payMethodTextActive]}>
                    {m === 'cash' ? '💵 Cash' : '📱 E-transfer'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={{ backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12, fontSize: 13, color: '#111', borderWidth: 0.5, borderColor: '#e0e0e0', marginTop: 14, minHeight: 44 }}
              placeholder="Any notes for your driver? (optional)"
              placeholderTextColor="#aaa"
              value={note}
              onChangeText={setNote}
              maxLength={280}
              multiline
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[s.redBtn, { backgroundColor: 'white', marginTop: 14, opacity: submitDisabled ? 0.4 : 1 }]}
              onPress={submit}
              disabled={submitDisabled}
            >
              {submitting ? (
                <ActivityIndicator color={RED} />
              ) : (
                <Text style={[s.redBtnText, { color: RED }]}>Find Drivers for This Time →</Text>
              )}
            </TouchableOpacity>
            {helperText && !submitting && (
              <Text style={s.submitHelper}>{helperText}</Text>
            )}
          </View>
        </ScrollView>
        {Platform.OS !== 'web' && showDatePicker && (
          <View style={s.pickerOverlay}>
            <DateTimePicker value={selectedDate} mode="date" display="spinner"
              onChange={(_e, d) => { if (d) setSelectedDate(d); setShowDatePicker(false); }} />
          </View>
        )}
        {Platform.OS !== 'web' && showTimePicker && (
          <View style={s.pickerOverlay}>
            <DateTimePicker value={selectedTime} mode="time" display="spinner"
              onChange={(_e, t) => { if (t) setSelectedTime(t); setShowTimePicker(false); }} />
          </View>
        )}
        <BottomNav active="Search" navigate={navigate} mode="passenger" />
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── DRIVER BID ROW (needs its own component so hooks can run per bid) ────
function DriverBidRow({
  bid,
  idx,
  colors,
  choosing,
  onPress,
}: {
  bid: RideBid;
  idx: number;
  colors: string[];
  choosing: string | null;
  onPress: () => void;
}) {
  const name = bid.driver?.full_name || 'Driver';
  const rating = bid.driver?.rating?.toFixed(1) ?? '5.0';
  const trips = bid.driver?.total_trips ?? 0;
  const { displayString } = useDriverVehicle(bid.driver_id);

  return (
    <TouchableOpacity
      style={[s.driverRow, { opacity: choosing && choosing !== bid.driver_id ? 0.4 : 1 }]}
      onPress={onPress}
      disabled={!!choosing}
    >
      <DriverAvatar
        driverId={bid.driver_id}
        initials={getInitials(name)}
        background={colors[idx % colors.length]}
      />
      <View style={{ flex: 1 }}>
        <Text style={s.driverName}>{name}</Text>
        {displayString ? (
          <Text style={[s.muted, { marginBottom: 1 }]}>{displayString}</Text>
        ) : null}
        <Text style={s.muted}>⭐ {rating} · {trips} trips · Verified</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {choosing === bid.driver_id
          ? <ActivityIndicator color={RED} />
          : <>
              <Text style={[s.tripPrice, { color: RED }]}>ETA {bid.eta_min}m</Text>
              <View style={s.greenBadge}><Text style={s.greenBadgeText}>100% fare</Text></View>
            </>
        }
      </View>
    </TouchableOpacity>
  );
}

// ─── DRIVERS (passenger picks a driver from live bids) ────────
function DriversScreen({ navigate }: NavProp) {
  const { rideId } = useContext(RideContext);
  const { bids, loading } = useRideBids(rideId);
  const [choosing, setChoosing] = useState<string | null>(null);

  // Deterministic colors per bid so each avatar keeps the same color on refetch
  const colors = [RED, GREEN, '#185FA5', '#BA7517', '#6b21a8'];

  const pick = async (driverId: string) => {
    if (!rideId || choosing) return;
    try {
      setChoosing(driverId);
      haptic.impact();
      await chooseDriver(rideId, driverId);
      navigate('Confirmed');
    } catch (e: any) {
      console.warn('chooseDriver failed', e?.message ?? e);
      setChoosing(null);
    }
  };

  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <TopBar title="ATEE" onBack={() => navigate('Book')} />
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Text style={s.bigTitle}>Available Drivers</Text>
          {loading ? (
            <>
              <Text style={s.muted}>Confirming responses…</Text>
              <SkeletonCard /><SkeletonCard /><SkeletonCard />
            </>
          ) : bids.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Text style={s.muted}>No drivers accepted yet. Try raising your price.</Text>
              <TouchableOpacity style={s.outlineBtn} onPress={() => navigate('Book')}>
                <Text style={s.outlineBtnText}>Change Price</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={s.muted}>
                {bids.length} driver{bids.length > 1 ? 's' : ''} accepted your price
              </Text>
              {bids.map((bid, i) => (
                <DriverBidRow
                  key={bid.id}
                  bid={bid}
                  idx={i}
                  colors={colors}
                  choosing={choosing}
                  onPress={() => pick(bid.driver_id)}
                />
              ))}
              <TouchableOpacity style={s.outlineBtn} onPress={() => navigate('Book')}>
                <Text style={s.outlineBtnText}>Change Price</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
        <BottomNav active="Search" navigate={navigate} mode="passenger" />
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── CONFIRMED ────────────────────────────────────────────────
function ConfirmedScreen({ navigate }: NavProp) {
  const { rideId, setRideId, currentScreen } = useContext(RideContext);
  const { showBanner } = useBanner();

  const handleStatusChange = useCallback((newStatus: RideStatus) => {
    if (newStatus === 'in_progress') showBanner('Your driver started the trip!', 'success');
  }, [showBanner]);

  const handleChatMessage = useCallback((body: string) => {
    if (currentScreen !== 'Chat') showBanner(`Driver: ${body.slice(0, 60)}`, 'info');
  }, [showBanner, currentScreen]);

  const { ride, status } = useRideStatus(rideId, handleStatusChange);
  const driverCoords = useDriverLocation(ride?.driver_id ?? null);
  const unreadCount = useUnreadChatCount(rideId, handleChatMessage);
  const { driverName, displayString: vehicleDisplay, seats: vehicleSeats } = useDriverVehicle(ride?.driver_id);
  const [seconds, setSeconds] = useState(272);

  useEffect(() => {
    haptic.notify(Haptics.NotificationFeedbackType.Success);
    const t = setInterval(() => setSeconds((x) => Math.max(0, x - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  // When the driver completes the trip, send passenger to rating screen
  useEffect(() => {
    if (status === 'completed') {
      const t = setTimeout(() => {
        navigate('RateTrip'); // keep rideId — RateTrip needs it
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [status]);

  const handleCancelRide = () => {
    const doCancel = async () => {
      try { if (rideId) await cancelRide(rideId); } catch (e) { console.warn('cancel failed', e); }
      setRideId(null);
      navigate('Home');
    };
    if (Platform.OS === 'web') {
      if ((globalThis as any).confirm('Cancel your ride?')) doCancel();
    } else {
      Alert.alert('Cancel ride?', 'Your driver will be notified.', [
        { text: 'Keep ride', style: 'cancel' },
        { text: 'Cancel ride', style: 'destructive', onPress: doCancel },
      ]);
    }
  };

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const timerLabel = seconds > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : 'Arriving now! 🎉';

  const rows: [string, string][] = [
    ['Pickup', ride?.pickup_address ?? '124 Baker Street'],
    ['Destination', ride?.destination_address ?? 'Heathrow T5'],
    ['Your Price', `$${ride?.offered_price?.toFixed(2) ?? '45.00'}`],
  ];

  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <TopBar
          title="ATEE"
          rightElement={
            (status === 'driver_assigned' || status === 'in_progress') ? (
              <TouchableOpacity style={s.chatIconWrap} onPress={() => navigate('Chat')}>
                <Ionicons name="chatbubble-ellipses" size={24} color="white" />
                {unreadCount > 0 && (
                  <View style={s.chatBadge}>
                    <Text style={s.chatBadgeText}>{unreadCount > 9 ? '9+' : String(unreadCount)}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ) : undefined
          }
        />
        <View style={{ alignItems: 'center', backgroundColor: RED, paddingVertical: 24 }}>
          <View style={s.checkCircle}>
            <Text style={{ fontSize: 26, color: RED }}>✓</Text>
          </View>
          <Text style={{ fontSize: 20, fontWeight: '600', color: 'white', marginTop: 8 }}>
            {status === 'in_progress' ? 'On the road' :
             status === 'completed' ? 'Trip complete!' :
             'Ride Confirmed!'}
          </Text>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 4 }}>
            {status === 'completed' ? 'Thanks for riding with ATEE' : 'Your driver is on the way'}
          </Text>
          {status !== 'completed' && (
            <View style={{ marginTop: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Arriving in</Text>
              <Text style={s.countdownTimer}>{timerLabel}</Text>
            </View>
          )}
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <MapView
            origin={ride?.pickup_lat && ride?.pickup_lng
              ? { lat: ride.pickup_lat, lng: ride.pickup_lng }
              : null}
            destination={ride?.destination_lat && ride?.destination_lng
              ? { lat: ride.destination_lat, lng: ride.destination_lng }
              : null}
            driver={driverCoords}
            height={180}
          />
          <RouteCard
            pickup={ride?.pickup_address ?? '—'}
            destination={ride?.destination_address ?? '—'}
            eta={ride?.eta_min != null ? `${ride.eta_min} min` : '—'}
            distance={ride?.distance_mi != null ? `${ride.distance_mi} mi` : '—'}
          />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {ride?.driver_id && (
            <View style={[s.card, { marginBottom: 12 }]}>
              <View style={s.driverCardInner}>
                <DriverAvatar
                  driverId={ride.driver_id}
                  initials={getInitials(driverName ?? undefined)}
                  size={48}
                />
                <View style={{ flex: 1 }}>
                  <Text style={s.driverName}>{driverName ?? 'Your Driver'}</Text>
                  {vehicleDisplay ? (
                    <Text style={s.muted}>{vehicleDisplay}</Text>
                  ) : null}
                  {vehicleSeats ? (
                    <Text style={s.muted}>{vehicleSeats} seats available</Text>
                  ) : (
                    <Text style={s.muted}>On the way to you</Text>
                  )}
                </View>
              </View>
            </View>
          )}
          <View style={s.card}>
            {rows.map(([label, val], i) => (
              <View key={i} style={[s.rowBetween, { paddingVertical: 6, borderBottomWidth: i < 2 ? 0.5 : 0, borderColor: '#eee' }]}>
                <Text style={s.muted}>{label}</Text>
                <Text style={[s.driverName, { color: i === 2 ? RED : '#111' }]}>{val}</Text>
              </View>
            ))}
          </View>
          {status !== 'in_progress' && status !== 'completed' && (
            <TouchableOpacity style={s.outlineBtn} onPress={handleCancelRide}>
              <Text style={[s.outlineBtnText, { color: RED }]}>Cancel Ride</Text>
            </TouchableOpacity>
          )}
          {status === 'completed' && (
            <TouchableOpacity style={s.redBtn} onPress={() => { setRideId(null); navigate('Home'); }}>
              <Text style={s.redBtnText}>Done</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── DRIVER HOME (live queue from Realtime) ───────────────────
const NEARBY_RADIUS_MI = 25;

function DriverHomeScreen({ navigate }: NavProp) {
  const { setSelectedRide } = useContext(RideContext);
  const { showBanner } = useBanner();
  const [online, setOnline] = useState(false);

  const shortAddr = (addr: string) => addr.split(',')[0];

  const handleNewRide = useCallback((ride: Ride) => {
    showBanner(
      `New request: ${shortAddr(ride.pickup_address)} → ${shortAddr(ride.destination_address)} · $${ride.offered_price.toFixed(2)}`,
      'success',
    );
  }, [showBanner]);

  const { rides: allRides } = useDriverQueue(online, handleNewRide);
  const { stats: todayStats } = useDriverTodayStats();
  const { isComplete: vehicleComplete } = useMyVehicle();
  const [driverCoords, setDriverCoords] = useState<LatLng | null>(null);

  // Get driver's location once on mount for proximity filtering
  useEffect(() => {
    getCurrentPosition().then((r) => {
      if (r.status === 'ok') setDriverCoords(r.coords);
    });
  }, []);

  // Filter rides to within 25 miles of driver's current location
  const rides = driverCoords
    ? allRides.filter((r) => {
        if (!r.pickup_lat || !r.pickup_lng) return true; // no coords = include
        return haversineDistanceMi(driverCoords, { lat: r.pickup_lat, lng: r.pickup_lng }) <= NEARBY_RADIUS_MI;
      })
    : allRides;

  const goOnline = () => {
    if (!vehicleComplete) {
      Alert.alert('Vehicle required', 'Add your vehicle profile before going online.', [
        { text: 'Set up vehicle', onPress: () => navigate('VehicleProfile') },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    setOnline(true);
  };

  // Sync online state to Supabase and stream GPS when online
  useEffect(() => {
    setDriverOnline(online).catch((e: any) => {
      const msg: string = e?.message ?? '';
      if (msg.includes('VEHICLE_PROFILE_REQUIRED')) {
        setOnline(false);
        Alert.alert('Vehicle required', 'Complete your vehicle profile to go online.', [
          { text: 'Set up vehicle', onPress: () => navigate('VehicleProfile') },
          { text: 'Cancel', style: 'cancel' },
        ]);
      } else {
        console.warn('setDriverOnline failed', e);
      }
    });
    if (online) {
      startLocationStream();
    } else {
      stopLocationStream();
    }
  }, [online]);

  // Stop streaming on unmount
  useEffect(() => {
    return () => { stopLocationStream(); };
  }, []);

  const earningsDisplay = `$${(todayStats.earningsCents / 100).toFixed(2)}`;
  const stats: [string, string][] = [
    ['Active Time', '—'],
    ['Trips', String(todayStats.tripsCompleted)],
    ['Acceptance', '—'],
  ];

  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <TopBar
          title="ATEE"
          onBack={() => navigate('Onboarding')}
          onRight={() => navigate('Onboarding')}
          rightLabel="Switch role"
        />
        <View style={{ backgroundColor: RED, paddingHorizontal: 16, paddingBottom: 14 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={[s.toggleBtn, online && s.toggleBtnActive]} onPress={() => { haptic.select(); goOnline(); }}>
              <Text style={[s.toggleBtnText, online && { color: RED }]}>ONLINE</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.toggleBtn, !online && s.toggleBtnActive]} onPress={() => { haptic.select(); setOnline(false); }}>
              <Text style={[s.toggleBtnText, !online && { color: RED }]}>OFFLINE</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 6 }}>
            {online ? '🟢 Searching for nearby riders...' : '🔴 You are offline'}
          </Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {!vehicleComplete && (
            <View style={s.vehicleBanner}>
              <Text style={s.vehicleBannerText}>🚗 Add your vehicle profile to start driving</Text>
              <TouchableOpacity
                style={s.vehicleBannerBtn}
                onPress={() => navigate('VehicleProfile')}
              >
                <Text style={s.vehicleBannerBtnText}>Set up vehicle →</Text>
              </TouchableOpacity>
            </View>
          )}
          <Text style={s.muted}>Today's earnings</Text>
          <Text style={[s.bigTitle, { color: RED }]}>{earningsDisplay}</Text>
          <View style={s.greenPill}>
            <Text style={s.greenPillText}>$0 commission — 100% yours</Text>
          </View>
          <View style={[s.statRow, { marginTop: 12 }]}>
            {stats.map(([label, val], i) => (
              <View key={i} style={s.statBox}>
                <Text style={s.statLabel}>{label}</Text>
                <Text style={s.statValue}>{val}</Text>
              </View>
            ))}
          </View>
          <View style={s.rowBetween}>
            <Text style={s.sectionTitle}>Nearby Requests</Text>
            {rides.length > 0 && (
              <View style={s.redBadge}>
                <Text style={s.redBadgeText}>{rides.length} Available</Text>
              </View>
            )}
          </View>
          {rides.length === 0 ? (
            <View style={[s.card, { alignItems: 'center', paddingVertical: 24 }]}>
              <Text style={s.muted}>
                {online ? 'Waiting for new requests…' : 'Go online to see requests'}
              </Text>
            </View>
          ) : (
            rides.map((ride) => (
              <TouchableOpacity
                key={ride.id}
                style={s.card}
                onPress={() => { setSelectedRide(ride); navigate('DriverRequest'); }}
              >
                <View style={s.driverCardInner}>
                  <View style={[s.avatarCircle, { backgroundColor: RED }]}>
                    <Text style={s.avatarText}>$</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.driverName} numberOfLines={1}>
                      {ride.pickup_address}
                    </Text>
                    <Text style={s.muted} numberOfLines={1}>→ {ride.destination_address}</Text>
                    <Text style={[s.muted, { marginTop: 2 }]}>
                      {ride.distance_mi ?? '—'} mi · {ride.eta_min ?? '—'} min
                      {ride.scheduled_for ? ` · 🗓 Scheduled` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[s.tripPrice, { color: RED }]}>${ride.offered_price.toFixed(2)}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={[s.muted, { fontSize: 10 }]}>{ride.payment_method === 'etransfer' ? '📱' : '💵'}</Text>
                      {ride.passenger_note ? <Text style={{ fontSize: 10 }}>📝</Text> : null}
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
        <BottomNav active="Home" navigate={navigate} mode="driver" />
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── DRIVER REQUEST ───────────────────────────────────────────
function DriverRequestScreen({ navigate }: NavProp) {
  const { selectedRide, setChosenBid } = useContext(RideContext);
  const [accepting, setAccepting] = useState(false);
  const { profile: passengerProfile } = useUserProfile(selectedRide?.passenger_id);
  const { status: rideStatus } = useRideStatus(selectedRide?.id ?? null);

  // If passenger cancels while driver is viewing the request
  useEffect(() => {
    if (rideStatus === 'cancelled') {
      haptic.notify(Haptics.NotificationFeedbackType.Warning);
      if (Platform.OS === 'web') {
        (globalThis as any).alert('This ride was cancelled by the passenger.');
        navigate('DriverHome');
      } else {
        Alert.alert('Ride Cancelled', 'The passenger cancelled this request.', [
          { text: 'OK', onPress: () => navigate('DriverHome') },
        ]);
      }
    }
  }, [rideStatus]);
  const pan = useRef(new Animated.ValueXY()).current;

  const handleAccept = async () => {
    if (!selectedRide || accepting) return;
    try {
      setAccepting(true);
      haptic.notify(Haptics.NotificationFeedbackType.Success);

      // Calculate real ETA from driver's current location to pickup
      let etaMin = 5;
      if (selectedRide.pickup_lat && selectedRide.pickup_lng) {
        try {
          const pos = await getCurrentPosition();
          if (pos.status === 'ok') {
            const route = await getRouteInfo(pos.coords, {
              lat: selectedRide.pickup_lat,
              lng: selectedRide.pickup_lng,
            });
            if (route) etaMin = route.eta_min;
          }
        } catch { /* fall back to 5 min */ }
      }

      const bid = await acceptRide(selectedRide.id, etaMin);
      setChosenBid(bid);
      navigate('DriverActive');
    } catch (e: any) {
      console.warn('acceptRide failed', e?.message ?? e);
      setAccepting(false);
    }
  };

  const handleDecline = () => {
    haptic.impact(Haptics.ImpactFeedbackStyle.Heavy);
    navigate('DriverHome');
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10,
      onPanResponderMove: Animated.event([null, { dx: pan.x }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        if (g.dx > 80) {
          Animated.timing(pan, { toValue: { x: width, y: 0 }, duration: 250, useNativeDriver: false })
            .start(() => handleAccept());
        } else if (g.dx < -80) {
          Animated.timing(pan, { toValue: { x: -width, y: 0 }, duration: 250, useNativeDriver: false })
            .start(() => handleDecline());
        } else {
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        }
      },
    })
  ).current;

  const cardBg = pan.x.interpolate({ inputRange: [-150, 0, 150], outputRange: ['#ffeded', 'white', '#eaf3de'], extrapolate: 'clamp' });
  const acceptOpacity = pan.x.interpolate({ inputRange: [0, 80], outputRange: [0, 1], extrapolate: 'clamp' });
  const declineOpacity = pan.x.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  if (!selectedRide) {
    return (
      <SafeAreaView style={s.screen}>
        <TopBar title="ATEE" onBack={() => navigate('Onboarding')} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={s.muted}>No request selected.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const price = selectedRide.offered_price.toFixed(2);

  const fmtScheduled = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
      + ' at '
      + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isScheduled = !!selectedRide.scheduled_for;

  const tripRows: { label: string; value: string; color?: string; highlight?: boolean }[] = [
    ...(isScheduled
      ? [{ label: '🗓 Scheduled for', value: fmtScheduled(selectedRide.scheduled_for!), highlight: true }]
      : []),
    { label: 'From', value: selectedRide.pickup_address },
    { label: 'To', value: selectedRide.destination_address },
    { label: 'Distance', value: `${selectedRide.distance_mi ?? '—'} miles` },
    {
      label: 'Payment',
      value: selectedRide.payment_method === 'etransfer' ? '📱 E-transfer' : '💵 Cash',
    },
    { label: 'Passenger offer', value: `$${price}`, color: RED },
    { label: 'You keep', value: `$${price} (100%)`, color: GREEN },
  ];

  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <TopBar title="ATEE" onBack={() => navigate('Onboarding')} />
        <View style={{ padding: 16, flex: 1 }}>
          <Text style={[s.bigTitle, { marginBottom: 4 }]}>Trip Request</Text>
          <Text style={s.muted}>Swipe right to accept · Swipe left to decline</Text>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Animated.View style={[s.swipeHint, s.swipeHintLeft, { opacity: declineOpacity }]}>
              <Text style={s.swipeHintTextRed}>✗ Decline</Text>
            </Animated.View>
            <Animated.View style={[s.swipeHint, s.swipeHintRight, { opacity: acceptOpacity }]}>
              <Text style={s.swipeHintTextGreen}>✓ Accept</Text>
            </Animated.View>
            <Animated.View
              style={[s.swipeCard, { backgroundColor: cardBg, transform: [{ translateX: pan.x }] }]}
              {...panResponder.panHandlers}
            >
              <View style={s.driverCardInner}>
                <View style={[s.avatarCircle, { backgroundColor: RED }]}>
                  <Text style={s.avatarText}>{getInitials(passengerProfile?.full_name ?? undefined)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.driverName}>{passengerProfile?.full_name ?? 'Passenger'}</Text>
                  <Text style={s.muted}>
                    ⭐ {passengerProfile?.rating?.toFixed(1) ?? '5.0'} · {passengerProfile?.total_trips ?? 0} trips
                  </Text>
                </View>
              </View>
              <View style={s.divider} />
              {tripRows.map((row, i) => (
                <View
                  key={i}
                  style={[
                    s.rowBetween,
                    { paddingVertical: 7 },
                    row.highlight && {
                      backgroundColor: '#FEF3C7',
                      marginHorizontal: -14,
                      paddingHorizontal: 14,
                      borderRadius: 8,
                      marginBottom: 4,
                    },
                  ]}
                >
                  <Text style={[s.muted, row.highlight && { color: '#92400E', fontWeight: '600' }]}>
                    {row.label}
                  </Text>
                  <Text style={[s.driverName, { color: row.color ?? '#111', flexShrink: 1, textAlign: 'right', marginLeft: 12 }]}>
                    {row.value}
                  </Text>
                </View>
              ))}
              {selectedRide.passenger_note ? (
                <View style={{ backgroundColor: '#FEF3C7', borderRadius: 8, padding: 10, marginTop: 8 }}>
                  <Text style={{ fontSize: 12, color: '#92400E', fontWeight: '600', marginBottom: 2 }}>📝 Passenger note</Text>
                  <Text style={{ fontSize: 13, color: '#78350F' }}>{selectedRide.passenger_note}</Text>
                </View>
              ) : null}
            </Animated.View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            <TouchableOpacity style={[s.outlineBtn, { flex: 1 }]} onPress={handleDecline} disabled={accepting}>
              <Text style={s.outlineBtnText}>✗ Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.redBtn, { flex: 1, margin: 0, opacity: accepting ? 0.6 : 1 }]}
              onPress={handleAccept}
              disabled={accepting}
            >
              {accepting
                ? <ActivityIndicator color="white" />
                : <Text style={s.redBtnText}>✓ Accept</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── DRIVER ACTIVE ────────────────────────────────────────────
function DriverActiveScreen({ navigate }: NavProp) {
  const { selectedRide, setSelectedRide, currentScreen } = useContext(RideContext);
  const { showBanner } = useBanner();
  const [loading, setLoading] = useState(false);
  const [showPayConfirm, setShowPayConfirm] = useState(false);

  const handleChatMessage = useCallback((body: string) => {
    if (currentScreen !== 'Chat') showBanner(`Passenger: ${body.slice(0, 60)}`, 'info');
  }, [showBanner, currentScreen]);

  const unreadCount = useUnreadChatCount(selectedRide?.id ?? null, handleChatMessage);
  const { status: liveStatus } = useRideStatus(selectedRide?.id ?? null);
  const { profile: passengerProfile } = useUserProfile(selectedRide?.passenger_id);

  // Detect passenger cancellation
  useEffect(() => {
    if (liveStatus === 'cancelled') {
      haptic.notify(Haptics.NotificationFeedbackType.Warning);
      if (Platform.OS === 'web') {
        (globalThis as any).alert('The passenger cancelled the trip.');
        setSelectedRide(null);
        navigate('DriverHome');
      } else {
        Alert.alert('Trip Cancelled', 'The passenger cancelled this trip.', [
          {
            text: 'OK',
            onPress: () => { setSelectedRide(null); navigate('DriverHome'); },
          },
        ]);
      }
    }
  }, [liveStatus]);

  const handleBackToOnboarding = () => {
    if (selectedRide) {
      if (Platform.OS === 'web') {
        if ((globalThis as any).confirm('Leave active trip? The passenger is expecting you.')) {
          navigate('Onboarding');
        }
      } else {
        Alert.alert(
          'Leave active trip?',
          'The passenger is expecting you.',
          [
            { text: 'Stay', style: 'cancel' },
            { text: 'Leave', style: 'destructive', onPress: () => navigate('Onboarding') },
          ],
        );
      }
    } else {
      navigate('Onboarding');
    }
  };

  const handleComplete = () => {
    haptic.impact();
    setShowPayConfirm(true);
  };

  const confirmPayment = async (payStatus: 'paid' | 'disputed') => {
    if (!selectedRide || loading) return;
    try {
      setLoading(true);
      haptic.notify(Haptics.NotificationFeedbackType.Success);
      await completeRideWithPayment(selectedRide.id, payStatus);
      navigate('DriverComplete');
    } catch (e: any) {
      console.warn('completeRideWithPayment failed', e?.message ?? e);
      setLoading(false);
      setShowPayConfirm(false);
    }
  };

  const handleStart = async () => {
    if (!selectedRide) return;
    try { await startRide(selectedRide.id); } catch (e) { console.warn(e); }
  };

  useEffect(() => { handleStart(); }, []);

  if (!selectedRide) {
    return (
      <SafeAreaView style={s.screen}>
        <TopBar title="ATEE" onBack={() => navigate('DriverHome')} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={s.muted}>No active trip.</Text>
          <TouchableOpacity style={s.redBtn} onPress={() => navigate('DriverHome')}>
            <Text style={s.redBtnText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const payMethodLabel =
    selectedRide.payment_method === 'etransfer' ? '📱 E-transfer' : '💵 Cash';

  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <TopBar
          title="Active Trip"
          onBack={handleBackToOnboarding}
          rightElement={
            <TouchableOpacity style={s.chatIconWrap} onPress={() => navigate('Chat')}>
              <Ionicons name="chatbubble-ellipses" size={24} color="white" />
              {unreadCount > 0 && (
                <View style={s.chatBadge}>
                  <Text style={s.chatBadgeText}>{unreadCount > 9 ? '9+' : String(unreadCount)}</Text>
                </View>
              )}
            </TouchableOpacity>
          }
        />
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <MapView
            origin={selectedRide.pickup_lat && selectedRide.pickup_lng
              ? { lat: selectedRide.pickup_lat, lng: selectedRide.pickup_lng }
              : null}
            destination={selectedRide.destination_lat && selectedRide.destination_lng
              ? { lat: selectedRide.destination_lat, lng: selectedRide.destination_lng }
              : null}
            height={200}
          />
          <RouteCard
            pickup={selectedRide.pickup_address}
            destination={selectedRide.destination_address}
            eta={selectedRide.eta_min != null ? `${selectedRide.eta_min} min` : '—'}
            distance={selectedRide.distance_mi != null ? `${selectedRide.distance_mi} mi` : '—'}
          />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={s.card}>
            <View style={s.driverCardInner}>
              <View style={[s.avatarCircle, { backgroundColor: RED }]}>
                <Text style={s.avatarText}>{getInitials(passengerProfile?.full_name ?? undefined)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.driverName}>{passengerProfile?.full_name ?? 'Passenger'}</Text>
                <Text style={s.muted}>
                  ⭐ {passengerProfile?.rating?.toFixed(1) ?? '5.0'} · Pickup in progress
                </Text>
              </View>
              <Text style={[s.tripPrice, { color: RED }]}>${selectedRide.offered_price.toFixed(2)}</Text>
            </View>
            <View style={s.divider} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={s.cardLabel}>PAYMENT METHOD</Text>
              <View style={s.greenBadge}>
                <Text style={s.greenBadgeText}>{payMethodLabel}</Text>
              </View>
            </View>
          </View>
          <View style={s.statRow}>
            <View style={s.statBox}><Text style={s.statLabel}>ETA</Text><Text style={s.statValue}>{selectedRide.eta_min != null ? `${selectedRide.eta_min} min` : '—'}</Text></View>
            <View style={s.statBox}><Text style={s.statLabel}>Distance</Text><Text style={s.statValue}>{selectedRide.distance_mi != null ? `${selectedRide.distance_mi} mi` : '—'}</Text></View>
          </View>

          {selectedRide.passenger_note ? (
            <View style={{ backgroundColor: '#FEF3C7', borderRadius: 8, padding: 10, marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: '#92400E', fontWeight: '600', marginBottom: 2 }}>📝 Note from passenger</Text>
              <Text style={{ fontSize: 13, color: '#78350F' }}>{selectedRide.passenger_note}</Text>
            </View>
          ) : null}

          {!showPayConfirm ? (
            <TouchableOpacity style={s.redBtn} onPress={handleComplete} disabled={loading}>
              <Text style={s.redBtnText}>Complete Trip</Text>
            </TouchableOpacity>
          ) : (
            <View style={[s.card, { backgroundColor: '#fdf6ec', borderColor: AMBER }]}>
              <Text style={[s.driverName, { marginBottom: 4 }]}>Did the passenger pay?</Text>
              <Text style={[s.muted, { marginBottom: 12 }]}>
                {selectedRide.payment_method === 'etransfer'
                  ? 'Confirm you received the e-transfer.'
                  : 'Confirm you received cash.'}
              </Text>
              <TouchableOpacity
                style={[s.redBtn, { backgroundColor: GREEN, opacity: loading ? 0.6 : 1 }]}
                onPress={() => confirmPayment('paid')}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="white" />
                  : <Text style={s.redBtnText}>Yes, Paid ✓</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.outlineBtn, { borderColor: RED, marginTop: 8, opacity: loading ? 0.6 : 1 }]}
                onPress={() => confirmPayment('disputed')}
                disabled={loading}
              >
                <Text style={[s.outlineBtnText, { color: RED }]}>Not Paid — Mark Disputed</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ alignItems: 'center', marginTop: 10 }}
                onPress={() => setShowPayConfirm(false)}
              >
                <Text style={s.muted}>← Go back</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
        <BottomNav active="Trips" navigate={navigate} mode="driver" />
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── DRIVER COMPLETE ──────────────────────────────────────────
function DriverCompleteScreen({ navigate }: NavProp) {
  const { selectedRide, setSelectedRide, setChosenBid } = useContext(RideContext);
  const { profile: passengerProfile } = useUserProfile(selectedRide?.passenger_id);

  useEffect(() => {
    if (selectedRide) haptic.notify(Haptics.NotificationFeedbackType.Success);
  }, []);

  const finish = (dest: ScreenName) => {
    setSelectedRide(null);
    setChosenBid(null);
    navigate(dest);
  };

  if (!selectedRide) {
    return (
      <SafeAreaView style={s.screen}>
        <TopBar title="ATEE" onBack={() => navigate('DriverHome')} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={s.muted}>No active trip.</Text>
          <TouchableOpacity style={s.redBtn} onPress={() => navigate('DriverHome')}>
            <Text style={s.redBtnText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const earned = selectedRide.offered_price.toFixed(2);

  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <TopBar title="ATEE" onBack={() => navigate('Onboarding')} />
        <View style={{ backgroundColor: RED, padding: 28, alignItems: 'center' }}>
          <Text style={s.logo}>ATEE</Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 8 }}>Trip complete! You earned</Text>
          <Text style={{ fontSize: 52, fontWeight: '600', color: 'white' }}>${earned}</Text>
          <View style={s.greenPill}><Text style={s.greenPillText}>100% yours. $0 commission.</Text></View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={s.card}>
            <Text style={[s.sectionTitle, { marginBottom: 10 }]}>Trip Summary</Text>
            {passengerProfile?.full_name ? (
              <View style={[s.rowBetween, { paddingVertical: 5, borderBottomWidth: 0.5, borderColor: '#eee' }]}>
                <Text style={s.muted}>Passenger</Text>
                <Text style={s.driverName}>{passengerProfile.full_name}</Text>
              </View>
            ) : null}
            <View style={[s.rowBetween, { paddingVertical: 5, borderBottomWidth: 0.5, borderColor: '#eee' }]}>
              <Text style={s.muted}>From</Text>
              <Text style={[s.driverName, { flex: 1, textAlign: 'right', marginLeft: 12 }]} numberOfLines={1}>
                {selectedRide.pickup_address}
              </Text>
            </View>
            <View style={[s.rowBetween, { paddingVertical: 5, borderBottomWidth: 0.5, borderColor: '#eee' }]}>
              <Text style={s.muted}>To</Text>
              <Text style={[s.driverName, { flex: 1, textAlign: 'right', marginLeft: 12 }]} numberOfLines={1}>
                {selectedRide.destination_address}
              </Text>
            </View>
            {selectedRide.distance_mi != null && (
              <View style={[s.rowBetween, { paddingVertical: 5, borderBottomWidth: 0.5, borderColor: '#eee' }]}>
                <Text style={s.muted}>Distance</Text>
                <Text style={s.driverName}>{selectedRide.distance_mi} mi</Text>
              </View>
            )}
            <View style={[s.rowBetween, { paddingVertical: 5 }]}>
              <Text style={s.muted}>Payment</Text>
              <Text style={s.driverName}>
                {selectedRide.payment_method === 'etransfer' ? '📱 E-transfer' : '💵 Cash'}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={s.redBtn} onPress={() => finish('DriverEarnings')}>
            <Text style={s.redBtnText}>View Earnings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.outlineBtn} onPress={() => finish('DriverHome')}>
            <Text style={s.outlineBtnText}>Find Next Trip</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── CHAT ─────────────────────────────────────────────────────
const QUICK_REPLIES = [
  "I'm outside 👋",
  'Be there in 2 min 🕐',
  'Need to cancel ⚠️',
  'On my way 🚗',
];

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function ChatScreen({ navigate }: NavProp) {
  const { rideId, selectedRide } = useContext(RideContext);
  const { profile } = useMyProfile();

  const isDriver = profile?.role === 'driver' || profile?.role === 'both';
  // Driver: use selectedRide; Passenger: fall back to rideId
  const activeRideId = selectedRide?.id ?? rideId;
  // Fetch live ride so passenger side always has driver_id resolved
  const { ride: liveRide } = useRideStatus(activeRideId);
  const recipientId = isDriver
    ? (liveRide?.passenger_id ?? selectedRide?.passenger_id ?? null)
    : (liveRide?.driver_id ?? null);

  const { messages, loading } = useChatMessages(activeRideId);
  const [myId, setMyId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  const handleBack = () => navigate(isDriver ? 'DriverActive' : 'Confirmed');

  const safeSend = async (fn: () => Promise<ChatMessage>) => {
    if (!activeRideId || !recipientId) return;
    try {
      setSending(true);
      await fn();
    } catch (e: any) {
      console.warn('[Chat] send failed', e?.message ?? e);
    } finally {
      setSending(false);
    }
  };

  const sendText = () => {
    const body = text.trim();
    if (!body || !activeRideId || !recipientId) return;
    setText('');
    safeSend(() => sendTextMessage(activeRideId, recipientId, body));
  };

  const sendQuick = (label: string) => {
    if (!activeRideId || !recipientId) return;
    safeSend(() => sendQuickReply(activeRideId, recipientId, label));
  };

  const sendLocation = async () => {
    if (!activeRideId || !recipientId) return;
    const result = await getCurrentPosition();
    if (result.status !== 'ok') {
      Alert.alert('Location unavailable', 'Enable location access and try again.');
      return;
    }
    safeSend(() =>
      sendLocationMessage(activeRideId, recipientId, result.coords.lat, result.coords.lng, '📍 Shared my location'),
    );
  };

  const otherPartyName = isDriver ? 'Passenger' : 'Your Driver';

  if (!activeRideId) {
    return (
      <SafeAreaView style={s.screen}>
        <TopBar title="Chat" onBack={handleBack} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={s.muted}>No active ride.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <TopBar title={otherPartyName} onBack={handleBack} />

        {/* Message list */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 12, paddingBottom: 4 }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {loading ? (
            <View style={{ alignItems: 'center', paddingTop: 32 }}>
              <ActivityIndicator color={RED} />
            </View>
          ) : messages.length === 0 ? (
            <View style={s.chatEmptyWrap}>
              <Ionicons name="chatbubbles-outline" size={48} color="#ddd" />
              <Text style={[s.muted, { marginTop: 10, fontSize: 14 }]}>
                Say hi to your {otherPartyName.toLowerCase()}
              </Text>
            </View>
          ) : (
            messages.map((msg) => {
              const mine = msg.sender_id === myId;
              return (
                <View
                  key={msg.id}
                  style={[s.chatBubbleRow, mine ? s.chatBubbleRowMine : s.chatBubbleRowTheirs]}
                >
                  <View style={[s.chatBubble, mine ? s.chatBubbleMine : s.chatBubbleTheirs]}>
                    {msg.type === 'location' ? (
                      <View>
                        <Text style={[s.chatBubbleText, mine && { color: 'white' }]}>
                          {msg.body ?? '📍 Location'}
                        </Text>
                        <View style={{ marginTop: 6, borderRadius: 8, overflow: 'hidden' }}>
                          <MapView
                            origin={msg.lat != null && msg.lng != null ? { lat: msg.lat, lng: msg.lng } : null}
                            height={120}
                          />
                        </View>
                      </View>
                    ) : (
                      <Text style={[s.chatBubbleText, mine && { color: 'white' }]}>
                        {msg.body}
                      </Text>
                    )}
                    <Text style={[s.chatTimestamp, mine && { color: 'rgba(255,255,255,0.65)' }]}>
                      {relativeTime(msg.created_at)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Quick replies */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.quickReplyRow}
          keyboardShouldPersistTaps="handled"
        >
          {QUICK_REPLIES.map((label) => (
            <TouchableOpacity
              key={label}
              style={s.quickReplyChip}
              onPress={() => { haptic.select(); sendQuick(label); }}
              disabled={sending}
            >
              <Text style={s.quickReplyText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Input bar */}
        <View style={s.chatInputBar}>
          <TouchableOpacity style={s.chatInputIcon} onPress={sendLocation} disabled={sending}>
            <Ionicons name="location" size={22} color={RED} />
          </TouchableOpacity>
          <TextInput
            style={s.chatInput}
            placeholder="Message..."
            placeholderTextColor="#aaa"
            value={text}
            onChangeText={setText}
            onSubmitEditing={sendText}
            returnKeyType="send"
            multiline={false}
          />
          <TouchableOpacity
            style={[s.chatSendBtn, (!text.trim() || sending) && { opacity: 0.4 }]}
            onPress={sendText}
            disabled={!text.trim() || sending}
          >
            <Ionicons name="send" size={18} color="white" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── RATE TRIP ────────────────────────────────────────────────
function RateTripScreen({ navigate }: NavProp) {
  const { rideId, setRideId } = useContext(RideContext);
  const { ride } = useRideStatus(rideId);

  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { profile: driverProfile } = useUserProfile(ride?.driver_id);
  const driverName = driverProfile?.full_name ?? null;

  const finish = () => {
    setRideId(null);
    navigate('Home');
  };

  const handleSubmit = async () => {
    if (!rideId || !ride?.driver_id || submitting) return;
    try {
      setSubmitting(true);
      await submitRating({
        rideId,
        driverId: ride.driver_id,
        stars,
        comment: comment.trim() || undefined,
      });
      haptic.notify(Haptics.NotificationFeedbackType.Success);
      finish();
    } catch (e: any) {
      // 23505 = unique_violation — already rated, treat as success
      if (e?.code === '23505') { finish(); return; }
      haptic.notify(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Could not submit rating', e?.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <TopBar title="Rate your trip" />
        <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginBottom: 28 }}>
            <DriverAvatar
              driverId={ride?.driver_id ?? null}
              initials={getInitials(driverName)}
              size={72}
            />
            <Text style={[s.bigTitle, { textAlign: 'center', marginBottom: 4 }]}>
              Thanks for riding with ATEE
            </Text>
            {driverName && (
              <Text style={[s.muted, { fontSize: 14 }]}>
                Your driver was <Text style={{ fontWeight: '600', color: '#111' }}>{driverName}</Text>
              </Text>
            )}
          </View>

          <Text style={[s.sectionTitle, { textAlign: 'center', marginBottom: 12 }]}>
            How was your trip?
          </Text>

          <View style={s.starRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity
                key={n}
                onPress={() => { haptic.select(); setStars(n); }}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <Text style={s.starIcon}>{n <= stars ? '⭐' : '☆'}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[s.muted, { textAlign: 'center', marginBottom: 16 }]}>
            {stars === 5 ? 'Excellent!' : stars === 4 ? 'Good' : stars === 3 ? 'Okay' : stars === 2 ? 'Poor' : 'Terrible'}
          </Text>

          <TextInput
            style={s.ratingCommentInput}
            placeholder="Tell us how it went — optional"
            placeholderTextColor="#aaa"
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={280}
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[s.redBtn, { marginTop: 20, opacity: submitting ? 0.6 : 1 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="white" />
              : <Text style={s.redBtnText}>Submit Rating</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.outlineBtn, { opacity: submitting ? 0.4 : 1 }]}
            onPress={finish}
            disabled={submitting}
          >
            <Text style={s.outlineBtnText}>Skip</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── TRIPS HISTORY ────────────────────────────────────────────
function TripsScreen({ navigate }: NavProp) {
  const { profile } = useMyProfile();
  const isDriver = profile?.role === 'driver' || profile?.role === 'both';
  const [activeTab, setActiveTab] = useState<'passenger' | 'driver'>('passenger');
  const [passengerRides, setPassengerRides] = useState<RideType[]>([]);
  const [driverRides, setDriverRides] = useState<RideType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const fetches: Promise<void>[] = [
      fetchRecentRidesForPassenger(30)
        .then((r) => { if (!cancelled) setPassengerRides(r); })
        .catch(() => {}),
    ];
    if (isDriver) {
      fetches.push(
        fetchDriverRides(30)
          .then((r) => { if (!cancelled) setDriverRides(r); })
          .catch(() => {}),
      );
    }
    Promise.all(fetches).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isDriver]);

  const rides = activeTab === 'driver' ? driverRides : passengerRides;

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return `Today · ${time}`;
    if (d.toDateString() === yesterday.toDateString()) return `Yesterday · ${time}`;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${time}`;
  };

  const statusColor = (status: string) => {
    if (status === 'completed') return GREEN;
    if (status === 'cancelled') return '#aaa';
    return AMBER;
  };

  const statusLabel = (status: string) => {
    if (status === 'completed') return 'Completed';
    if (status === 'cancelled') return 'Cancelled';
    return status.replace('_', ' ');
  };

  const navMode = isDriver ? 'driver' : 'passenger';

  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <TopBar title="My Trips" onBack={() => navigate(isDriver ? 'DriverHome' : 'Home')} />
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {isDriver && (
            <View style={[s.tabRow, { marginBottom: 16 }]}>
              <TouchableOpacity
                style={activeTab === 'passenger' ? s.tabActive : s.tabInactive}
                onPress={() => { haptic.select(); setActiveTab('passenger'); }}
              >
                <Text style={activeTab === 'passenger' ? s.tabActiveText : s.tabInactiveText}>
                  As Passenger
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={activeTab === 'driver' ? s.tabActive : s.tabInactive}
                onPress={() => { haptic.select(); setActiveTab('driver'); }}
              >
                <Text style={activeTab === 'driver' ? s.tabActiveText : s.tabInactiveText}>
                  As Driver
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {loading ? (
            <><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
          ) : rides.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              <Ionicons name="car-outline" size={48} color="#ddd" />
              <Text style={[s.muted, { marginTop: 12, fontSize: 14 }]}>No trips yet.</Text>
            </View>
          ) : (
            rides.map((ride) => (
              <View key={ride.id} style={s.tripHistoryCard}>
                <View style={[s.rowBetween, { marginBottom: 8 }]}>
                  <Text style={[s.muted, { fontSize: 11 }]}>{fmtDate(ride.completed_at ?? ride.created_at)}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    {ride.payment_method && (
                      <View style={s.greenBadge}>
                        <Text style={s.greenBadgeText}>
                          {ride.payment_method === 'etransfer' ? '📱 E-transfer' : '💵 Cash'}
                        </Text>
                      </View>
                    )}
                    <View style={[s.greenBadge, { backgroundColor: statusColor(ride.status) + '22' }]}>
                      <Text style={[s.greenBadgeText, { color: statusColor(ride.status) }]}>
                        {statusLabel(ride.status)}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={s.routeTrack}>
                    <View style={[s.routeDot, { backgroundColor: GREEN }]} />
                    <View style={s.routeLine} />
                    <View style={[s.routeDot, { backgroundColor: RED }]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.tripHistoryAddr} numberOfLines={1}>{ride.pickup_address}</Text>
                    <View style={{ height: 10 }} />
                    <Text style={[s.tripHistoryAddr, { color: RED }]} numberOfLines={1}>{ride.destination_address}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                    <Text style={[s.tripPrice, { color: ride.status === 'completed' ? RED : '#aaa' }]}>
                      ${ride.offered_price.toFixed(2)}
                    </Text>
                    {ride.distance_mi != null && (
                      <Text style={s.muted}>{ride.distance_mi} mi</Text>
                    )}
                  </View>
                </View>

                {ride.scheduled_for && (
                  <View style={[s.rowBetween, { marginTop: 8, backgroundColor: '#FEF3C7', borderRadius: 6, padding: 6 }]}>
                    <Text style={[s.muted, { color: '#92400E', fontSize: 11 }]}>🗓 Scheduled</Text>
                    <Text style={[s.muted, { color: '#92400E', fontSize: 11 }]}>
                      {new Date(ride.scheduled_for).toLocaleString([], {
                        month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </Text>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
        <BottomNav active="Trips" navigate={navigate} mode={navMode} />
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── DRIVER EARNINGS ──────────────────────────────────────────
function DriverEarningsScreen({ navigate }: NavProp) {
  const {
    totalEarnedCents,
    totalCashCents,
    totalEtransferCents,
    tripsCompleted,
    tripsDisputed,
    earnings,
    loading,
  } = useDriverWallet();

  const fmt = (cents: number) =>
    `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return `Today · ${time}`;
    if (d.toDateString() === yesterday.toDateString()) return `Yesterday · ${time}`;
    return `${d.toLocaleDateString()} · ${time}`;
  };

  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <TopBar title="Earnings" onBack={() => navigate('Onboarding')} />
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Text style={s.muted}>Total earned (lifetime)</Text>
          <Text style={[s.bigTitle, { color: RED, fontSize: 34 }]}>{fmt(totalEarnedCents)}</Text>
          <Text style={[s.muted, { marginBottom: 8 }]}>Lifetime fares · paid directly to you</Text>
          <View style={s.greenBadge}>
            <Text style={s.greenBadgeText}>100% yours · $0 commission · no platform cut</Text>
          </View>

          <View style={[s.statRow, { marginTop: 16 }]}>
            <View style={s.statBox}>
              <Text style={s.statLabel}>💵 Cash</Text>
              <Text style={[s.statValue, { fontSize: 13 }]}>{fmt(totalCashCents)}</Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statLabel}>📱 E-transfer</Text>
              <Text style={[s.statValue, { fontSize: 13 }]}>{fmt(totalEtransferCents)}</Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statLabel}>Trips</Text>
              <Text style={s.statValue}>{tripsCompleted}</Text>
              {tripsDisputed > 0 && (
                <Text style={[s.muted, { color: AMBER }]}>{tripsDisputed} disputed</Text>
              )}
            </View>
          </View>

          <Text style={[s.sectionTitle, { marginTop: 4 }]}>Recent Trips</Text>
          {loading ? (
            <><SkeletonCard /><SkeletonCard /></>
          ) : earnings.length === 0 ? (
            <Text style={s.muted}>No trips recorded yet.</Text>
          ) : (
            earnings.map((e) => (
              <View key={e.id} style={s.tripRow}>
                <View style={{ width: 28, alignItems: 'center' }}>
                  <Text>{e.payment_method === 'etransfer' ? '📱' : '💵'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.driverName} numberOfLines={1}>{e.destination}</Text>
                  <Text style={s.muted}>{fmtTime(e.completed_at)}</Text>
                </View>
                <Text style={[s.tripPrice, { color: e.amount_cents > 0 ? RED : '#aaa' }]}>
                  {e.amount_cents > 0 ? fmt(e.amount_cents) : 'Disputed'}
                </Text>
              </View>
            ))
          )}

          <Text style={[s.muted, { textAlign: 'center', marginTop: 16, paddingHorizontal: 16 }]}>
            Payments are collected directly from passengers in cash or e-transfer.
          </Text>
        </ScrollView>
        <BottomNav active="Earnings" navigate={navigate} mode="driver" />
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── PROFILE ──────────────────────────────────────────────────
function ProfileScreen({ navigate }: NavProp) {
  const { profile, loading } = useMyProfile();
  const { documents: kycDocs } = useDriverDocuments();
  const { vehicle, isComplete: vehicleComplete } = useMyVehicle();
  const [email, setEmail] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  const kycApprovedCount = kycDocs.filter(
    (d) =>
      ['drivers_license', 'vehicle_registration', 'vehicle_insurance'].includes(
        d.document_type,
      ) && d.status === 'approved',
  ).length;

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setEmail(user.email);
    });
  }, []);

  const handleSignOut = async () => {
    try {
      setSigningOut(true);
      await supabase.auth.signOut();
      navigate('Onboarding');
    } catch (e) {
      console.warn('[ProfileScreen] signOut failed', e);
      setSigningOut(false);
    }
  };

  const startEditName = () => {
    setNameInput(profile?.full_name ?? '');
    setEditingName(true);
  };

  const saveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    try {
      setSavingName(true);
      await updateMyProfile({ full_name: trimmed });
    } catch (e) {
      Alert.alert('Error', 'Could not save name. Please try again.');
    } finally {
      setSavingName(false);
      setEditingName(false);
    }
  };

  const mode: 'passenger' | 'driver' = profile?.role === 'driver' ? 'driver' : 'passenger';

  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <TopBar title="Profile" onBack={() => navigate('Onboarding')} />
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {profile?.role === 'driver' || profile?.role === 'both' ? (
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <DriverAvatar
                driverId={profile.id}
                initials={getInitials(profile.full_name)}
                size={72}
              />
              <TouchableOpacity
                style={{ marginTop: 8 }}
                onPress={() => navigate('DriverVerification')}
              >
                <Text style={[s.muted, { color: RED, fontSize: 12 }]}>Edit photo →</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {loading ? (
            <SkeletonCard />
          ) : (
            <View style={s.card}>
              <View style={[s.rowBetween, { paddingVertical: 6, borderBottomWidth: 0.5, borderColor: '#eee' }]}>
                <Text style={s.muted}>Name</Text>
                {editingName ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end' }}>
                    <TextInput
                      value={nameInput}
                      onChangeText={setNameInput}
                      style={{ borderBottomWidth: 1, borderColor: RED, fontSize: 14, minWidth: 120, textAlign: 'right', paddingVertical: 2 }}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={saveName}
                    />
                    <TouchableOpacity onPress={saveName} disabled={savingName}>
                      {savingName ? <ActivityIndicator size="small" color={RED} /> : <Text style={{ color: RED, fontWeight: '600' }}>Save</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setEditingName(false)}>
                      <Text style={s.muted}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} onPress={startEditName}>
                    <Text style={s.driverName}>{profile?.full_name ?? '—'}</Text>
                    <Ionicons name="pencil" size={12} color="#aaa" />
                  </TouchableOpacity>
                )}
              </View>
              <View style={[s.rowBetween, { paddingVertical: 6, borderBottomWidth: 0.5, borderColor: '#eee' }]}>
                <Text style={s.muted}>Email</Text>
                <Text style={s.driverName}>{email || '—'}</Text>
              </View>
              <View style={[s.rowBetween, { paddingVertical: 6, borderBottomWidth: (profile?.role === 'driver' || profile?.role === 'both') ? 0.5 : 0, borderColor: '#eee' }]}>
                <Text style={s.muted}>Role</Text>
                <Text style={s.driverName}>{profile?.role ?? '—'}</Text>
              </View>
              {(profile?.role === 'driver' || profile?.role === 'both') && (
                <View style={[s.rowBetween, { paddingVertical: 6 }]}>
                  <Text style={s.muted}>Driver rating</Text>
                  <Text style={s.driverName}>
                    ⭐ {profile?.rating?.toFixed(1) ?? '—'} · {profile?.total_trips ?? 0} trips
                  </Text>
                </View>
              )}
            </View>
          )}
          {(profile?.role === 'driver' || profile?.role === 'both') && (
            <>
              <TouchableOpacity style={[s.outlineBtn, { marginTop: 8 }]} onPress={() => navigate('PostTrip')}>
                <Text style={s.outlineBtnText}>Post a trip</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.outlineBtn, { marginTop: 8 }]} onPress={() => navigate('MyPostedTrips')}>
                <Text style={s.outlineBtnText}>My posted trips</Text>
              </TouchableOpacity>
            </>
          )}
          {(profile?.role === 'passenger' || profile?.role === 'both') && (
            <>
              <TouchableOpacity style={[s.outlineBtn, { marginTop: 8 }]} onPress={() => navigate('BrowseTrips')}>
                <Text style={s.outlineBtnText}>Browse trips</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.outlineBtn, { marginTop: 8 }]} onPress={() => navigate('MyBookings')}>
                <Text style={s.outlineBtnText}>My bookings</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity style={s.outlineBtn} onPress={() => navigate('Onboarding')}>
            <Text style={s.outlineBtnText}>Switch role / back to role picker</Text>
          </TouchableOpacity>
          {(profile?.role === 'driver' || profile?.role === 'both') && (
            <TouchableOpacity
              style={[s.outlineBtn, { marginTop: 8 }]}
              onPress={() => navigate('VehicleProfile')}
            >
              <Text style={s.outlineBtnText}>Vehicle profile</Text>
              <Text style={[s.muted, { textAlign: 'center', marginTop: 2 }]}>
                {vehicleComplete && vehicle
                  ? `${vehicle.vehicle_make} ${vehicle.vehicle_model} ${vehicle.vehicle_year} — ${vehicle.vehicle_total_seats} seats`
                  : 'Add your car to start driving'}
              </Text>
            </TouchableOpacity>
          )}
          {(profile?.role === 'driver' || profile?.role === 'both') && (
            <TouchableOpacity
              style={[s.outlineBtn, { marginTop: 8 }]}
              onPress={() => navigate('DriverVerification')}
            >
              <Text style={s.outlineBtnText}>Verify identity</Text>
              <Text style={[s.muted, { textAlign: 'center', marginTop: 2 }]}>
                {kycApprovedCount} of 3 documents approved
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.redBtn, { opacity: signingOut ? 0.6 : 1, marginTop: 8 }]}
            onPress={handleSignOut}
            disabled={signingOut}
          >
            {signingOut
              ? <ActivityIndicator color="white" />
              : <Text style={s.redBtnText}>Sign out</Text>}
          </TouchableOpacity>
        </ScrollView>
        <BottomNav active="Profile" navigate={navigate} mode={mode} />
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── VEHICLE PROFILE ──────────────────────────────────────────
function VehicleProfileScreen({ navigate }: NavProp) {
  const { vehicle, loading, refresh } = useMyVehicle();
  const currentYear = new Date().getFullYear();

  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [plate, setPlate] = useState('');
  const [seats, setSeats] = useState('');
  const [saving, setSaving] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  // Prefill from existing vehicle on first load
  useEffect(() => {
    if (!loading && vehicle && !prefilled) {
      setMake(vehicle.vehicle_make ?? '');
      setModel(vehicle.vehicle_model ?? '');
      setYear(vehicle.vehicle_year ? String(vehicle.vehicle_year) : '');
      setColor(vehicle.vehicle_color ?? '');
      setPlate(vehicle.plate_number ?? '');
      setSeats(vehicle.vehicle_total_seats ? String(vehicle.vehicle_total_seats) : '');
      setPrefilled(true);
    }
  }, [loading, vehicle]);

  const yearNum = parseInt(year, 10);
  const seatsNum = parseInt(seats, 10);

  const yearValid = !isNaN(yearNum) && yearNum >= 1990 && yearNum <= currentYear + 1;
  const seatsValid = !isNaN(seatsNum) && seatsNum >= 1 && seatsNum <= 8;
  const canSave =
    make.trim() && model.trim() && year.trim() && color.trim() &&
    plate.trim() && seats.trim() && yearValid && seatsValid;

  const handleSave = async () => {
    if (!canSave || saving) return;
    try {
      setSaving(true);
      await saveMyVehicle({
        make, model, year: yearNum, color, plate, seats: seatsNum,
      });
      await refresh();
      haptic.notify(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Vehicle profile updated.', [
        { text: 'OK', onPress: () => navigate('Profile') },
      ]);
    } catch (e: any) {
      haptic.notify(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Could not save', e?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.screen}>
        <TopBar title="Vehicle profile" onBack={() => navigate('Profile')} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={RED} />
        </View>
      </SafeAreaView>
    );
  }

  const fields: { label: string; value: string; setter: (v: string) => void; placeholder: string; numeric?: boolean; hint?: string }[] = [
    { label: 'Make', value: make, setter: setMake, placeholder: 'e.g. Toyota' },
    { label: 'Model', value: model, setter: setModel, placeholder: 'e.g. Camry' },
    { label: 'Year', value: year, setter: setYear, placeholder: '2018', numeric: true, hint: yearValid || !year ? undefined : 'Enter a year between 1990 and ' + (currentYear + 1) },
    { label: 'Color', value: color, setter: setColor, placeholder: 'e.g. White' },
    { label: 'License plate', value: plate, setter: (v) => setPlate(v.toUpperCase()), placeholder: 'ABC 1234' },
    { label: 'Passenger seats', value: seats, setter: setSeats, placeholder: '4', numeric: true, hint: seatsValid || !seats ? undefined : 'Enter a number between 1 and 8' },
  ];

  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <TopBar title="Vehicle profile" onBack={() => navigate('Profile')} />
        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <Text style={[s.muted, { marginBottom: 16 }]}>
            Complete your vehicle info to go online and accept rides.
          </Text>

          {fields.map((f) => (
            <View key={f.label} style={s.vehicleFieldWrap}>
              <Text style={s.vehicleFieldLabel}>{f.label}</Text>
              <TextInput
                style={[s.vehicleFieldInput, f.hint ? { borderColor: AMBER } : undefined]}
                value={f.value}
                onChangeText={f.setter}
                placeholder={f.placeholder}
                placeholderTextColor="#aaa"
                keyboardType={f.numeric ? 'number-pad' : 'default'}
                autoCapitalize={f.numeric ? 'none' : 'words'}
              />
              {f.hint ? <Text style={[s.muted, { color: AMBER, marginTop: 2 }]}>{f.hint}</Text> : null}
            </View>
          ))}

          <TouchableOpacity
            style={[s.redBtn, { marginTop: 8, opacity: (!canSave || saving) ? 0.5 : 1 }]}
            onPress={handleSave}
            disabled={!canSave || saving}
          >
            {saving
              ? <ActivityIndicator color="white" />
              : <Text style={s.redBtnText}>Save Vehicle</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={[s.outlineBtn, { marginTop: 8 }]} onPress={() => navigate('Profile')}>
            <Text style={s.outlineBtnText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── DRIVER VERIFICATION ──────────────────────────────────────
function DriverVerificationScreen({ navigate }: NavProp) {
  const { documents, loading } = useDriverDocuments();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingType, setUploadingType] = useState<DocumentType | null>(null);

  const handleRowPress = (type: DocumentType) => {
    if (Platform.OS !== 'web') {
      Alert.alert('Coming soon', 'Mobile uploads coming soon.');
      return;
    }
    setUploadingType(type);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: any) => {
    const file: File | undefined = e.target.files?.[0];
    e.target.value = '';
    if (!file || !uploadingType) return;
    try {
      await uploadDocument(file, file.name, uploadingType);
    } catch (err: any) {
      const msg = err?.message ?? 'Upload failed. Try again.';
      if (Platform.OS === 'web' && typeof globalThis !== 'undefined' && (globalThis as any).alert) {
        (globalThis as any).alert(msg);
      } else {
        Alert.alert('Upload failed', msg);
      }
    } finally {
      setUploadingType(null);
    }
  };

  const requiredTypes: DocumentType[] = [
    'drivers_license',
    'vehicle_registration',
    'vehicle_insurance',
  ];
  const approvedCount = documents.filter(
    (d) => requiredTypes.includes(d.document_type) && d.status === 'approved',
  ).length;

  type DocRow = { type: DocumentType; label: string; icon: string };
  const docRows: DocRow[] = [
    { type: 'profile_photo', label: 'Profile Photo', icon: '👤' },
    { type: 'drivers_license', label: "Driver's License", icon: '🪪' },
    { type: 'vehicle_registration', label: 'Vehicle Registration', icon: '📋' },
    { type: 'vehicle_insurance', label: 'Vehicle Insurance', icon: '🛡️' },
  ];

  const getDoc = (type: DocumentType): DriverDocument | null =>
    documents.find((d) => d.document_type === type) ?? null;

  const renderBadge = (doc: DriverDocument | null) => {
    if (!doc)
      return (
        <View style={s.kycBadgeGray}>
          <Text style={s.kycBadgeTextGray}>Upload</Text>
        </View>
      );
    if (doc.status === 'pending')
      return (
        <View style={s.kycBadgePending}>
          <Text style={s.kycBadgeTextPending}>PENDING</Text>
        </View>
      );
    if (doc.status === 'approved')
      return (
        <View style={s.kycBadgeApproved}>
          <Text style={s.kycBadgeTextApproved}>APPROVED</Text>
        </View>
      );
    return (
      <View style={s.kycBadgeRejected}>
        <Text style={s.kycBadgeTextRejected}>REJECTED</Text>
      </View>
    );
  };

  const renderSubtitle = (doc: DriverDocument | null) => {
    if (!doc) return <Text style={s.muted}>Not uploaded</Text>;
    if (doc.status === 'pending') return <Text style={s.muted}>Awaiting review</Text>;
    if (doc.status === 'approved')
      return <Text style={[s.muted, { color: GREEN }]}>Verified ✓</Text>;
    return (
      <Text style={[s.muted, { color: RED }]} numberOfLines={2}>
        Rejected: {doc.rejection_reason}
      </Text>
    );
  };

  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <TopBar title="Verification" onBack={() => navigate('Profile')} />
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={[s.pricingCard, { marginBottom: 16 }]}>
            <Text style={s.pricingTitle}>Verification Status</Text>
            <Text style={s.pricingSub}>{approvedCount} of 3 documents approved</Text>
            <View style={s.kycProgressTrack}>
              {approvedCount > 0 && (
                <View style={[s.kycProgressFill, { flex: approvedCount }]} />
              )}
              {approvedCount < 3 && <View style={{ flex: 3 - approvedCount }} />}
            </View>
          </View>

          {loading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : (
            docRows.map(({ type, label, icon }) => {
              const doc = getDoc(type);
              const isUploading = uploadingType === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={s.kycDocRow}
                  onPress={() => handleRowPress(type)}
                  disabled={isUploading}
                >
                  <View style={s.kycDocIcon}>
                    <Text style={{ fontSize: 20 }}>{icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.driverName}>{label}</Text>
                    {renderSubtitle(doc)}
                  </View>
                  {isUploading ? <ActivityIndicator color={RED} /> : renderBadge(doc)}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
        {Platform.OS === 'web' && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            style={{ display: 'none' }}
            onChange={handleFileSelected}
          />
        )}
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── SCHEDULED RIDE REMINDER ──────────────────────────────────
// ─── TRIP MARKETPLACE HELPERS ────────────────────────────────

function fmtDeparture(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffH = diffMs / 3_600_000;
  if (diffH < 0) return 'Departed';
  if (diffH < 24) {
    const h = Math.floor(diffH);
    const m = Math.round((diffH - h) * 60);
    return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function shortCity(addr: string): string {
  return addr.split(',')[0] ?? addr;
}

// ─── TRIP ROW ─────────────────────────────────────────────────
function TripRow({ trip, onPress, showDriver }: { trip: Trip; onPress: () => void; showDriver?: boolean }) {
  const { profile: driver } = useUserProfile(showDriver ? trip.driver_id : null);
  const pct = trip.seats_total > 0 ? (trip.seats_available / trip.seats_total) : 1;
  return (
    <TouchableOpacity style={s.marketplaceRow} onPress={onPress} activeOpacity={0.75}>
      <View style={{ flex: 1 }}>
        <View style={s.rowBetween}>
          <Text style={s.tripName} numberOfLines={1}>
            {shortCity(trip.origin_address)} → {shortCity(trip.destination_address)}
          </Text>
          <Text style={[s.tripPrice, { color: RED }]}>${Number(trip.price_per_seat).toFixed(2)}/seat</Text>
        </View>
        <Text style={s.tripSub}>{fmtDeparture(trip.departure_at)}</Text>
        {showDriver && driver && (
          <Text style={[s.tripSub, { marginTop: 2 }]}>Driver: {driver.full_name ?? '—'}</Text>
        )}
        <View style={s.seatBar}>
          <View style={[s.seatBarFill, { width: `${Math.round(pct * 100)}%` as any }]} />
        </View>
        <Text style={s.tripSub}>{trip.seats_available} of {trip.seats_total} seats left</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── BOOKING ROW ──────────────────────────────────────────────
function BookingRow({ booking, onPress }: { booking: TripBooking; onPress: () => void }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  useEffect(() => {
    fetchTripById(booking.trip_id).then(setTrip).catch(() => {});
  }, [booking.trip_id]);
  return (
    <TouchableOpacity style={s.marketplaceRow} onPress={onPress} activeOpacity={0.75}>
      <View style={{ flex: 1 }}>
        <View style={s.rowBetween}>
          <Text style={s.tripName} numberOfLines={1}>
            {trip ? `${shortCity(trip.origin_address)} → ${shortCity(trip.destination_address)}` : '…'}
          </Text>
          <Text style={[s.tripPrice, { color: booking.status === 'cancelled' ? '#aaa' : RED }]}>
            ${Number(booking.total_price).toFixed(2)}
          </Text>
        </View>
        <Text style={s.tripSub}>
          {booking.seats_booked} seat{booking.seats_booked > 1 ? 's' : ''}
          {trip ? ` · ${fmtDeparture(trip.departure_at)}` : ''}
        </Text>
        <View style={{ marginTop: 4 }}>
          <Text style={[s.tripSub, { color: booking.status === 'confirmed' ? GREEN : '#aaa', fontWeight: '600' }]}>
            {booking.status === 'confirmed' ? '✓ Confirmed' : '✗ Cancelled'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── POST TRIP SCREEN ─────────────────────────────────────────
function PostTripScreen({ navigate }: NavProp) {
  const { showBanner } = useBanner();
  const { profile } = useMyProfile();
  const { vehicle, isComplete: vehicleComplete } = useMyVehicle();

  const [originAddress, setOriginAddress] = useState('');
  const [originSuggestions, setOriginSuggestions] = useState<PlacePrediction[]>([]);
  const [originCoords, setOriginCoords] = useState<LatLng | null>(null);

  const [destAddress, setDestAddress] = useState('');
  const [destSuggestions, setDestSuggestions] = useState<PlacePrediction[]>([]);
  const [destCoords, setDestCoords] = useState<LatLng | null>(null);

  const [departure, setDeparture] = useState<Date>(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  });
  const [showPicker, setShowPicker] = useState(false);
  const [seats, setSeats] = useState('2');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isDriver = profile?.role === 'driver' || profile?.role === 'both';

  const searchOrigin = async (text: string) => {
    setOriginAddress(text);
    setOriginCoords(null);
    if (text.length < 3) { setOriginSuggestions([]); return; }
    try { setOriginSuggestions(await searchPlaces(text)); } catch {}
  };

  const pickOrigin = async (p: PlacePrediction) => {
    setOriginAddress(p.description);
    setOriginSuggestions([]);
    try {
      const coords = await geocodePlace(p.place_id);
      setOriginCoords(coords);
    } catch {}
  };

  const searchDest = async (text: string) => {
    setDestAddress(text);
    setDestCoords(null);
    if (text.length < 3) { setDestSuggestions([]); return; }
    try { setDestSuggestions(await searchPlaces(text)); } catch {}
  };

  const pickDest = async (p: PlacePrediction) => {
    setDestAddress(p.description);
    setDestSuggestions([]);
    try {
      const coords = await geocodePlace(p.place_id);
      setDestCoords(coords);
    } catch {}
  };

  const submit = async () => {
    if (!isDriver) {
      Alert.alert('Drivers only', 'Only drivers can post trips.');
      return;
    }
    if (!vehicleComplete) {
      Alert.alert('Vehicle required', 'Complete your vehicle profile before posting a trip.');
      return;
    }
    if (!originCoords || !originAddress) {
      Alert.alert('Origin required', 'Select a pickup location.');
      return;
    }
    if (!destCoords || !destAddress) {
      Alert.alert('Destination required', 'Select a destination.');
      return;
    }
    const seatsNum = parseInt(seats, 10);
    if (!seatsNum || seatsNum < 1 || seatsNum > 8) {
      Alert.alert('Invalid seats', 'Enter a number of seats between 1 and 8.');
      return;
    }
    const priceNum = parseFloat(price);
    if (!priceNum || priceNum <= 0) {
      Alert.alert('Invalid price', 'Enter a price per seat.');
      return;
    }
    if (departure.getTime() < Date.now()) {
      Alert.alert('Invalid time', 'Departure must be in the future.');
      return;
    }
    try {
      setSubmitting(true);
      const input: PostTripInput = {
        origin_address: originAddress,
        origin_lat: originCoords.lat,
        origin_lng: originCoords.lng,
        destination_address: destAddress,
        destination_lat: destCoords.lat,
        destination_lng: destCoords.lng,
        departure_at: departure.toISOString(),
        seats_total: seatsNum,
        price_per_seat: priceNum,
        description: description.trim() || undefined,
      };
      await postTrip(input);
      showBanner('Trip posted!', 'success');
      navigate('MyPostedTrips');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not post trip.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isDriver) {
    return (
      <ScreenTransition>
        <SafeAreaView style={s.screen}>
          <TopBar title="Post a Trip" onBack={() => navigate('Profile')} />
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ fontSize: 15, color: '#555', textAlign: 'center' }}>Only drivers can post trips.</Text>
          </View>
        </SafeAreaView>
      </ScreenTransition>
    );
  }

  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <TopBar title="Post a Trip" onBack={() => navigate('Profile')} />
        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          {!vehicleComplete && (
            <TouchableOpacity
              style={[s.vehicleBanner, { marginBottom: 16 }]}
              onPress={() => navigate('VehicleProfile')}
            >
              <Text style={s.vehicleBannerText}>Complete your vehicle profile to post trips.</Text>
              <View style={s.vehicleBannerBtn}>
                <Text style={s.vehicleBannerBtnText}>Add vehicle →</Text>
              </View>
            </TouchableOpacity>
          )}

          <Text style={s.fieldLabel}>PICKUP LOCATION</Text>
          <TextInput
            style={s.fieldInput}
            placeholder="City or address"
            placeholderTextColor="#aaa"
            value={originAddress}
            onChangeText={searchOrigin}
          />
          {originSuggestions.length > 0 && (
            <View style={s.suggestBox}>
              {originSuggestions.slice(0, 4).map((p) => (
                <TouchableOpacity key={p.place_id} style={s.suggestRow} onPress={() => pickOrigin(p)}>
                  <Text style={s.suggestText} numberOfLines={1}>{p.description}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={[s.fieldLabel, { marginTop: 14 }]}>DESTINATION</Text>
          <TextInput
            style={s.fieldInput}
            placeholder="City or address"
            placeholderTextColor="#aaa"
            value={destAddress}
            onChangeText={searchDest}
          />
          {destSuggestions.length > 0 && (
            <View style={s.suggestBox}>
              {destSuggestions.slice(0, 4).map((p) => (
                <TouchableOpacity key={p.place_id} style={s.suggestRow} onPress={() => pickDest(p)}>
                  <Text style={s.suggestText} numberOfLines={1}>{p.description}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={[s.fieldLabel, { marginTop: 14 }]}>DEPARTURE TIME</Text>
          <TouchableOpacity style={s.fieldInput} onPress={() => setShowPicker(true)}>
            <Text style={{ fontSize: 14, color: '#111' }}>
              {departure.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </Text>
          </TouchableOpacity>
          {showPicker && (
            <DateTimePicker
              value={departure}
              mode="datetime"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              minimumDate={new Date()}
              onChange={(_e, d) => { setShowPicker(false); if (d) setDeparture(d); }}
            />
          )}

          <Text style={[s.fieldLabel, { marginTop: 14 }]}>SEATS AVAILABLE</Text>
          <TextInput
            style={s.fieldInput}
            placeholder="1–8"
            placeholderTextColor="#aaa"
            value={seats}
            onChangeText={setSeats}
            keyboardType="number-pad"
            maxLength={1}
          />

          <Text style={[s.fieldLabel, { marginTop: 14 }]}>PRICE PER SEAT ($)</Text>
          <TextInput
            style={s.fieldInput}
            placeholder="e.g. 25.00"
            placeholderTextColor="#aaa"
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
          />

          <Text style={[s.fieldLabel, { marginTop: 14 }]}>DESCRIPTION (optional)</Text>
          <TextInput
            style={[s.fieldInput, { minHeight: 70, textAlignVertical: 'top' }]}
            placeholder="Luggage space, stops, notes…"
            placeholderTextColor="#aaa"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={280}
          />

          <TouchableOpacity
            style={[s.redBtn, { marginTop: 20, opacity: submitting ? 0.6 : 1 }]}
            onPress={submit}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator color="white" /> : <Text style={s.redBtnText}>Post Trip</Text>}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── BROWSE TRIPS SCREEN ──────────────────────────────────────
function BrowseTripsScreen({ navigate }: NavProp) {
  const { setSelectedTripId, searchOriginCoords, searchDestinationCoords } = useContext(RideContext);
  const { trips: allTrips, loading } = useAvailableTrips();
  const [matchedTrips, setMatchedTrips] = useState<MatchedTrip[]>([]);
  const [filtering, setFiltering] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const hasGeoFilter = !!(searchOriginCoords && searchDestinationCoords) && !showAll;

  useEffect(() => {
    if (!searchOriginCoords || !searchDestinationCoords) { setMatchedTrips([]); return; }
    setFiltering(true);
    findMatchingTrips({
      pickupLat: searchOriginCoords.lat,
      pickupLng: searchOriginCoords.lng,
      destinationLat: searchDestinationCoords.lat,
      destinationLng: searchDestinationCoords.lng,
    }).then((r) => { setMatchedTrips(r); setFiltering(false); }).catch(() => setFiltering(false));
  }, [searchOriginCoords?.lat, searchOriginCoords?.lng, searchDestinationCoords?.lat, searchDestinationCoords?.lng]);

  const displayTrips = hasGeoFilter ? matchedTrips : allTrips;
  const isLoading = loading || filtering;

  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <TopBar title="Browse Trips" onBack={() => navigate('Profile')} />
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {hasGeoFilter && (
            <View style={[s.matchBanner, { marginBottom: 12 }]}>
              <Text style={s.matchBannerTitle}>Showing trips near your route</Text>
              <Text style={s.matchBannerBody}>
                {matchedTrips.length} match{matchedTrips.length !== 1 ? 'es' : ''} within 5 miles of your pickup and drop-off
              </Text>
            </View>
          )}
          {isLoading ? (
            <><SkeletonCard /><SkeletonCard /></>
          ) : displayTrips.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 40 }}>
              <Text style={{ fontSize: 15, color: '#aaa' }}>
                {hasGeoFilter ? 'No trips match your route.' : 'No trips available right now.'}
              </Text>
              {hasGeoFilter && (
                <TouchableOpacity style={[s.outlineBtn, { marginTop: 12 }]} onPress={() => setShowAll(true)}>
                  <Text style={s.outlineBtnText}>Show all trips</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            displayTrips.map((t) => (
              <TripRow
                key={t.id}
                trip={t}
                showDriver
                onPress={() => {
                  setSelectedTripId(t.id);
                  navigate('TripDetails');
                }}
              />
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── TRIP DETAILS SCREEN ──────────────────────────────────────
function TripDetailsScreen({ navigate }: NavProp) {
  const { showBanner } = useBanner();
  const { selectedTripId } = useContext(RideContext);
  const { profile: myProfile } = useMyProfile();
  const { bookings } = useTripBookings(selectedTripId);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [loadingTrip, setLoadingTrip] = useState(true);
  const [seats, setSeats] = useState('1');
  const [payMethod, setPayMethod] = useState<'cash' | 'card'>('cash');
  const [note, setNote] = useState('');
  const [booking, setBooking] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!selectedTripId) { setLoadingTrip(false); return; }
    fetchTripById(selectedTripId).then((t) => { setTrip(t); setLoadingTrip(false); }).catch(() => setLoadingTrip(false));
  }, [selectedTripId]);

  const isMyTrip = !!(myProfile && trip && myProfile.id === trip.driver_id);
  const myConfirmedBooking = bookings.find(
    (b) => b.passenger_id === myProfile?.id && b.status === 'confirmed',
  );

  const handleBook = async () => {
    if (!trip || !selectedTripId) return;
    const seatsNum = parseInt(seats, 10);
    if (!seatsNum || seatsNum < 1) { Alert.alert('Invalid', 'Enter number of seats.'); return; }
    if (seatsNum > trip.seats_available) { Alert.alert('Not enough seats', `Only ${trip.seats_available} left.`); return; }
    try {
      setBooking(true);
      await bookSeats({
        tripId: selectedTripId,
        seats: seatsNum,
        pricePerSeat: Number(trip.price_per_seat),
        paymentMethod: payMethod,
        note: note.trim() || undefined,
      });
      showBanner('Seats booked!', 'success');
      navigate('MyBookings');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not book seats.');
    } finally {
      setBooking(false);
    }
  };

  const handleCancelTrip = async () => {
    if (!selectedTripId) return;
    Alert.alert('Cancel trip?', 'This will cancel the trip and notify passengers.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel trip', style: 'destructive', onPress: async () => {
          try {
            setCancelling(true);
            await cancelTrip(selectedTripId);
            showBanner('Trip cancelled', 'info');
            navigate('MyPostedTrips');
          } catch (e: any) {
            Alert.alert('Error', e.message ?? 'Could not cancel.');
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  const handleCancelBooking = async () => {
    if (!myConfirmedBooking) return;
    Alert.alert('Cancel booking?', 'Your seats will be released.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel', style: 'destructive', onPress: async () => {
          try {
            setCancelling(true);
            await cancelBooking(myConfirmedBooking.id);
            showBanner('Booking cancelled', 'info');
            navigate('MyBookings');
          } catch (e: any) {
            Alert.alert('Error', e.message ?? 'Could not cancel.');
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  if (loadingTrip) {
    return (
      <ScreenTransition>
        <SafeAreaView style={s.screen}>
          <TopBar title="Trip Details" onBack={() => navigate('BrowseTrips')} />
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={RED} />
          </View>
        </SafeAreaView>
      </ScreenTransition>
    );
  }

  if (!trip) {
    return (
      <ScreenTransition>
        <SafeAreaView style={s.screen}>
          <TopBar title="Trip Details" onBack={() => navigate('BrowseTrips')} />
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#aaa' }}>Trip not found.</Text>
          </View>
        </SafeAreaView>
      </ScreenTransition>
    );
  }

  const backScreen: ScreenName = isMyTrip ? 'MyPostedTrips' : 'BrowseTrips';

  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <TopBar title="Trip Details" onBack={() => navigate(backScreen)} />
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={s.card}>
            <Text style={[s.fieldLabel, { marginBottom: 4 }]}>ROUTE</Text>
            <Text style={s.tripName}>{trip.origin_address}</Text>
            <Text style={[s.muted, { marginTop: 2 }]}>→ {trip.destination_address}</Text>
          </View>

          <View style={[s.rowBetween, { marginBottom: 12 }]}>
            <View style={[s.card, { flex: 1, marginRight: 6, marginBottom: 0 }]}>
              <Text style={s.fieldLabel}>DEPARTURE</Text>
              <Text style={s.cardValue}>{fmtDeparture(trip.departure_at)}</Text>
            </View>
            <View style={[s.card, { flex: 1, marginLeft: 6, marginBottom: 0 }]}>
              <Text style={s.fieldLabel}>PRICE/SEAT</Text>
              <Text style={[s.cardValue, { color: RED }]}>${Number(trip.price_per_seat).toFixed(2)}</Text>
            </View>
          </View>

          <View style={[s.rowBetween, { marginBottom: 12 }]}>
            <View style={[s.card, { flex: 1, marginRight: 6, marginBottom: 0 }]}>
              <Text style={s.fieldLabel}>SEATS LEFT</Text>
              <Text style={s.cardValue}>{trip.seats_available} / {trip.seats_total}</Text>
            </View>
            <View style={[s.card, { flex: 1, marginLeft: 6, marginBottom: 0 }]}>
              <Text style={s.fieldLabel}>STATUS</Text>
              <Text style={[s.cardValue, { color: trip.status === 'active' ? GREEN : '#aaa' }]}>{trip.status}</Text>
            </View>
          </View>

          {trip.description ? (
            <View style={[s.card, { marginBottom: 12 }]}>
              <Text style={s.fieldLabel}>NOTES FROM DRIVER</Text>
              <Text style={{ fontSize: 13, color: '#333', marginTop: 4 }}>{trip.description}</Text>
            </View>
          ) : null}

          {/* Driver view: list bookings + cancel trip */}
          {isMyTrip && (
            <>
              <Text style={[s.sectionTitle, { marginTop: 8 }]}>Passenger Bookings ({bookings.filter(b => b.status === 'confirmed').length})</Text>
              {bookings.length === 0 ? (
                <Text style={s.muted}>No bookings yet.</Text>
              ) : (
                bookings.map((b) => (
                  <View key={b.id} style={[s.card, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                    <View>
                      <Text style={s.tripName}>{b.seats_booked} seat{b.seats_booked > 1 ? 's' : ''}</Text>
                      <Text style={s.tripSub}>${Number(b.total_price).toFixed(2)} · {b.payment_method}</Text>
                      {b.passenger_note ? (
                        <Text style={[s.tripSub, { color: AMBER, marginTop: 2 }]}>"{b.passenger_note}"</Text>
                      ) : null}
                    </View>
                    <Text style={[s.tripSub, { color: b.status === 'confirmed' ? GREEN : '#aaa', fontWeight: '600' }]}>
                      {b.status === 'confirmed' ? '✓' : '✗'}
                    </Text>
                  </View>
                ))
              )}
              {trip.status === 'active' && (
                <TouchableOpacity
                  style={[s.outlineBtn, { borderColor: '#c0392b', marginTop: 16, opacity: cancelling ? 0.6 : 1 }]}
                  onPress={handleCancelTrip}
                  disabled={cancelling}
                >
                  {cancelling ? <ActivityIndicator color="#c0392b" /> : <Text style={[s.outlineBtnText, { color: '#c0392b' }]}>Cancel Trip</Text>}
                </TouchableOpacity>
              )}
            </>
          )}

          {/* Passenger view: book or cancel booking */}
          {!isMyTrip && trip.status === 'active' && (
            <>
              {myConfirmedBooking ? (
                <View style={[s.card, { borderColor: GREEN, borderWidth: 1 }]}>
                  <Text style={[s.fieldLabel, { color: GREEN }]}>YOUR BOOKING</Text>
                  <Text style={s.tripName}>{myConfirmedBooking.seats_booked} seat{myConfirmedBooking.seats_booked > 1 ? 's' : ''} · ${Number(myConfirmedBooking.total_price).toFixed(2)}</Text>
                  <TouchableOpacity
                    style={[s.outlineBtn, { borderColor: '#c0392b', marginTop: 12, opacity: cancelling ? 0.6 : 1 }]}
                    onPress={handleCancelBooking}
                    disabled={cancelling}
                  >
                    {cancelling ? <ActivityIndicator color="#c0392b" /> : <Text style={[s.outlineBtnText, { color: '#c0392b' }]}>Cancel Booking</Text>}
                  </TouchableOpacity>
                </View>
              ) : trip.seats_available > 0 ? (
                <View style={s.card}>
                  <Text style={s.fieldLabel}>BOOK SEATS</Text>
                  <View style={s.rowBetween}>
                    <Text style={{ fontSize: 13, color: '#555' }}>Number of seats</Text>
                    <TextInput
                      style={[s.fieldInput, { width: 60, textAlign: 'center', paddingVertical: 6 }]}
                      value={seats}
                      onChangeText={setSeats}
                      keyboardType="number-pad"
                      maxLength={1}
                    />
                  </View>
                  <Text style={[s.fieldLabel, { marginTop: 12 }]}>PAYMENT</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                    {(['cash', 'card'] as const).map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[s.tabInactive, { flex: 1, borderColor: payMethod === m ? RED : '#ddd', backgroundColor: payMethod === m ? '#fff0f0' : 'white' }]}
                        onPress={() => setPayMethod(m)}
                      >
                        <Text style={[s.tabInactiveText, { color: payMethod === m ? RED : '#555' }]}>{m === 'cash' ? '💵 Cash' : '💳 Card'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={s.fieldLabel}>NOTE (optional)</Text>
                  <TextInput
                    style={[s.fieldInput, { minHeight: 50, textAlignVertical: 'top' }]}
                    placeholder="Any notes for the driver…"
                    placeholderTextColor="#aaa"
                    value={note}
                    onChangeText={setNote}
                    multiline
                    maxLength={280}
                  />
                  <Text style={[s.muted, { textAlign: 'right' }]}>
                    Total: ${(parseInt(seats || '0', 10) * Number(trip.price_per_seat)).toFixed(2)}
                  </Text>
                  <TouchableOpacity
                    style={[s.redBtn, { marginTop: 12, opacity: booking ? 0.6 : 1 }]}
                    onPress={handleBook}
                    disabled={booking}
                  >
                    {booking ? <ActivityIndicator color="white" /> : <Text style={s.redBtnText}>Confirm Booking</Text>}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[s.card, { alignItems: 'center' }]}>
                  <Text style={{ color: '#aaa', fontSize: 13 }}>This trip is fully booked.</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── MY POSTED TRIPS SCREEN ───────────────────────────────────
function MyPostedTripsScreen({ navigate }: NavProp) {
  const { setSelectedTripId } = useContext(RideContext);
  const { trips, loading } = useMyPostedTrips();

  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <TopBar title="My Posted Trips" onBack={() => navigate('Profile')} />
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <TouchableOpacity style={[s.redBtn, { marginBottom: 16 }]} onPress={() => navigate('PostTrip')}>
            <Text style={s.redBtnText}>+ Post New Trip</Text>
          </TouchableOpacity>
          {loading ? (
            <><SkeletonCard /><SkeletonCard /></>
          ) : trips.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 32 }}>
              <Text style={{ fontSize: 15, color: '#aaa' }}>No trips posted yet.</Text>
            </View>
          ) : (
            trips.map((t) => (
              <TripRow
                key={t.id}
                trip={t}
                onPress={() => {
                  setSelectedTripId(t.id);
                  navigate('TripDetails');
                }}
              />
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── MY BOOKINGS SCREEN ───────────────────────────────────────
function MyBookingsScreen({ navigate }: NavProp) {
  const { setSelectedTripId } = useContext(RideContext);
  const { bookings, loading } = useMyBookings();

  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <TopBar title="My Bookings" onBack={() => navigate('Profile')} />
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {loading ? (
            <><SkeletonCard /><SkeletonCard /></>
          ) : bookings.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 40 }}>
              <Text style={{ fontSize: 15, color: '#aaa' }}>No bookings yet.</Text>
              <TouchableOpacity style={[s.outlineBtn, { marginTop: 12 }]} onPress={() => navigate('BrowseTrips')}>
                <Text style={s.outlineBtnText}>Browse trips</Text>
              </TouchableOpacity>
            </View>
          ) : (
            bookings.map((b) => (
              <BookingRow
                key={b.id}
                booking={b}
                onPress={() => {
                  setSelectedTripId(b.trip_id);
                  navigate('TripDetails');
                }}
              />
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </ScreenTransition>
  );
}

function ScheduledRideReminderSidecar() {
  const { showBanner } = useBanner();
  const alertedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const check = async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return;
        const now = new Date();
        const soon = new Date(now.getTime() + 30 * 60_000);
        const { data } = await supabase
          .from('rides')
          .select('id, scheduled_for, destination_address')
          .eq('passenger_id', u.user.id)
          .eq('status', 'matching')
          .gte('scheduled_for', now.toISOString())
          .lte('scheduled_for', soon.toISOString());
        (data ?? []).forEach((ride: any) => {
          if (!alertedRef.current.has(ride.id)) {
            alertedRef.current.add(ride.id);
            const min = Math.round(
              (new Date(ride.scheduled_for).getTime() - now.getTime()) / 60_000,
            );
            showBanner(
              `Scheduled ride to ${ride.destination_address.split(',')[0]} in ${min} min`,
              'warning',
              6000,
            );
          }
        });
      } catch {}
    };
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [showBanner]);

  return null;
}

// ─── ROUTER ───────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [screen, setScreen] = useState<ScreenName>('Onboarding');
  const [rideId, setRideId] = useState<string | null>(null);
  const [initialRouteDone, setInitialRouteDone] = useState(false);
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null);
  const [chosenBid, setChosenBid] = useState<RideBid | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [searchOriginCoords, setSearchOriginCoords] = useState<LatLng | null>(null);
  const [searchDestinationCoords, setSearchDestinationCoords] = useState<LatLng | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setAuthChecked(true);
      // Auto-route returning users to their home screen
      if (s && !initialRouteDone) {
        setInitialRouteDone(true);
        (async () => {
          try {
            const { data } = await supabase.from('profiles').select('role').eq('id', s.user.id).maybeSingle();
            const role = (data as { role: string } | null)?.role;
            if (role === 'driver') setScreen('DriverHome');
            else if (role === 'passenger') setScreen('Home');
          } catch { /* stay on Onboarding */ }
        })();
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setAuthChecked(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const navigate = (s: ScreenName) => setScreen(s);

  const screens: Record<ScreenName, React.ReactElement> = {
    Onboarding: <OnboardingScreen navigate={navigate} />,
    Home: <HomeScreen navigate={navigate} />,
    Book: <BookScreen navigate={navigate} />,
    Schedule: <ScheduleScreen navigate={navigate} />,
    Matching: <MatchingScreen navigate={navigate} />,
    Drivers: <DriversScreen navigate={navigate} />,
    Confirmed: <ConfirmedScreen navigate={navigate} />,
    DriverHome: <DriverHomeScreen navigate={navigate} />,
    DriverRequest: <DriverRequestScreen navigate={navigate} />,
    DriverActive: <DriverActiveScreen navigate={navigate} />,
    DriverComplete: <DriverCompleteScreen navigate={navigate} />,
    DriverEarnings: <DriverEarningsScreen navigate={navigate} />,
    Auth: <AuthScreen onSignedIn={() => navigate('Onboarding')} />,
    Profile: <ProfileScreen navigate={navigate} />,
    DriverVerification: <DriverVerificationScreen navigate={navigate} />,
    Trips: <TripsScreen navigate={navigate} />,
    Chat: <ChatScreen navigate={navigate} />,
    RateTrip: <RateTripScreen navigate={navigate} />,
    VehicleProfile: <VehicleProfileScreen navigate={navigate} />,
    PostTrip: <PostTripScreen navigate={navigate} />,
    BrowseTrips: <BrowseTripsScreen navigate={navigate} />,
    TripDetails: <TripDetailsScreen navigate={navigate} />,
    MyPostedTrips: <MyPostedTripsScreen navigate={navigate} />,
    MyBookings: <MyBookingsScreen navigate={navigate} />,
  };

  if (!authChecked) {
    return (
      <View style={{ flex: 1, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="white" size="large" />
      </View>
    );
  }

  if (!session) {
    return <AuthScreen onSignedIn={() => navigate('Onboarding')} />;
  }

  return (
    <BannerHost>
      <ScheduledRideReminderSidecar />
      <RideContext.Provider
        value={{ rideId, setRideId, selectedRide, setSelectedRide, chosenBid, setChosenBid, currentScreen: screen, selectedTripId, setSelectedTripId, searchOriginCoords, setSearchOriginCoords, searchDestinationCoords, setSearchDestinationCoords }}
      >
        {screens[screen] ?? screens['Onboarding']}
      </RideContext.Provider>
    </BannerHost>
  );
}

// ─── STYLES ───────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  logoLarge: { fontSize: 48, fontWeight: '700', color: 'white', letterSpacing: 6 },
  logo: { fontSize: 16, fontWeight: '600', color: 'white', letterSpacing: 2 },
  heroTitle: { fontSize: 26, fontWeight: '700', color: 'white', textAlign: 'center', marginTop: 8, lineHeight: 34 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  signInText: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 16 },
  greeting: { fontSize: 13, color: '#888', marginBottom: 2 },
  bigTitle: { fontSize: 22, fontWeight: '600', marginBottom: 12 },
  muted: { fontSize: 12, color: '#888', marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '600', marginVertical: 10 },
  seeAll: { fontSize: 12, color: RED },
  backBtn: { color: 'white', fontSize: 14 },
  switchRoleText: { color: 'rgba(255,255,255,0.8)', fontSize: 11, textAlign: 'right', width: 60 },
  submitHelper: { textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 6 },
  whiteCard: { backgroundColor: 'white', borderRadius: 12, padding: 16 },
  ghostCard: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 16, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.25)' },
  roleTitle: { fontSize: 15, fontWeight: '600', color: RED },
  roleTitle2: { fontSize: 15, fontWeight: '600', color: 'white' },
  roleSub: { fontSize: 12, color: '#666', marginTop: 4 },
  roleSub2: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  topBar: { backgroundColor: RED, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  avatarSmall: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.25)' },
  bottomNav: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: '#eee', backgroundColor: 'white' },
  navItem: { alignItems: 'center', gap: 3 },
  navDot: { width: 20, height: 20, borderRadius: 4, backgroundColor: '#ddd' },
  navDotActive: { backgroundColor: RED },
  navLabel: { fontSize: 10, color: '#888' },
  searchBar: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 0.5, borderColor: '#ddd', flexDirection: 'row', alignItems: 'center' },
  searchPlaceholder: { color: '#aaa', fontSize: 14 },
  destInput: { fontSize: 14, color: '#111', paddingVertical: 4 },
  suggestBox: { backgroundColor: 'white', borderRadius: 8, borderWidth: 0.5, borderColor: '#ddd', marginTop: 4, overflow: 'hidden' },
  suggestRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  suggestText: { fontSize: 13, color: '#333' },
  redBtn: { backgroundColor: RED, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 6 },
  redBtnText: { color: 'white', fontSize: 14, fontWeight: '600' },
  outlineBtn: { borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 8, borderWidth: 1.5, borderColor: RED },
  outlineBtnText: { color: RED, fontSize: 13, fontWeight: '600' },
  ghostBtn: { backgroundColor: 'transparent', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  ghostBtnText: { color: 'white', fontSize: 13, fontWeight: '600' },
  card: { backgroundColor: '#fafafa', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 0.5, borderColor: '#eee' },
  cardLabel: { fontSize: 10, color: '#999', letterSpacing: 1, marginBottom: 3 },
  cardValue: { fontSize: 14, fontWeight: '500' },
  divider: { height: 0.5, backgroundColor: '#eee', marginVertical: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statBox: { flex: 1, backgroundColor: '#f5f5f5', borderRadius: 10, padding: 10, alignItems: 'center' },
  statLabel: { fontSize: 10, color: '#999' },
  statValue: { fontSize: 15, fontWeight: '600', marginTop: 2 },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tabActive: { flex: 1, backgroundColor: RED, padding: 10, borderRadius: 10, alignItems: 'center' },
  tabActiveText: { color: 'white', fontSize: 13, fontWeight: '600' },
  tabInactive: { flex: 1, borderWidth: 0.5, borderColor: '#ddd', padding: 10, borderRadius: 10, alignItems: 'center' },
  tabInactiveText: { fontSize: 13, color: '#555' },
  pricingCard: { backgroundColor: RED, borderRadius: 14, padding: 16, marginBottom: 12 },
  pricingTitle: { fontSize: 16, fontWeight: '600', color: 'white' },
  pricingSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  priceBig: { fontSize: 48, fontWeight: '600', color: 'white' },
  priceRec: { textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  priceStatusLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  priceControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginVertical: 12 },
  priceBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  priceBtnText: { fontSize: 22, color: 'white', fontWeight: '300' },
  sliderTrack: { height: 6, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 3, marginVertical: 8, flexDirection: 'row' },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  tripRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderColor: '#eee' },
  tripIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  tripName: { fontSize: 13, fontWeight: '500' },
  tripSub: { fontSize: 11, color: '#999', marginTop: 2 },
  tripPrice: { fontSize: 13, fontWeight: '600' },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 0.5, borderColor: '#eee' },
  driverCardInner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  driverName: { fontSize: 14, fontWeight: '500' },
  avatarCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: 'white', fontWeight: '600', fontSize: 13 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 0.5, borderColor: '#eee' },
  skeletonAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e8e8e8' },
  skeletonLine: { height: 12, backgroundColor: '#e8e8e8', borderRadius: 6, width: '80%' },
  skeletonPrice: { width: 40, height: 20, backgroundColor: '#e8e8e8', borderRadius: 4 },
  greenBadge: { backgroundColor: '#eaf3de', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  greenBadgeText: { fontSize: 10, color: GREEN, fontWeight: '500' },
  redBadge: { backgroundColor: '#fff0f0', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  redBadgeText: { fontSize: 10, color: RED, fontWeight: '500' },
  greenPill: { backgroundColor: 'rgba(59,109,17,0.12)', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, alignSelf: 'flex-start', marginBottom: 8 },
  greenPillText: { color: GREEN, fontSize: 12, fontWeight: '500' },
  pulseRing: { width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.15)', position: 'absolute' },
  pulseInner: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
  matchTitle: { fontSize: 22, fontWeight: '600', color: 'white', textAlign: 'center', marginBottom: 8 },
  matchSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginBottom: 24, paddingHorizontal: 16 },
  matchBadge: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 16 },
  matchBadgeText: { color: 'white', fontSize: 14, fontWeight: '500' },
  matchNote: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  countdownTimer: { fontSize: 36, fontWeight: '700', color: 'white', letterSpacing: 2 },
  routeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fafafa', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 0.5, borderColor: '#eee', gap: 12 },
  routeTrack: { alignItems: 'center', gap: 4 },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routeLine: { width: 2, height: 22, backgroundColor: '#ddd' },
  routeFrom: { fontSize: 13, fontWeight: '500', color: '#111' },
  routeTo: { fontSize: 13, fontWeight: '500', color: RED },
  routeBadge: { backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  routeBadgeText: { fontSize: 11, color: '#555', fontWeight: '500' },
  checkCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' },
  toggleBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)' },
  toggleBtnActive: { backgroundColor: 'white' },
  toggleBtnText: { fontSize: 12, color: 'white', fontWeight: '600' },
  swipeCard: { width: width - 48, borderRadius: 16, padding: 18, borderWidth: 0.5, borderColor: '#eee', elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8 },
  swipeHint: { position: 'absolute', top: '45%', zIndex: 10, backgroundColor: 'white', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  swipeHintLeft: { left: 16, borderColor: '#E24B4A' },
  swipeHintRight: { right: 16, borderColor: GREEN },
  swipeHintTextRed: { color: '#E24B4A', fontSize: 14, fontWeight: '600' },
  swipeHintTextGreen: { color: GREEN, fontSize: 14, fontWeight: '600' },
  inputField: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 0.5, borderColor: '#ddd', justifyContent: 'center' },
  pickerOverlay: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: 'white' },
  kycDocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: '#fafafa',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#eee',
    marginBottom: 10,
  },
  kycDocIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kycProgressTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 3,
    marginTop: 10,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  kycProgressFill: { backgroundColor: 'white', borderRadius: 3 },
  kycBadgeGray: { backgroundColor: '#e8e8e8', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  kycBadgePending: { backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  kycBadgeApproved: { backgroundColor: '#eaf3de', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  kycBadgeRejected: { backgroundColor: '#fff0f0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  kycBadgeTextGray: { fontSize: 10, fontWeight: '600' as const, color: '#666' },
  kycBadgeTextPending: { fontSize: 10, fontWeight: '600' as const, color: AMBER },
  kycBadgeTextApproved: { fontSize: 10, fontWeight: '600' as const, color: GREEN },
  kycBadgeTextRejected: { fontSize: 10, fontWeight: '600' as const, color: RED },
  payMethodBtn: { flex: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', padding: 10, borderRadius: 10, alignItems: 'center' },
  payMethodBtnActive: { backgroundColor: 'white', borderColor: 'white' },
  payMethodText: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  payMethodTextActive: { color: RED, fontWeight: '600' },
  tripHistoryCard: { backgroundColor: '#fafafa', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 0.5, borderColor: '#eee' },
  tripHistoryAddr: { fontSize: 13, fontWeight: '500', color: '#111' },
  // Chat
  chatIconWrap: { position: 'relative', width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  chatBadge: { position: 'absolute', top: -4, right: -6, backgroundColor: '#FFD700', borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  chatBadgeText: { fontSize: 10, fontWeight: '700', color: '#111' },
  chatEmptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 64 },
  chatBubbleRow: { flexDirection: 'row', marginBottom: 8 },
  chatBubbleRowMine: { justifyContent: 'flex-end' },
  chatBubbleRowTheirs: { justifyContent: 'flex-start' },
  chatBubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  chatBubbleMine: { backgroundColor: RED, borderBottomRightRadius: 4 },
  chatBubbleTheirs: { backgroundColor: '#f0f0f0', borderBottomLeftRadius: 4 },
  chatBubbleText: { fontSize: 14, color: '#111', lineHeight: 20 },
  chatTimestamp: { fontSize: 10, color: '#aaa', marginTop: 4, textAlign: 'right' },
  quickReplyRow: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  quickReplyChip: { backgroundColor: '#f0f0f0', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 0.5, borderColor: '#ddd' },
  quickReplyText: { fontSize: 13, color: '#333' },
  chatInputBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: '#eee', backgroundColor: 'white', gap: 8 },
  chatInputIcon: { padding: 4 },
  chatInput: { flex: 1, backgroundColor: '#f5f5f5', borderRadius: 22, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, color: '#111', borderWidth: 0.5, borderColor: '#eee' },
  chatSendBtn: { backgroundColor: RED, borderRadius: 22, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  // Rating
  starRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8 },
  starIcon: { fontSize: 40 },
  ratingCommentInput: { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 14, fontSize: 14, color: '#111', borderWidth: 0.5, borderColor: '#ddd', minHeight: 90 },
  // Vehicle profile
  vehicleBanner: { backgroundColor: RED, borderRadius: 12, padding: 14, marginBottom: 16 },
  vehicleBannerText: { color: 'white', fontSize: 13, fontWeight: '500', marginBottom: 8 },
  vehicleBannerBtn: { backgroundColor: 'white', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, alignSelf: 'flex-start' },
  vehicleBannerBtnText: { color: RED, fontSize: 13, fontWeight: '600' },
  vehicleFieldWrap: { marginBottom: 14 },
  vehicleFieldLabel: { fontSize: 12, color: '#666', fontWeight: '600', letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase' },
  vehicleFieldInput: { backgroundColor: '#f5f5f5', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#111', borderWidth: 0.5, borderColor: '#ddd' },
  // Marketplace
  marketplaceRow: { backgroundColor: '#fafafa', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: '#eee' },
  seatBar: { height: 4, backgroundColor: '#eee', borderRadius: 2, marginTop: 6, marginBottom: 2, overflow: 'hidden' },
  seatBarFill: { height: 4, backgroundColor: GREEN, borderRadius: 2 },
  fieldLabel: { fontSize: 10, color: '#999', letterSpacing: 1, marginBottom: 6, fontWeight: '600' as const },
  fieldInput: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12, fontSize: 14, color: '#111', borderWidth: 0.5, borderColor: '#e0e0e0' },
  matchBanner: { backgroundColor: '#EFF6FF', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#BFDBFE' },
  matchBannerTitle: { fontSize: 13, fontWeight: '600' as const, color: '#1D4ED8', marginBottom: 4 },
  matchBannerBody: { fontSize: 12, color: '#2563EB' },
});
