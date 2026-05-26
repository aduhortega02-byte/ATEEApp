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

    // Shared helper so both the initial fetch, polling, and realtime all go
    // through the same path. onStatusChange is skipped on the very first call
    // (prevStatusRef is null) to avoid spurious callbacks on mount.
    const applyRide = (r: Ride) => {
      if (cancelled) return;
      setRide(r);
      setStatus(r.status);
      if (r.status !== prevStatusRef.current) {
        console.log(
          `[useRideStatus] status change: ${prevStatusRef.current ?? 'init'} → ${r.status} (ride ${rideId})`,
        );
        if (prevStatusRef.current !== null) {
          onStatusChangeRef.current?.(r.status, r);
        }
        prevStatusRef.current = r.status;
      }
    };

    const fetchRide = async () => {
      const { data, error } = await supabase
        .from('rides')
        .select('*')
        .eq('id', rideId)
        .single();
      if (error) {
        console.warn(`[useRideStatus] fetch error (${rideId}):`, error.message);
        return;
      }
      if (data) applyRide(data as Ride);
    };

    fetchRide();

    // Random suffix prevents silent channel deduplication when two hook instances
    // run for the same rideId (React strict-mode double-mount, or two screens
    // both calling useRideStatus with the same id).
    const channelName = `ride-status-${rideId}-${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[useRideStatus] subscribing channel: ${channelName}`);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${rideId}` },
        (payload: { new: any; old: any; eventType: string }) => {
          console.log(
            `[useRideStatus] realtime UPDATE (${rideId}):`,
            payload.old?.status, '→', payload.new?.status,
          );
          applyRide(payload.new as Ride);
        },
      )
      .subscribe((subStatus, err) => {
        if (err) {
          console.warn(`[useRideStatus] channel ${channelName} error:`, err);
        } else {
          console.log(`[useRideStatus] channel ${channelName} → ${subStatus}`);
        }
      });

    // Polling fallback: catches status changes even when the rides table is not in
    // the supabase_realtime publication (the most common reason realtime doesn't fire).
    // Compares against prevStatusRef so onStatusChange fires exactly once per change.
    const pollInterval = setInterval(fetchRide, 4000);

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
      console.log(`[useRideStatus] cleaned up channel: ${channelName}`);
    };
  }, [rideId]);

  return { ride, status };
}
