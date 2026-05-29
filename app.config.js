export default {
  expo: {
    name: 'ATEEApp',
    slug: 'ATEEApp',
    owner: 'tegaaduhor',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'ateeapp',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    updates: {
      url: 'https://u.expo.dev/23ae8dc7-4a8c-40e1-a8c2-58cff8481491',
    },
    runtimeVersion: {
      policy: 'appVersion',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.rideatee.app',
      config: {
        // Injected from .env at build time — never hardcoded.
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      },
    },
    android: {
      package: 'com.rideatee.app',
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      config: {
        googleMaps: {
          // Injected from .env at build time — never hardcoded.
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
        },
      },
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      '@sentry/react-native/expo',
      ['@stripe/stripe-react-native', {
        merchantIdentifier: 'merchant.com.rideatee.app',
        enableGooglePay: true,
      }],
      [
        'expo-notifications',
        {
          icon: './assets/images/icon.png',
          color: '#8B0000',
          sounds: [],
        },
      ],
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#8B0000',
          dark: {
            backgroundColor: '#8B0000',
          },
        },
      ],
      '@react-native-community/datetimepicker',
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: '23ae8dc7-4a8c-40e1-a8c2-58cff8481491',
      },
    },
  },
};
