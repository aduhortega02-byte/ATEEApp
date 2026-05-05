import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchBookingsForTrip, type TripBooking } from '../lib/tripBookings';

export function useTripBookings(tripId: string | null) {
  const [bookings, setBookings] = useState<TripBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tripId) { setBookings([]); setLoading(false); return; }
    let cancelled = false;

    (async () => {
      try {
        const data = await fetchBookingsForTrip(tripId);
        if (!cancelled) { setBookings(data); setLoading(false); }
      } catch (e) {
        console.warn('[useTripBookings] fetch failed', e);
        if (!cancelled) setLoading(false);
      }
    })();

    const channel = supabase
      .channel(`trip-bookings-${tripId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trip_seat_bookings', filter: `trip_id=eq.${tripId}` },
        async () => {
          if (cancelled) return;
          try {
            const data = await fetchBookingsForTrip(tripId);
            if (!cancelled) setBookings(data);
          } catch {}
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [tripId]);

  return { bookings, loading };
}
