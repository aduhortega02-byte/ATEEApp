import { useEffect, useRef, useState } from 'react';
import { getDriverEtaToPickup, type LatLng } from '../lib/maps';

const ETA_POLL_MS = 30_000;

export type DriverEtaResult = { etaMin: number | null; distanceM: number | null };

// Calculates live driving ETA from the driver's current position to the pickup.
// Re-fetches from Google Distance Matrix every 30 seconds, always using the
// most recent driver coords (which update via Supabase Realtime separately).
export function useDriverEta(
  driverCoords: LatLng | null,
  pickupCoords: LatLng | null,
): DriverEtaResult {
  const [result, setResult] = useState<DriverEtaResult>({ etaMin: null, distanceM: null });
  const latestDriverRef = useRef<LatLng | null>(driverCoords);
  const startedRef = useRef(false);

  // Always keep the ref in sync with latest coords without re-triggering the effect
  useEffect(() => {
    latestDriverRef.current = driverCoords;
  }, [driverCoords]);

  useEffect(() => {
    if (!driverCoords || !pickupCoords) return;
    if (startedRef.current) return; // one interval per ride, don't restart on every coords update
    startedRef.current = true;

    const fetchEta = async () => {
      if (!latestDriverRef.current) return;
      const eta = await getDriverEtaToPickup(latestDriverRef.current, pickupCoords);
      if (eta) setResult(eta);
    };

    fetchEta(); // immediate on first coords arrival
    const timer = setInterval(fetchEta, ETA_POLL_MS);
    return () => {
      clearInterval(timer);
      startedRef.current = false;
    };
  }, [!!driverCoords, pickupCoords?.lat, pickupCoords?.lng]);

  return result;
}
