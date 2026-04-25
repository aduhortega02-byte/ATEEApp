// hooks/useDriverQueue.ts
// Driver-side hook. When the driver is online, this keeps a live list of
// ride requests that passengers are broadcasting. New requests appear instantly.

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAvailableRides, Ride } from '../lib/rides';

export function useDriverQueue(enabled: boolean) {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setRides([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    // Initial fetch
    (async () => {
      try {
        const initial = await fetchAvailableRides();
        if (!cancelled) {
          setRides(initial);
          setLoading(false);
        }
      } catch (e) {
        console.warn('[useDriverQueue] initial fetch failed', e);
        if (!cancelled) setLoading(false);
      }
    })();

    // Listen for new ride requests
    const channel = supabase
      .channel('driver-queue')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'rides' },
        (payload: { new: any; old: any; eventType: string }) => {
          const r = payload.new as Ride;
          if (r.status === 'matching' && !cancelled) {
            setRides((prev) => [r, ...prev]);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rides' },
        (payload: { new: any; old: any; eventType: string }) => {
          const r = payload.new as Ride;
          if (cancelled) return;
          // If the ride is no longer available, drop it from the queue
          if (r.status !== 'matching') {
            setRides((prev) => prev.filter((x) => x.id !== r.id));
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [enabled]);

  return { rides, loading };
}
