import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSavedLocations, type SavedLocation } from '../lib/savedLocations';
import { QK, CACHE_TTL } from '../lib/queryClient';

export function useSavedLocations() {
  const queryClient = useQueryClient();

  const { data: locations, isLoading: loading, refetch } = useQuery({
    queryKey: QK.savedLocations,
    queryFn: fetchSavedLocations,
    staleTime: CACHE_TTL.locations,
  });

  // Expose a refresh that forces a server round-trip (e.g. after adding a location).
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: QK.savedLocations });
    return refetch();
  };

  return {
    locations: (locations ?? []) as SavedLocation[],
    loading,
    refresh,
  };
}