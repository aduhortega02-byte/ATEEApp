import { QueryClient } from '@tanstack/react-query';

// Centralised cache-time constants — tweak here, applies everywhere.
export const CACHE_TTL = {
  profile:      5 * 60 * 1000,   // 5 min  — profile changes infrequently
  rideHistory:  1 * 60 * 1000,   // 1 min  — may complete a ride
  wallet:       1 * 60 * 1000,   // 1 min  — earnings update after each ride
  locations:   10 * 60 * 1000,   // 10 min — saved locations rarely change
} as const;

// Query key registry — single source of truth for invalidation.
export const QK = {
  myProfile:       ['my-profile']          as const,
  rideHistory:     ['ride-history']        as const,
  driverWallet:    ['driver-wallet']       as const,
  savedLocations:  ['saved-locations']     as const,
} as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Show cached data while re-fetching (no loading flash on revisit).
      placeholderData: (prev: unknown) => prev,
      // Retry once on network errors, not on 4xx responses.
      retry: (failureCount, error: any) => {
        if (error?.status >= 400 && error?.status < 500) return false;
        return failureCount < 1;
      },
      // Keep data in memory for 10 minutes even after all subscribers unmount.
      gcTime: 10 * 60 * 1000,
    },
    mutations: {
      // Surface mutation errors globally via the onError default if desired.
    },
  },
});