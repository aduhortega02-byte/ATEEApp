import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAvailableTrips, type Trip } from '../lib/trips';

export function useAvailableTrips() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await fetchAvailableTrips();
        if (!cancelled) { setTrips(data); setLoading(false); }
      } catch (e) {
        console.warn('[useAvailableTrips] fetch failed', e);
        if (!cancelled) setLoading(false);
      }
    })();

    const channel = supabase
      .channel('available-trips')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trips' },
        async () => {
          if (cancelled) return;
          try {
            const data = await fetchAvailableTrips();
            if (!cancelled) setTrips(data);
          } catch {}
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return { trips, loading };
}
