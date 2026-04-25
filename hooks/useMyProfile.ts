import { useEffect, useState } from 'react';
import { fetchMyProfile } from '../lib/profile';
import type { Profile } from '../lib/types';

export function useMyProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchMyProfile()
      .then((p) => { if (!cancelled) { setProfile(p); setLoading(false); } })
      .catch((e) => { console.warn('[useMyProfile]', e); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { profile, loading };
}
