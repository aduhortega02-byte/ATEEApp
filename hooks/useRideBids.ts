// hooks/useRideBids.ts
// Passenger-side hook. After passenger creates a ride, subscribe to incoming
// driver bids. As drivers tap "Accept" on their end, this array fills up.

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchBidsForRide, RideBid } from '../lib/rides';

export function useRideBids(rideId: string | null) {
  const [bids, setBids] = useState<RideBid[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!rideId) {
      setBids([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    // Initial fetch
    (async () => {
      try {
        const initial = await fetchBidsForRide(rideId);
        if (!cancelled) {
          setBids(initial);
          setLoading(false);
        }
      } catch (e) {
        console.warn('[useRideBids] initial fetch failed', e);
        if (!cancelled) setLoading(false);
      }
    })();

    // Realtime subscription
    const channel = supabase
      .channel(`bids-${rideId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ride_bids',
          filter: `ride_id=eq.${rideId}`,
        },
        async () => {
          // Refetch with join so we get driver profile info
          const fresh = await fetchBidsForRide(rideId);
          if (!cancelled) setBids(fresh);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ride_bids',
          filter: `ride_id=eq.${rideId}`,
        },
        async () => {
          const fresh = await fetchBidsForRide(rideId);
          if (!cancelled) setBids(fresh);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [rideId]);

  return { bids, loading };
}
