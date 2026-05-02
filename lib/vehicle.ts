import { supabase } from './supabase';

export type Vehicle = {
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_color: string | null;
  plate_number: string | null;
  vehicle_total_seats: number | null;
  vehicle_updated_at: string | null;
};

export type VehicleInput = {
  make: string;
  model: string;
  year: number;
  color: string;
  plate: string;
  seats: number;
};

export function isVehicleComplete(v: Partial<Vehicle> | null | undefined): boolean {
  if (!v) return false;
  return Boolean(
    v.vehicle_make &&
    v.vehicle_model &&
    v.vehicle_year &&
    v.vehicle_color &&
    v.plate_number &&
    v.vehicle_total_seats,
  );
}

export async function fetchMyVehicle(): Promise<Vehicle | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await supabase
    .from('drivers')
    .select(
      'vehicle_make, vehicle_model, vehicle_year, vehicle_color, plate_number, vehicle_total_seats, vehicle_updated_at',
    )
    .eq('user_id', u.user.id)
    .maybeSingle();
  if (error) throw error;
  return (data as Vehicle) ?? null;
}

export async function fetchVehicleByDriverId(driverId: string): Promise<Vehicle | null> {
  const { data, error } = await supabase
    .from('drivers')
    .select(
      'vehicle_make, vehicle_model, vehicle_year, vehicle_color, plate_number, vehicle_total_seats, vehicle_updated_at',
    )
    .eq('user_id', driverId)
    .maybeSingle();
  if (error) throw error;
  return (data as Vehicle) ?? null;
}

export function formatVehicleDisplay(v: Vehicle | null | undefined): string | null {
  if (!v || !v.vehicle_make || !v.vehicle_model) return null;
  const parts: string[] = [`${v.vehicle_make} ${v.vehicle_model}`];
  if (v.vehicle_year) parts[0] += ` ${v.vehicle_year}`;
  if (v.vehicle_color) parts.push(v.vehicle_color);
  return parts.join(' · ');
}

export async function saveMyVehicle(v: VehicleInput): Promise<Vehicle> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not authenticated');

  const { error: upsertErr } = await supabase
    .from('drivers')
    .upsert({ user_id: u.user.id }, { onConflict: 'user_id' });
  if (upsertErr) throw upsertErr;

  const { data, error } = await supabase
    .from('drivers')
    .update({
      vehicle_make: v.make.trim(),
      vehicle_model: v.model.trim(),
      vehicle_year: v.year,
      vehicle_color: v.color.trim(),
      plate_number: v.plate.trim().toUpperCase(),
      vehicle_total_seats: v.seats,
    })
    .eq('user_id', u.user.id)
    .select(
      'vehicle_make, vehicle_model, vehicle_year, vehicle_color, plate_number, vehicle_total_seats, vehicle_updated_at',
    )
    .single();
  if (error) throw error;
  return data as Vehicle;
}
