import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchMyBookings, type TripBooking } from '../lib/tripBookings';

export function useMyBookings() {
  const [bookings, setBookings] = useState<TripBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const data = await fetchMyBookings();
        if (!cancelled) setBookings(data);
      } catch (e) {
        console.warn('[useMyBookings] fetch failed', e);
      }
    };

    (async () => {
      const { data } = await supabase.auth.getUser();
      userIdRef.current = data.user?.id ?? null;
      await refresh();
      if (!cancelled) setLoading(false);
    })();

    const channel = supabase
      .channel('my-bookings')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trip_seat_bookings' },
        (payload: { new: any }) => {
          if (cancelled) return;
          if (payload.new?.passenger_id === userIdRef.current || !payload.new?.passenger_id) {
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

  return { bookings, loading };
}
