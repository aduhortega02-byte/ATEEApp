import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useUnreadChatCount(rideId: string | null) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!rideId) { setCount(0); return; }
    let cancelled = false;
    let userId: string | null = null;

    const refresh = async () => {
      if (!userId) return;
      const { count: c } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('ride_id', rideId)
        .eq('recipient_id', userId)
        .is('read_at', null);
      if (!cancelled) setCount(c ?? 0);
    };

    (async () => {
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
      await refresh();
    })();

    const channel = supabase
      .channel(`chat-unread-${rideId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages', filter: `ride_id=eq.${rideId}` },
        () => { refresh(); },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [rideId]);

  return count;
}
