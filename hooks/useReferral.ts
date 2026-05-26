import { useEffect, useState } from 'react';
import { fetchMyReferralCode, fetchReferralCount } from '../lib/referrals';

type ReferralState = {
  referralCode: string | null;
  referralCount: number;
  loading: boolean;
};

export function useReferral() {
  const [state, setState] = useState<ReferralState>({
    referralCode: null,
    referralCount: 0,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchMyReferralCode(), fetchReferralCount()])
      .then(([code, count]) => {
        if (!cancelled) setState({ referralCode: code, referralCount: count, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, loading: false }));
      });

    return () => { cancelled = true; };
  }, []);

  return state;
}
