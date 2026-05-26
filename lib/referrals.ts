import { supabase } from './supabase';

const REFERRAL_URL_BASE = 'https://rideatee.com';

export function buildReferralLink(code: string): string {
  return `${REFERRAL_URL_BASE}?ref=${code}`;
}

export function buildShareText(code: string): string {
  return (
    `Join me on ATEE — the rideshare where passengers pay what they want and drivers keep 100%! 🚗\n\n` +
    `Use my invite code ${code} when signing up, or tap the link:\n` +
    `${buildReferralLink(code)}`
  );
}

export async function fetchMyReferralCode(): Promise<string | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('referral_code')
    .eq('id', u.user.id)
    .single();

  return (data as { referral_code: string | null } | null)?.referral_code ?? null;
}

export async function fetchReferralCount(): Promise<number> {
  const { data, error } = await supabase.rpc('count_my_referrals');
  if (error) return 0;
  return Number(data ?? 0);
}

export async function applyReferralCode(
  code: string,
): Promise<{ success: boolean; message: string }> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return { success: false, message: 'No code provided' };

  const { data, error } = await supabase.rpc('apply_referral_code', { p_code: trimmed });
  if (error) return { success: false, message: error.message };

  switch (data) {
    case 'success':
      return { success: true, message: 'Referral applied!' };
    case 'invalid_code':
      return { success: false, message: 'That referral code was not found.' };
    case 'self_referral':
      return { success: false, message: 'You cannot use your own referral code.' };
    case 'already_referred':
      return { success: true, message: 'Already referred — no change needed.' };
    default:
      return { success: false, message: 'Unexpected response.' };
  }
}
