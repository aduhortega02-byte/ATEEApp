import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const { width } = Dimensions.get('window');
const RED = '#8B0000';
const GREEN = '#3B6D11';
const AMBER = '#BA7517';

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
  | 'DriverEarnings';

type NavProp = { navigate: (s: ScreenName) => void };

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
function TopBar({ title, onBack }: { title: string; onBack?: () => void }) {
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
      <View style={{ width: 60 }} />
    </View>
  );
}

// ─── BOTTOM NAV ───────────────────────────────────────────────
function BottomNav({
  active,
  navigate,
  mode,
}: {
  active: string;
  navigate: (s: ScreenName) => void;
  mode: 'passenger' | 'driver';
}) {
  const passengerTabs = ['Home', 'Search', 'Trips', 'Profile'];
  const driverTabs = ['Home', 'Trips', 'Earnings', 'Profile'];
  const tabs = mode === 'driver' ? driverTabs : passengerTabs;
  const routes: Record<string, ScreenName> =
    mode === 'driver'
      ? { Home: 'DriverHome', Trips: 'DriverActive', Earnings: 'DriverEarnings', Profile: 'DriverHome' }
      : { Home: 'Home', Search: 'Book', Trips: 'Confirmed', Profile: 'Home' };
  return (
    <View style={s.bottomNav}>
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab}
          style={s.navItem}
          onPress={() => {
            Haptics.selectionAsync();
            navigate(routes[tab]);
          }}
        >
          <View style={[s.navDot, active === tab && s.navDotActive]} />
          <Text style={[s.navLabel, active === tab && { color: RED }]}>{tab}</Text>
        </TouchableOpacity>
      ))}
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
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  navigate('DriverHome');
                }}
              >
                <Text style={s.ghostBtnText}>Continue as Driver →</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={s.signInText}>
            Already have an account?{' '}
            <Text style={{ textDecorationLine: 'underline' }}>Sign in to ATEE</Text>
          </Text>
        </SafeAreaView>
      </View>
    </ScreenTransition>
  );
}

