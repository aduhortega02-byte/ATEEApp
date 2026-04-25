// hooks/useRideStatus.ts
// Subscribes to a single ride's status changes. Used on Matching/Confirmed
// screens so the passenger auto-advances when the ride moves through states.

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Ride, RideStatus } from '../lib/rides';

export function useRideStatus(rideId: string | null) {
  const [ride, setRide] = useState<Ride | null>(null);
  const [status, setStatus] = useState<RideStatus | null>(null);

  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;

    // Initial fetch
    (async () => {
      const { data, error } = await supabase
        .from('rides')
        .select('*')
        .eq('id', rideId)
        .single();
      if (!error && !cancelled && data) {
        setRide(data as Ride);
        setStatus((data as Ride).status);
      }
    })();

    // Realtime
    const channel = supabase
      .channel(`ride-${rideId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${rideId}` },
        (payload: { new: any; old: any; eventType: string }) => {
          const r = payload.new as Ride;
          if (!cancelled) {
            setRide(r);
            setStatus(r.status);
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [rideId]);

  return { ride, status };
}
