import { supabase } from './supabase';
import type { DriverWallet, Payment } from './types';

export type TodayStats = {
  earningsCents: number;
  tripsCompleted: number;
};

export type EarningEntry = {
  id: string;
  destination: string;
  completed_at: string;
  amount_cents: number;
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

export async function fetchWalletBalance(): Promise<number> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return 0;

  const { data, error } = await supabase
    .from('driver_wallets')
    .select('balance_cents')
    .eq('driver_id', user.user.id)
    .single();

  if (error) return 0;
  return (data as Pick<DriverWallet, 'balance_cents'>).balance_cents;
}

export async function fetchRecentEarnings(limit = 10): Promise<EarningEntry[]> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return [];

  const { data, error } = await supabase
    .from('payments')
    .select('id, amount_cents, completed_at, rides(destination_address)')
    .eq('driver_id', user.user.id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    destination: row.rides?.destination_address ?? 'Unknown destination',
    completed_at: row.completed_at,
    amount_cents: row.amount_cents,
  }));
}
