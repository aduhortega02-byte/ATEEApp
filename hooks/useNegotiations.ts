import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { RideNegotiation } from '../lib/types';

/**
 * Passenger view: live stream of ALL negotiations for a ride across all drivers.
 * Delivers inserts and updates in real-time; sorted ascending by created_at.
 */
export function useRideNegotiations(rideId: string | null): RideNegotiation[] {
  const [negotiations, setNegotiations] = useState<RideNegotiation[]>([]);

  useEffect(() => {
    if (!rideId) { setNegotiations([]); return; }
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from('ride_negotiations')
        .select('*')
        .eq('ride_id', rideId)
        .order('created_at', { ascending: true });
      if (!cancelled && data) setNegotiations(data as RideNegotiation[]);
    })();

    const ch = supabase
      .channel(`neg-ride-${rideId}-${Math.random().toString(36).slice(2, 7)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ride_negotiations', filter: `ride_id=eq.${rideId}` },
        (payload: { new: any; old: any; eventType: string }) => {
          if (cancelled) return;
          if (payload.eventType === 'INSERT') {
            setNegotiations((prev) => [...prev, payload.new as RideNegotiation]);
          } else if (payload.eventType === 'UPDATE') {
            setNegotiations((prev) =>
              prev.map((n) => (n.id === payload.new.id ? (payload.new as RideNegotiation) : n)),
            );
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [rideId]);

  return negotiations;
}

/**
 * Driver view: live stream of negotiations between this driver and a specific ride.
 * Filters realtime events to only this driver's thread.
 */
export function useDriverNegotiations(rideId: string | null, driverId: string | null): RideNegotiation[] {
  const [negotiations, setNegotiations] = useState<RideNegotiation[]>([]);

  useEffect(() => {
    if (!rideId || !driverId) { setNegotiations([]); return; }
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from('ride_negotiations')
        .select('*')
        .eq('ride_id', rideId)
        .eq('driver_id', driverId)
        .order('created_at', { ascending: true });
      if (!cancelled && data) setNegotiations(data as RideNegotiation[]);
    })();

    const ch = supabase
      .channel(`neg-driver-${rideId}-${driverId}-${Math.random().toString(36).slice(2, 7)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ride_negotiations', filter: `ride_id=eq.${rideId}` },
        (payload: { new: any; old: any; eventType: string }) => {
          if (cancelled) return;
          const row = payload.new as RideNegotiation;
          if (row.driver_id !== driverId) return;
          if (payload.eventType === 'INSERT') {
            setNegotiations((prev) => [...prev, row]);
          } else if (payload.eventType === 'UPDATE') {
            setNegotiations((prev) => prev.map((n) => (n.id === row.id ? row : n)));
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [rideId, driverId]);

  return negotiations;
}