// ─── HOME ─────────────────────────────────────────────────────
function HomeScreen({ navigate }: NavProp) {
  const recent = [
    { icon: '🏬', name: 'The Merchandise Mart', sub: '222 W Merchandise...', price: '$18.50' },
    { icon: '🏠', name: 'Home', sub: 'West Loop, Chicago', price: '$12.20' },
    { icon: '✈️', name: "O'Hare Terminal 1", sub: "10000 W O'Hare Ave", price: '$45.00' },
  ];
  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <StatusBar barStyle="light-content" />
        <TopBar title="ATEE" />
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Text style={s.greeting}>Good morning, Alex 👋</Text>
          <Text style={s.bigTitle}>Where to?</Text>
          <TouchableOpacity
            style={s.searchBar}
            onPress={() => { Haptics.selectionAsync(); navigate('Book'); }}
          >
            <Text style={{ fontSize: 15, marginRight: 8 }}>📍</Text>
            <Text style={s.searchPlaceholder}>Enter destination</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.redBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); navigate('Book'); }}
          >
            <Text style={s.redBtnText}>Book a New Ride</Text>
          </TouchableOpacity>
          <View style={s.rowBetween}>
            <Text style={s.sectionTitle}>Recent Trips</Text>
            <Text style={s.seeAll}>See All</Text>
          </View>
          {recent.map((r, i) => (
            <View key={i} style={s.tripRow}>
              <View style={s.tripIcon}>
                <Text style={{ fontSize: 15 }}>{r.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.tripName}>{r.name}</Text>
                <Text style={s.tripSub}>{r.sub}</Text>
              </View>
              <Text style={s.tripPrice}>{r.price}</Text>
            </View>
          ))}
        </ScrollView>
        <BottomNav active="Home" navigate={navigate} mode="passenger" />
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── BOOK ─────────────────────────────────────────────────────
function BookScreen({ navigate }: NavProp) {
  const [price, setPrice] = useState(40);
  const [destination, setDestination] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = [
    'Heathrow Terminal 5',
    'Canary Wharf',
    'London Bridge Station',
    "King's Cross St Pancras",
  ];

  const priceColor = price >= 42 ? GREEN : price >= 34 ? AMBER : RED;
  const priceLabel =
    price >= 42 ? 'Likely to get drivers ✓' :
    price >= 34 ? 'Might get drivers' :
    'Low — few drivers may accept';

  const fillFlex = (price - 1) / 99;

  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <TopBar title="ATEE" onBack={() => navigate('Home')} />
        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <View style={s.card}>
            <Text style={s.cardLabel}>PICKUP</Text>
            <Text style={s.cardValue}>📍 124 Baker Street, Marylebone</Text>
            <View style={s.divider} />
            <Text style={s.cardLabel}>DESTINATION</Text>
            <TextInput
              style={s.destInput}
              placeholder="Where are you going?"
              placeholderTextColor="#aaa"
              value={destination}
              onChangeText={(t) => { setDestination(t); setShowSuggestions(t.length > 0); }}
            />
            {showSuggestions && (
              <View style={s.suggestBox}>
                {suggestions
                  .filter((sg) => sg.toLowerCase().includes(destination.toLowerCase()))
                  .map((sg, i) => (
                    <TouchableOpacity
                      key={i}
                      style={s.suggestRow}
                      onPress={() => { Haptics.selectionAsync(); setDestination(sg); setShowSuggestions(false); }}
                    >
                      <Text style={{ marginRight: 8 }}>📍</Text>
                      <Text style={s.suggestText}>{sg}</Text>
                    </TouchableOpacity>
                  ))}
              </View>
            )}
          </View>

          <RouteCard
            pickup="124 Baker Street"
            destination={destination.length > 0 ? destination : 'Heathrow Terminal 5'}
            eta="42 min"
            distance="18.4 mi"
          />

          <View style={s.statRow}>
            <View style={s.statBox}>
              <Text style={s.statLabel}>Est. Time</Text>
              <Text style={s.statValue}>42 MIN</Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statLabel}>Distance</Text>
              <Text style={s.statValue}>18.4 MI</Text>
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

          <View style={s.pricingCard}>
            <Text style={s.pricingTitle}>Set your price.</Text>
            <Text style={s.pricingSub}>Higher bid = faster match.</Text>
            <Text style={[s.priceBig, { textAlign: 'center', marginVertical: 14 }]}>${price}</Text>

            {/* Slider using flex — no string percentages */}
            <View style={s.sliderTrack}>
              <View style={{ flex: fillFlex, height: 6, backgroundColor: priceColor, borderRadius: 3 }} />
              <View style={{ flex: 1 - fillFlex, height: 6 }} />
            </View>

            <View style={s.sliderRow}>
              <TouchableOpacity
                style={s.priceBtn}
                onPress={() => { Haptics.selectionAsync(); setPrice((p) => Math.max(1, p - 1)); }}
              >
                <Text style={s.priceBtnText}>−</Text>
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={[s.priceStatusLabel, { color: priceColor }]}>{priceLabel}</Text>
                <Text style={s.priceRec}>Recommended: $42 – $55</Text>
              </View>
              <TouchableOpacity
                style={s.priceBtn}
                onPress={() => { Haptics.selectionAsync(); setPrice((p) => Math.min(100, p + 1)); }}
              >
                <Text style={s.priceBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[s.redBtn, { backgroundColor: 'white', marginTop: 14 }]}
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                navigate('Matching');
              }}
            >
              <Text style={[s.redBtnText, { color: RED }]}>Request Drivers →</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        <BottomNav active="Search" navigate={navigate} mode="passenger" />
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── MATCHING ─────────────────────────────────────────────────
function MatchingScreen({ navigate }: NavProp) {
  const [count, setCount] = useState(0);
  const [dots, setDots] = useState('');
  const scale = useRef(new Animated.Value(1)).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.14, duration: 600, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();

    Animated.timing(progress, { toValue: 1, duration: 3000, useNativeDriver: false }).start();

    let n = 0;
    const ticker = setInterval(() => { n += 1; setCount(n); if (n >= 3) clearInterval(ticker); }, 900);
    const dotTimer = setInterval(() => { setDots((d) => (d.length >= 3 ? '' : d + '.')); }, 400);
    const nav = setTimeout(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigate('Drivers');
    }, 3200);

    return () => { clearInterval(ticker); clearInterval(dotTimer); clearTimeout(nav); };
  }, []);

  const barWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

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
          <Text style={s.matchSub}>Your price has been broadcast to 8 nearby drivers</Text>
          <View style={s.progressTrack}>
            <Animated.View style={[s.progressBar, { width: barWidth }]} />
          </View>
          {count > 0 && (
            <View style={s.matchBadge}>
              <Text style={s.matchBadgeText}>
                {count} driver{count > 1 ? 's' : ''} accepted your price 🎉
              </Text>
            </View>
          )}
          <Text style={s.matchNote}>Average wait: 45 seconds</Text>
        </View>
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── SCHEDULE ─────────────────────────────────────────────────
function ScheduleScreen({ navigate }: NavProp) {
  const [price, setPrice] = useState(40);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <TopBar title="ATEE" onBack={() => navigate('Book')} />
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={s.card}>
            <Text style={s.cardLabel}>PICKUP</Text>
            <Text style={s.cardValue}>124 Baker Street, Marylebone</Text>
            <View style={s.divider} />
            <Text style={s.cardLabel}>DESTINATION</Text>
            <Text style={s.cardValue}>Heathrow Terminal 5</Text>
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
            <Text style={s.pricingSub}>Bid for this scheduled ride.</Text>
            <View style={s.priceControls}>
              <TouchableOpacity style={s.priceBtn} onPress={() => { Haptics.selectionAsync(); setPrice((p) => Math.max(1, p - 1)); }}>
                <Text style={s.priceBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={s.priceBig}>${price}</Text>
              <TouchableOpacity style={s.priceBtn} onPress={() => { Haptics.selectionAsync(); setPrice((p) => p + 1); }}>
                <Text style={s.priceBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.priceRec}>Recommended fare: $42 – $55</Text>
            <TouchableOpacity
              style={[s.redBtn, { backgroundColor: 'white', marginTop: 12 }]}
              onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); navigate('Matching'); }}
            >
              <Text style={[s.redBtnText, { color: RED }]}>Find Drivers for This Time →</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        {showDatePicker && (
          <View style={s.pickerOverlay}>
            <DateTimePicker value={selectedDate} mode="date" display="spinner"
              onChange={(_e, d) => { if (d) setSelectedDate(d); setShowDatePicker(false); }} />
          </View>
        )}
        {showTimePicker && (
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

// ─── DRIVERS ──────────────────────────────────────────────────
function DriversScreen({ navigate }: NavProp) {
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 1600); return () => clearTimeout(t); }, []);

  const drivers: { initials: string; name: string; rating: string; trips: string; color: string; eta: string }[] = [
    { initials: 'SJ', name: 'Sarah J.', rating: '4.9', trips: '242', color: RED, eta: '3 min' },
    { initials: 'MK', name: 'Mike K.', rating: '4.7', trips: '128', color: GREEN, eta: '5 min' },
    { initials: 'AR', name: 'Amara R.', rating: '4.8', trips: '315', color: '#185FA5', eta: '7 min' },
  ];

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
          ) : (
            <>
              <Text style={s.muted}>3 drivers accepted your price of $45</Text>
              {drivers.map((d, i) => (
                <TouchableOpacity
                  key={i}
                  style={s.driverRow}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); navigate('Confirmed'); }}
                >
                  <View style={[s.avatarCircle, { backgroundColor: d.color }]}>
                    <Text style={s.avatarText}>{d.initials}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.driverName}>{d.name}</Text>
                    <Text style={s.muted}>⭐ {d.rating} · {d.trips} trips · Verified</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[s.tripPrice, { color: RED }]}>$45</Text>
                    <Text style={[s.muted, { color: GREEN }]}>ETA {d.eta}</Text>
                    <View style={s.greenBadge}><Text style={s.greenBadgeText}>100% fare</Text></View>
                  </View>
                </TouchableOpacity>
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
  const [seconds, setSeconds] = useState(272);
  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const timerLabel = seconds > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : 'Arriving now! 🎉';

  const rows: [string, string][] = [
    ['Pickup', '124 Baker Street'],
    ['Destination', 'Heathrow T5'],
    ['Your Price', '$45.00'],
  ];

  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <View style={[s.topBar, { justifyContent: 'center' }]}>
          <Text style={s.logo}>ATEE</Text>
        </View>
        <View style={{ alignItems: 'center', backgroundColor: RED, paddingVertical: 24 }}>
          <View style={s.checkCircle}>
            <Text style={{ fontSize: 26, color: RED }}>✓</Text>
          </View>
          <Text style={{ fontSize: 20, fontWeight: '600', color: 'white', marginTop: 8 }}>Ride Confirmed!</Text>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 4 }}>Sarah J. is on the way</Text>
          <View style={{ marginTop: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Arriving in</Text>
            <Text style={s.countdownTimer}>{timerLabel}</Text>
          </View>
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <RouteCard pickup="124 Baker Street" destination="Heathrow Terminal 5" eta="42 min" distance="18.4 mi" />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={s.card}>
            <View style={s.driverCardInner}>
              <View style={[s.avatarCircle, { backgroundColor: RED }]}>
                <Text style={s.avatarText}>SJ</Text>
              </View>
              <View>
                <Text style={s.driverName}>Sarah J.</Text>
                <Text style={s.muted}>Toyota Camry · White · ABC 1234</Text>
              </View>
            </View>
          </View>
          <View style={s.card}>
            {rows.map(([label, val], i) => (
              <View key={i} style={[s.rowBetween, { paddingVertical: 6, borderBottomWidth: i < 2 ? 0.5 : 0, borderColor: '#eee' }]}>
                <Text style={s.muted}>{label}</Text>
                <Text style={[s.driverName, { color: i === 2 ? RED : '#111' }]}>{val}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={s.redBtn} onPress={() => navigate('Home')}>
            <Text style={s.redBtnText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── DRIVER HOME ──────────────────────────────────────────────
function DriverHomeScreen({ navigate }: NavProp) {
  const [online, setOnline] = useState(true);
  const stats: [string, string][] = [['Active Time', '6h 42m'], ['Trips', '14'], ['Acceptance', '98%']];
  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <View style={s.topBar}>
          <Text style={s.logo}>ATEE</Text>
          <View style={s.avatarSmall} />
        </View>
        <View style={{ backgroundColor: RED, paddingHorizontal: 16, paddingBottom: 14 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={[s.toggleBtn, online && s.toggleBtnActive]} onPress={() => { Haptics.selectionAsync(); setOnline(true); }}>
              <Text style={[s.toggleBtnText, online && { color: RED }]}>ONLINE</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.toggleBtn, !online && s.toggleBtnActive]} onPress={() => { Haptics.selectionAsync(); setOnline(false); }}>
              <Text style={[s.toggleBtnText, !online && { color: RED }]}>OFFLINE</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 6 }}>
            {online ? '🟢 Searching for nearby riders...' : '🔴 You are offline'}
          </Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Text style={s.muted}>Today's earnings</Text>
          <Text style={[s.bigTitle, { color: RED }]}>$248.50</Text>
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
            <Text style={s.sectionTitle}>Active Request</Text>
            <View style={s.redBadge}><Text style={s.redBadgeText}>1 Available</Text></View>
          </View>
          <TouchableOpacity style={s.card} onPress={() => navigate('DriverRequest')}>
            <View style={s.driverCardInner}>
              <View style={[s.avatarCircle, { backgroundColor: RED }]}><Text style={s.avatarText}>SJ</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.driverName}>Sarah J.</Text>
                <Text style={s.muted}>4.9 · 242 Trips · 6mi away</Text>
              </View>
              <Text style={[s.tripPrice, { color: RED }]}>$18.40</Text>
            </View>
            <Text style={s.muted}>582 Central Park West → Grand Central Terminal</Text>
            <TouchableOpacity style={[s.redBtn, { marginTop: 10 }]} onPress={() => navigate('DriverRequest')}>
              <Text style={s.redBtnText}>See More Details</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </ScrollView>
        <BottomNav active="Home" navigate={navigate} mode="driver" />
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── DRIVER REQUEST ───────────────────────────────────────────
function DriverRequestScreen({ navigate }: NavProp) {
  const pan = useRef(new Animated.ValueXY()).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10,
      onPanResponderMove: Animated.event([null, { dx: pan.x }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        if (g.dx > 80) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Animated.timing(pan, { toValue: { x: width, y: 0 }, duration: 250, useNativeDriver: false }).start(() => navigate('DriverActive'));
        } else if (g.dx < -80) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          Animated.timing(pan, { toValue: { x: -width, y: 0 }, duration: 250, useNativeDriver: false }).start(() => navigate('DriverHome'));
        } else {
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        }
      },
    })
  ).current;

  const cardBg = pan.x.interpolate({ inputRange: [-150, 0, 150], outputRange: ['#ffeded', 'white', '#eaf3de'], extrapolate: 'clamp' });
  const acceptOpacity = pan.x.interpolate({ inputRange: [0, 80], outputRange: [0, 1], extrapolate: 'clamp' });
  const declineOpacity = pan.x.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  const tripRows: [string, string][] = [
    ['From', '582 Central Park West'],
    ['To', 'Grand Central Terminal'],
    ['Distance', '3.2 miles'],
    ['Passenger offer', '$18.40'],
    ['You keep', '$18.40 (100%)'],
  ];

  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <TopBar title="ATEE" onBack={() => navigate('DriverHome')} />
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
            <Animated.View style={[s.swipeCard, { backgroundColor: cardBg, transform: [{ translateX: pan.x }] }]} {...panResponder.panHandlers}>
              <View style={s.driverCardInner}>
                <View style={[s.avatarCircle, { backgroundColor: RED }]}><Text style={s.avatarText}>SJ</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.driverName}>Sarah J.</Text>
                  <Text style={s.muted}>4.9 rating · 242 trips · Verified</Text>
                </View>
              </View>
              <View style={s.divider} />
              {tripRows.map(([label, val], i) => (
                <View key={i} style={[s.rowBetween, { paddingVertical: 6 }]}>
                  <Text style={s.muted}>{label}</Text>
                  <Text style={[s.driverName, { color: i === 4 ? GREEN : i === 3 ? RED : '#111' }]}>{val}</Text>
                </View>
              ))}
            </Animated.View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            <TouchableOpacity style={[s.outlineBtn, { flex: 1 }]} onPress={() => navigate('DriverHome')}>
              <Text style={s.outlineBtnText}>✗ Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.redBtn, { flex: 1, margin: 0 }]} onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); navigate('DriverActive'); }}>
              <Text style={s.redBtnText}>✓ Accept</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── DRIVER ACTIVE ────────────────────────────────────────────
