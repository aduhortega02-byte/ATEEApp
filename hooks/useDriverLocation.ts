import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { LatLng } from '../lib/maps';

export function useDriverLocation(driverId: string | null): LatLng | null {
  const [coords, setCoords] = useState<LatLng | null>(null);

  useEffect(() => {
    if (!driverId) { setCoords(null); return; }

    let cancelled = false;

    supabase
      .from('drivers')
      .select('current_lat, current_lng')
      .eq('user_id', driverId)
      .single()
      .then(({ data }) => {
        if (cancelled || !data?.current_lat || !data?.current_lng) return;
        setCoords({ lat: data.current_lat, lng: data.current_lng });
      });

    const channel = supabase
      .channel(`driver-location-${driverId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'drivers', filter: `user_id=eq.${driverId}` },
        (payload: { new: any }) => {
          const { current_lat, current_lng } = payload.new;
          if (current_lat != null && current_lng != null) {
            setCoords({ lat: current_lat, lng: current_lng });
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [driverId]);

  return coords;
}
