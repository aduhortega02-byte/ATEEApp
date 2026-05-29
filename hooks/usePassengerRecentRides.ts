import { useQuery } from '@tanstack/react-query';
import { fetchRecentRidesForPassenger } from '../lib/passenger';
import { QK, CACHE_TTL } from '../lib/queryClient';

export function usePassengerRecentRides() {
  const { data: rides, isLoading: loading } = useQuery({
    queryKey: QK.rideHistory,
    queryFn: fetchRecentRidesForPassenger,
    staleTime: CACHE_TTL.rideHistory,
  });

  return { rides: rides ?? [], loading };
}