function DriverActiveScreen({ navigate }: NavProp) {
  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <TopBar title="Active Trip" />
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <RouteCard pickup="582 Central Park West" destination="Grand Central Terminal" eta="12 min" distance="3.2 mi" />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={s.card}>
            <View style={s.driverCardInner}>
              <View style={[s.avatarCircle, { backgroundColor: RED }]}><Text style={s.avatarText}>SJ</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.driverName}>Sarah J. — Passenger</Text>
                <Text style={s.muted}>Pickup in 3 min</Text>
              </View>
              <Text style={[s.tripPrice, { color: RED }]}>$18.40</Text>
            </View>
          </View>
          <View style={s.statRow}>
            <View style={s.statBox}><Text style={s.statLabel}>ETA</Text><Text style={s.statValue}>12 min</Text></View>
            <View style={s.statBox}><Text style={s.statLabel}>Distance</Text><Text style={s.statValue}>3.2 mi</Text></View>
          </View>
          <TouchableOpacity style={s.redBtn} onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); navigate('DriverComplete'); }}>
            <Text style={s.redBtnText}>Complete Trip</Text>
          </TouchableOpacity>
        </ScrollView>
        <BottomNav active="Trips" navigate={navigate} mode="driver" />
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── DRIVER COMPLETE ──────────────────────────────────────────
function DriverCompleteScreen({ navigate }: NavProp) {
  useEffect(() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }, []);
  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <View style={{ backgroundColor: RED, padding: 28, alignItems: 'center' }}>
          <Text style={s.logo}>ATEE</Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 8 }}>Trip complete! You earned</Text>
          <Text style={{ fontSize: 52, fontWeight: '600', color: 'white' }}>$18.40</Text>
          <View style={s.greenPill}><Text style={s.greenPillText}>100% yours. $0 commission.</Text></View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={s.card}>
            <Text style={s.muted}>Rate your passenger</Text>
            <Text style={{ fontSize: 28, marginTop: 8, textAlign: 'center' }}>⭐⭐⭐⭐⭐</Text>
          </View>
          <View style={s.card}>
            <View style={s.rowBetween}><Text style={s.muted}>Today's total</Text><Text style={[s.driverName, { color: RED }]}>$266.90</Text></View>
            <View style={[s.rowBetween, { marginTop: 6 }]}><Text style={s.muted}>Commission taken</Text><Text style={[s.driverName, { color: GREEN }]}>$0.00</Text></View>
          </View>
          <TouchableOpacity style={s.redBtn} onPress={() => navigate('DriverEarnings')}>
            <Text style={s.redBtnText}>View Earnings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.outlineBtn} onPress={() => navigate('DriverHome')}>
            <Text style={s.outlineBtnText}>Find Next Trip</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── DRIVER EARNINGS ──────────────────────────────────────────
