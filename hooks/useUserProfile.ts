import { useEffect, useState } from 'react';
import { fetchProfileById } from '../lib/profile';
import type { Profile } from '../lib/types';

type BasicProfile = Pick<Profile, 'id' | 'full_name' | 'rating' | 'total_trips'>;

export function useUserProfile(userId: string | null | undefined) {
  const [profile, setProfile] = useState<BasicProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    fetchProfileById(userId)
      .then((p) => { if (!cancelled) setProfile(p); })
      .catch((e) => console.warn('[useUserProfile]', e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  return { profile, loading };
}
