import { useCallback, useEffect, useState } from 'react';
import { fetchSavedLocations, type SavedLocation } from '../lib/savedLocations';

export function useSavedLocations() {
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSavedLocations();
      setLocations(data);
    } catch (e) {
      console.warn('[useSavedLocations]', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, []);

  return { locations, loading, refresh };
}
