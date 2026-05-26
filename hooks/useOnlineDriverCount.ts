import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type DriverAvailability = {
  count: number;
  loading: boolean;
  available: boolean; // true = at least 1 driver online (or fetch errored)
};

export function useOnlineDriverCount(): DriverAvailability {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  // On fetch error we fail open — never block passengers due to a query failure
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchCount = async () => {
      try {
        const { count: n, error } = await supabase
          .from('drivers')
          .select('*', { count: 'exact', head: true })
          .eq('is_online', true);
        if (error) throw error;
        if (!cancelled) {
          setCount(n ?? 0);
          setFetchError(false);
        }
      } catch {
        // Fail open: keep stale count and mark error so available stays true
        if (!cancelled) setFetchError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchCount();

    // Stay live: re-fetch when any driver row changes.
    // GPS updates fire every ~10 s — debounce so we don't spam the DB.
    const channel = supabase
      .channel('online_driver_count')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'drivers' },
        () => {
          if (cancelled) return;
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            if (!cancelled) fetchCount();
          }, 2000);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  return { count, loading, available: fetchError || count > 0 };
}
