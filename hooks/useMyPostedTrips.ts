import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchMyPostedTrips, type Trip } from '../lib/trips';

export function useMyPostedTrips() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const data = await fetchMyPostedTrips();
        if (!cancelled) setTrips(data);
      } catch (e) {
        console.warn('[useMyPostedTrips] fetch failed', e);
      }
    };

    (async () => {
      const { data } = await supabase.auth.getUser();
      userIdRef.current = data.user?.id ?? null;
      await refresh();
      if (!cancelled) setLoading(false);
    })();

    const channel = supabase
      .channel('my-posted-trips')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trips' },
        (payload: { new: any }) => {
          if (cancelled) return;
          if (payload.new?.driver_id === userIdRef.current || !payload.new?.driver_id) {
            refresh();
          }
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
