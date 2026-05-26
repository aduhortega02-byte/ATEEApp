import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchDriverStats, fetchRecentTransactions, type EarningEntry, type DriverStats } from '../lib/driver';

type WalletState = DriverStats & {
  earnings: EarningEntry[];
  loading: boolean;
};

export function useDriverWallet() {
  const [state, setState] = useState<WalletState>({
    total_earned_cents: 0,
    total_cash_cents: 0,
    total_etransfer_cents: 0,
    trips_completed: 0,
    trips_disputed: 0,
    earnings: [],
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [stats, earnings] = await Promise.all([
          fetchDriverStats(),
          fetchRecentTransactions(100),
        ]);
        if (!cancelled) setState({ ...stats, earnings, loading: false });
      } catch (e) {
        console.warn('[useDriverWallet]', e);
        if (!cancelled) setState((s) => ({ ...s, loading: false }));
      }
    }

    load();

    // Keep wallet stats live via Realtime
    const channel = supabase
      .channel('driver_wallet_live')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'driver_wallets' },
        () => { if (!cancelled) load(); },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    totalEarnedCents: state.total_earned_cents,
    totalCashCents: state.total_cash_cents,
    totalEtransferCents: state.total_etransfer_cents,
    tripsCompleted: state.trips_completed,
    tripsDisputed: state.trips_disputed,
    earnings: state.earnings,
    loading: state.loading,
    // kept for any remaining callers that used the old name
    balanceCents: state.total_earned_cents,
  };
}
