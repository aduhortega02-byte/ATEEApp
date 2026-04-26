import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchMessagesForRide, markMessagesRead, type ChatMessage } from '../lib/chat';

export function useChatMessages(rideId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!rideId) { setMessages([]); setLoading(false); return; }
    let cancelled = false;

    (async () => {
      try {
        const initial = await fetchMessagesForRide(rideId);
        if (!cancelled) { setMessages(initial); setLoading(false); }
        await markMessagesRead(rideId);
      } catch (e) {
        console.warn('[useChatMessages] initial fetch failed', e);
        if (!cancelled) setLoading(false);
      }
    })();

    const channel = supabase
      .channel(`chat-${rideId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `ride_id=eq.${rideId}` },
        (payload: { new: ChatMessage }) => {
          if (!cancelled) {
            setMessages((prev) => [...prev, payload.new]);
            markMessagesRead(rideId).catch(() => {});
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [rideId]);

  return { messages, loading };
}
