import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchVehicleByDriverId, formatVehicleDisplay, type Vehicle } from '../lib/vehicle';

export function useDriverVehicle(driverId: string | null | undefined) {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [driverName, setDriverName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!driverId) return;
    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetchVehicleByDriverId(driverId),
      supabase
        .from('profiles')
        .select('full_name')
        .eq('id', driverId)
        .maybeSingle()
        .then(({ data }) => (data as { full_name: string | null } | null)?.full_name ?? null),
    ])
      .then(([v, name]) => {
        if (!cancelled) {
          setVehicle(v);
          setDriverName(name);
        }
      })
      .catch((e) => console.warn('[useDriverVehicle]', e))
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [driverId]);

  return {
    vehicle,
    driverName,
    loading,
    displayString: formatVehicleDisplay(vehicle),
    seats: vehicle?.vehicle_total_seats ?? null,
    plate: vehicle?.plate_number ?? null,
  };
}
