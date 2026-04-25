import { useEffect, useState } from 'react';
import { fetchRecentRidesForPassenger } from '../lib/passenger';
import type { Ride } from '../lib/types';

export function usePassengerRecentRides() {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchRecentRidesForPassenger()
      .then((data) => { if (!cancelled) { setRides(data); setLoading(false); } })
      .catch((e) => { console.warn('[usePassengerRecentRides]', e); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { rides, loading };
}
