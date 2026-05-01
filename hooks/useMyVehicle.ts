import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchMyVehicle, isVehicleComplete, type Vehicle } from '../lib/vehicle';

export function useMyVehicle() {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const v = await fetchMyVehicle();
      setVehicle(v);
    } catch (e) {
      console.warn('[useMyVehicle] refresh failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let userId: string | null = null;

    (async () => {
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
      if (!cancelled) await refresh();
    })();

    const channel = supabase
      .channel('my-vehicle')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'drivers' },
        (payload: { new: any; old: any; eventType: string }) => {
          if (userId && payload.new?.user_id === userId) refresh();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return {
    vehicle,
    loading,
    refresh,
    isComplete: isVehicleComplete(vehicle),
  };
}
