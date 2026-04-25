import { useEffect, useState } from 'react';
import { fetchWalletBalance, fetchRecentEarnings, type EarningEntry } from '../lib/driver';

export function useDriverWallet() {
  const [balanceCents, setBalanceCents] = useState(0);
  const [earnings, setEarnings] = useState<EarningEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchWalletBalance(), fetchRecentEarnings()])
      .then(([balance, earningsList]) => {
        if (!cancelled) {
          setBalanceCents(balance);
          setEarnings(earningsList);
          setLoading(false);
        }
      })
      .catch((e) => { console.warn('[useDriverWallet]', e); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { balanceCents, earnings, loading };
}
