import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useUnreadChatCount(
  rideId: string | null,
  onNewMessage?: (body: string, senderId: string) => void,
) {
  const [count, setCount] = useState(0);
  const userIdRef = useRef<string | null>(null);
  const onNewMessageRef = useRef(onNewMessage);

  useEffect(() => {
    onNewMessageRef.current = onNewMessage;
  }, [onNewMessage]);

  useEffect(() => {
    if (!rideId) { setCount(0); return; }
    let cancelled = false;

    const refresh = async () => {
      if (!userIdRef.current) return;
      const { count: c } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('ride_id', rideId)
        .eq('recipient_id', userIdRef.current)
        .is('read_at', null);
      if (!cancelled) setCount(c ?? 0);
    };

    (async () => {
      const { data } = await supabase.auth.getUser();
      userIdRef.current = data.user?.id ?? null;
      await refresh();
    })();

    const channel = supabase
      .channel(`chat-unread-${rideId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages', filter: `ride_id=eq.${rideId}` },
        (payload: { new: any; old: any; eventType: string }) => {
          refresh();
          if (
            payload.eventType === 'INSERT' &&
            payload.new?.recipient_id === userIdRef.current
          ) {
            onNewMessageRef.current?.(payload.new?.body ?? '', payload.new?.sender_id ?? '');
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [rideId]);

  return count;
}
