import { supabase } from './supabase';
import type { DriverWallet, Payment } from './types';

export type TodayStats = {
  earningsCents: number;
  tripsCompleted: number;
};

export type DriverStats = {
  total_earned_cents: number;
  total_cash_cents: number;
  total_etransfer_cents: number;
  trips_completed: number;
  trips_disputed: number;
};

export type EarningEntry = {
  id: string;
  destination: string;
  completed_at: string;
  amount_cents: number;
  payment_method: string | null;
};

export async function fetchTodayStats(): Promise<TodayStats> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { earningsCents: 0, tripsCompleted: 0 };

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('payments')
    .select('amount_cents')
    .eq('driver_id', user.user.id)
    .eq('status', 'completed')
    .gte('completed_at', startOfDay.toISOString());

  if (error) throw error;
  const rows = (data ?? []) as Pick<Payment, 'amount_cents'>[];
  const earningsCents = rows.reduce((sum, r) => sum + r.amount_cents, 0);
  return { earningsCents, tripsCompleted: rows.length };
}

export async function fetchDriverStats(): Promise<DriverStats> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return {
      total_earned_cents: 0,
      total_cash_cents: 0,
      total_etransfer_cents: 0,
      trips_completed: 0,
      trips_disputed: 0,
    };
  }

  const { data, error } = await supabase
    .from('driver_wallets')
    .select(
      'total_earned_cents, total_cash_cents, total_etransfer_cents, trips_completed, trips_disputed',
    )
    .eq('driver_id', user.user.id)
    .single();

  if (error) {
    return {
      total_earned_cents: 0,
      total_cash_cents: 0,
      total_etransfer_cents: 0,
      trips_completed: 0,
      trips_disputed: 0,
    };
  }

  const row = data as Pick<
    DriverWallet,
    | 'total_earned_cents'
    | 'total_cash_cents'
    | 'total_etransfer_cents'
    | 'trips_completed'
    | 'trips_disputed'
  >;
  return {
    total_earned_cents: row.total_earned_cents,
    total_cash_cents: row.total_cash_cents,
    total_etransfer_cents: row.total_etransfer_cents,
    trips_completed: row.trips_completed,
    trips_disputed: row.trips_disputed,
  };
}

export async function fetchWalletBalance(): Promise<number> {
  const stats = await fetchDriverStats();
  return stats.total_earned_cents;
}

export async function fetchRecentTransactions(limit = 10): Promise<EarningEntry[]> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return [];

  const { data: wallet } = await supabase
    .from('driver_wallets')
    .select('id')
    .eq('driver_id', user.user.id)
    .single();

  if (!wallet) return [];

  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('id, amount_cents, description, created_at, ride_id, rides(destination_address, payment_method)')
    .eq('wallet_id', wallet.id)
    .eq('type', 'credit')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    destination: row.rides?.destination_address ?? 'Unknown destination',
    completed_at: row.created_at,
    amount_cents: row.amount_cents,
    payment_method: row.rides?.payment_method ?? null,
  }));
}

export async function fetchRecentEarnings(limit = 10): Promise<EarningEntry[]> {
  return fetchRecentTransactions(limit);
}
