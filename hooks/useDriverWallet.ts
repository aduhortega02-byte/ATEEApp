import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { fetchDriverStats, fetchRecentTransactions } from '../lib/driver';
import { QK, CACHE_TTL } from '../lib/queryClient';

async function fetchWallet() {
  const [stats, earnings] = await Promise.all([
    fetchDriverStats(),
    fetchRecentTransactions(100),
  ]);
  return { ...stats, earnings };
}

export function useDriverWallet() {
  const queryClient = useQueryClient();

  const { data, isLoading: loading } = useQuery({
    queryKey: QK.driverWallet,
    queryFn: fetchWallet,
    staleTime: CACHE_TTL.wallet,
  });

  // Realtime: invalidate when a wallet row changes.
  useEffect(() => {
    let cancelled = false;
    const channel = supabase
      .channel('driver-wallet-rq')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'driver_wallets' },
        () => {
          if (!cancelled) queryClient.invalidateQueries({ queryKey: QK.driverWallet });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return {
    totalEarnedCents:    data?.total_earned_cents    ?? 0,
    totalCashCents:      data?.total_cash_cents      ?? 0,
    totalEtransferCents: data?.total_etransfer_cents ?? 0,
    tripsCompleted:      data?.trips_completed       ?? 0,
    tripsDisputed:       data?.trips_disputed        ?? 0,
    earnings:            data?.earnings              ?? [],
    loading,
    balanceCents:        data?.total_earned_cents    ?? 0,
  };
}