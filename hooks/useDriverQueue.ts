import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAvailableRides, Ride } from '../lib/rides';

export function useDriverQueue(enabled: boolean, onNewRide?: (ride: Ride) => void) {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(enabled);
  const initialFetchDoneRef = useRef(false);
  const onNewRideRef = useRef(onNewRide);

  useEffect(() => {
    onNewRideRef.current = onNewRide;
  }, [onNewRide]);

  useEffect(() => {
    if (!enabled) {
      setRides([]);
      setLoading(false);
      initialFetchDoneRef.current = false;
      return;
    }

    let cancelled = false;
    initialFetchDoneRef.current = false;

    (async () => {
      try {
        const initial = await fetchAvailableRides();
        if (!cancelled) {
          setRides(initial);
          setLoading(false);
          initialFetchDoneRef.current = true;
        }
      } catch (e) {
        console.warn('[useDriverQueue] initial fetch failed', e);
        if (!cancelled) {
          setLoading(false);
          initialFetchDoneRef.current = true;
        }
      }
    })();

    const channel = supabase
      .channel('driver-queue')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'rides' },
        (payload: { new: any; old: any; eventType: string }) => {
          const r = payload.new as Ride;
          if (r.status === 'matching' && !cancelled) {
            setRides((prev) => [r, ...prev]);
            if (initialFetchDoneRef.current) onNewRideRef.current?.(r);
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rides' },
        (payload: { new: any; old: any; eventType: string }) => {
          const r = payload.new as Ride;
          if (cancelled) return;
          if (r.status !== 'matching') {
            setRides((prev) => prev.filter((x) => x.id !== r.id));
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [enabled]);

  return { rides, loading };
}
