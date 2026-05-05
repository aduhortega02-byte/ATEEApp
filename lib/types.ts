// lib/types.ts
// Central type definitions for the ATEE platform.
// All other files import from here — do not re-declare these types elsewhere.

import type { Session, User } from '@supabase/supabase-js';
export type { Session, User };

// ── Auth & Profiles ──────────────────────────────────────────

export type UserRole = 'passenger' | 'driver' | 'both';

export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  avatar_url: string | null;
  rating: number;
  total_trips: number;
  created_at: string;
};

// ── Drivers ──────────────────────────────────────────────────

export type Driver = {
  user_id: string;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  plate_number: string | null;
  is_online: boolean;
  current_lat: number | null;
  current_lng: number | null;
  is_verified: boolean;
  subscription_active: boolean;
  last_seen: string;
};

// ── KYC Documents ────────────────────────────────────────────

export type DocumentType =
  | 'drivers_license'
  | 'vehicle_registration'
  | 'vehicle_insurance'
  | 'profile_photo';

export type DocumentStatus = 'pending' | 'approved' | 'rejected';

export type DriverDocument = {
  id: string;
  driver_id: string;
  document_type: DocumentType;
  file_url: string;
  status: DocumentStatus;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  expires_at: string | null;
  uploaded_at: string;
};

// ── Subscriptions ────────────────────────────────────────────

export type SubscriptionStatus =
  | 'inactive'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled';

export type Subscription = {
  id: string;
  driver_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  plan_id: string;
  amount_cents: number;
  currency: string;
  created_at: string;
  updated_at: string;
};

// ── Payments ─────────────────────────────────────────────────

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export type Payment = {
  id: string;
  ride_id: string;
  passenger_id: string;
  driver_id: string;
  amount_cents: number;
  currency: string;
  stripe_payment_intent_id: string | null;
  status: PaymentStatus;
  created_at: string;
  completed_at: string | null;
};

// ── Wallets ──────────────────────────────────────────────────

export type WalletTxType = 'credit' | 'withdrawal';

export type DriverWallet = {
  id: string;
  driver_id: string;
  balance_cents: number;
  total_earned_cents: number;
  total_withdrawn_cents: number;
  total_cash_cents: number;
  total_etransfer_cents: number;
  trips_completed: number;
  trips_disputed: number;
  updated_at: string;
};

export type WalletTransaction = {
  id: string;
  wallet_id: string;
  type: WalletTxType;
  amount_cents: number;
  description: string | null;
  ride_id: string | null;
  created_at: string;
};

// ── Rides ────────────────────────────────────────────────────

export type RideStatus =
  | 'requested'
  | 'matching'
  | 'driver_assigned'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type PaymentMethod = 'cash' | 'etransfer';
export type RidePaymentStatus = 'pending' | 'paid' | 'disputed';

export type Ride = {
  id: string;
  passenger_id: string;
  driver_id: string | null;
  pickup_address: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  destination_address: string;
  destination_lat: number | null;
  destination_lng: number | null;
  offered_price: number;
  distance_mi: number | null;
  eta_min: number | null;
  status: RideStatus;
  payment_method: PaymentMethod | null;
  payment_status: RidePaymentStatus;
  scheduled_for: string | null;
  passenger_note: string | null;
  created_at: string;
  completed_at: string | null;
};

export type RideBid = {
  id: string;
  ride_id: string;
  driver_id: string;
  eta_min: number;
  status: 'accepted' | 'withdrawn' | 'chosen' | 'rejected';
  created_at: string;
  // Joined from profiles via fetchBidsForRide query
  driver?: Pick<Profile, 'full_name' | 'avatar_url' | 'rating' | 'total_trips'>;
};
