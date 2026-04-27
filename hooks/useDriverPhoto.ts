import { useEffect, useState } from 'react';
import { fetchDriverPhotoUrl } from '../lib/profilePhoto';

export function useDriverPhoto(driverId: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!driverId);

  useEffect(() => {
    if (!driverId) { setUrl(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    fetchDriverPhotoUrl(driverId).then((u) => {
      if (!cancelled) { setUrl(u); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [driverId]);

  return { url, loading };
}
