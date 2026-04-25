import { useEffect, useState } from 'react';
import { fetchTodayStats, type TodayStats } from '../lib/driver';

export function useDriverTodayStats() {
  const [stats, setStats] = useState<TodayStats>({ earningsCents: 0, tripsCompleted: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchTodayStats()
      .then((s) => { if (!cancelled) { setStats(s); setLoading(false); } })
      .catch((e) => { console.warn('[useDriverTodayStats]', e); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { stats, loading };
}
