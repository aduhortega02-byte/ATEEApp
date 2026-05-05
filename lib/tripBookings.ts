import { supabase } from './supabase';

export type BookingStatus = 'confirmed' | 'cancelled';

export type TripBooking = {
  id: string;
  trip_id: string;
  passenger_id: string;
  seats_booked: number;
  total_price: number;
  payment_method: string;
  status: BookingStatus;
  passenger_note: string | null;
  created_at: string;
  cancelled_at: string | null;
};

export type BookSeatsInput = {
  tripId: string;
  seats: number;
  pricePerSeat: number;
  paymentMethod: string;
  note?: string;
};

export async function bookSeats(input: BookSeatsInput): Promise<TripBooking> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('trip_seat_bookings')
    .insert({
      trip_id: input.tripId,
      passenger_id: user.id,
      seats_booked: input.seats,
      total_price: input.seats * input.pricePerSeat,
      payment_method: input.paymentMethod,
      passenger_note: input.note ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as TripBooking;
}

export async function cancelBooking(bookingId: string): Promise<void> {
  const { error } = await supabase
    .from('trip_seat_bookings')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', bookingId);

  if (error) throw error;
}

export async function fetchMyBookings(): Promise<TripBooking[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('trip_seat_bookings')
    .select('*')
    .eq('passenger_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as TripBooking[];
}

export async function fetchBookingsForTrip(tripId: string): Promise<TripBooking[]> {
  const { data, error } = await supabase
    .from('trip_seat_bookings')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as TripBooking[];
}
