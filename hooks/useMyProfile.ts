import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMyProfile } from '../lib/profile';
import { supabase } from '../lib/supabase';
import { QK, CACHE_TTL } from '../lib/queryClient';

export function useMyProfile() {
  const queryClient = useQueryClient();

  const { data: profile, isLoading: loading, refetch } = useQuery({
    queryKey: QK.myProfile,
    queryFn: fetchMyProfile,
    staleTime: CACHE_TTL.profile,
  });

  // Realtime: invalidate cache when the user's profile row is updated.
  useEffect(() => {
    let userId: string | null = null;

    supabase.auth.getUser().then(({ data }) => {
      userId = data.user?.id ?? null;
    });

    const channel = supabase
      .channel('my-profile-rq')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload: { new: any }) => {
          if (userId && payload.new?.id === userId) {
            queryClient.invalidateQueries({ queryKey: QK.myProfile });
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return { profile: profile ?? null, loading, refresh: refetch };
}