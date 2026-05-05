import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Ride, RideStatus } from '../lib/rides';

export function useRideStatus(
  rideId: string | null,
  onStatusChange?: (status: RideStatus, ride: Ride) => void,
) {
  const [ride, setRide] = useState<Ride | null>(null);
  const [status, setStatus] = useState<RideStatus | null>(null);
  const prevStatusRef = useRef<RideStatus | null>(null);
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('rides')
        .select('*')
        .eq('id', rideId)
        .single();
      if (!error && !cancelled && data) {
        const r = data as Ride;
        setRide(r);
        setStatus(r.status);
        prevStatusRef.current = r.status;
      }
    })();

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
            if (r.status !== prevStatusRef.current) {
              onStatusChangeRef.current?.(r.status, r);
              prevStatusRef.current = r.status;
            }
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [rideId]);

  return { ride, status };
}
