import { supabase } from './supabase';
import { notifyUser } from './notifications';

export type ChatMessageType = 'text' | 'location' | 'quick_reply';

export type ChatMessage = {
  id: string;
  ride_id: string;
  sender_id: string;
  recipient_id: string;
  type: ChatMessageType;
  body: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  read_at: string | null;
};

export async function sendTextMessage(
  rideId: string,
  recipientId: string,
  body: string,
): Promise<ChatMessage> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ ride_id: rideId, sender_id: u.user.id, recipient_id: recipientId, type: 'text', body })
    .select()
    .single();
  if (error) throw error;
  notifyUser(recipientId, 'New message', body.length > 80 ? body.slice(0, 77) + '…' : body);
  return data as ChatMessage;
}

export async function sendLocationMessage(
  rideId: string,
  recipientId: string,
  lat: number,
  lng: number,
  label?: string,
): Promise<ChatMessage> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      ride_id: rideId,
      sender_id: u.user.id,
      recipient_id: recipientId,
      type: 'location',
      lat,
      lng,
      body: label ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ChatMessage;
}

export async function sendQuickReply(
  rideId: string,
  recipientId: string,
  label: string,
): Promise<ChatMessage> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      ride_id: rideId,
      sender_id: u.user.id,
      recipient_id: recipientId,
      type: 'quick_reply',
      body: label,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ChatMessage;
}

export async function fetchMessagesForRide(rideId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('ride_id', rideId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}

export async function markMessagesRead(rideId: string): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase
    .from('chat_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('ride_id', rideId)
    .eq('recipient_id', u.user.id)
    .is('read_at', null);
}