function DriverEarningsScreen({ navigate }: NavProp) {
  const trips = [
    { name: 'Airport Express Rate', time: 'Yesterday · 11:32 PM', amount: '$42.00' },
    { name: 'Downtown Shuttle', time: 'Today · 1:15 PM', amount: '$18.50' },
    { name: 'Corporate Pickup', time: 'Today · 11:30 PM', amount: '$65.00' },
  ];
  return (
    <ScreenTransition>
      <SafeAreaView style={s.screen}>
        <TopBar title="Earnings" />
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Text style={s.muted}>Total balance</Text>
          <Text style={[s.bigTitle, { color: RED }]}>$1,482.50</Text>
          <View style={s.greenBadge}><Text style={s.greenBadgeText}>Verified · $0 commission taken</Text></View>
          <View style={[s.tabRow, { marginTop: 12 }]}>
            {['Daily', 'Weekly', 'Monthly'].map((t, i) => (
              <TouchableOpacity key={i} style={i === 0 ? s.tabActive : s.tabInactive}>
                <Text style={i === 0 ? s.tabActiveText : s.tabInactiveText}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[s.sectionTitle, { marginTop: 12 }]}>Recent Earnings</Text>
          {trips.map((t, i) => (
            <View key={i} style={s.tripRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.driverName}>{t.name}</Text>
                <Text style={s.muted}>{t.time}</Text>
              </View>
              <Text style={[s.tripPrice, { color: RED }]}>{t.amount}</Text>
            </View>
          ))}
          <TouchableOpacity style={[s.redBtn, { marginTop: 8 }]} onPress={() => navigate('DriverHome')}>
            <Text style={s.redBtnText}>Withdraw Funds</Text>
          </TouchableOpacity>
        </ScrollView>
        <BottomNav active="Earnings" navigate={navigate} mode="driver" />
      </SafeAreaView>
    </ScreenTransition>
  );
}

// ─── ROUTER ───────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState<ScreenName>('Onboarding');
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
  };
  return screens[screen] ?? screens['Onboarding'];
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
  progressTrack: { width: '80%', height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, overflow: 'hidden', marginBottom: 20 },
  progressBar: { height: 4, backgroundColor: 'white', borderRadius: 2 },
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
});