import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  fetchMessagesForRide,
  markMessagesRead,
  sendTextMessage,
  type ChatMessage,
} from '../lib/chat';

type OptimisticMessage = ChatMessage & { _optimistic?: boolean };

export function useChatMessages(rideId: string | null, onNewMessage?: (msg: ChatMessage) => void) {
  const [messages, setMessages] = useState<OptimisticMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const onNewMessageRef = useRef(onNewMessage);
  const myUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    onNewMessageRef.current = onNewMessage;
  }, [onNewMessage]);

  // Cache the current user ID for optimistic message attribution.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      myUserIdRef.current = data.user?.id ?? null;
    });
  }, []);

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
            setMessages((prev) => {
              // Drop the matching optimistic placeholder if present.
              const withoutOptimistic = prev.filter(
                (m) => !(m._optimistic && m.sender_id === payload.new.sender_id && m.body === payload.new.body),
              );
              // Avoid true duplicates (message already confirmed).
              if (withoutOptimistic.some((m) => m.id === payload.new.id)) return withoutOptimistic;
              return [...withoutOptimistic, payload.new];
            });
            markMessagesRead(rideId).catch(() => {});
            onNewMessageRef.current?.(payload.new);
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [rideId]);

  /**
   * Optimistically send a text message.
   * The message appears in the list immediately; if the server call fails
   * the optimistic entry is removed and the error is re-thrown.
   */
  const sendOptimistic = useCallback(
    async (recipientId: string, body: string): Promise<ChatMessage> => {
      if (!rideId) throw new Error('No active ride');

      const tempId = `opt-${Date.now()}`;
      const optimistic: OptimisticMessage = {
        id: tempId,
        ride_id: rideId,
        sender_id: myUserIdRef.current ?? '',
        recipient_id: recipientId,
        type: 'text',
        body,
        lat: null,
        lng: null,
        created_at: new Date().toISOString(),
        read_at: null,
        _optimistic: true,
      };

      setMessages((prev) => [...prev, optimistic]);

      try {
        const confirmed = await sendTextMessage(rideId, recipientId, body);
        // Realtime will deliver the confirmed message and remove the optimistic one.
        return confirmed;
      } catch (err) {
        // Roll back the optimistic entry.
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        throw err;
      }
    },
    [rideId],
  );

  return { messages, loading, sendOptimistic };
}