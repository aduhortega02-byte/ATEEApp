import { useCallback, useEffect, useState } from 'react';
import { fetchMyProfile } from '../lib/profile';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';

export function useMyProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const p = await fetchMyProfile();
      setProfile(p);
    } catch (e) {
      console.warn('[useMyProfile] refresh failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let userId: string | null = null;
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
      if (!cancelled) await refresh();
    })();

    const channel = supabase
      .channel('my-profile')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload: { new: any; old: any; eventType: string }) => {
          if (userId && payload.new?.id === userId) refresh();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { profile, loading, refresh };
}
