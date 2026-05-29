// Input validation and sanitization for all user-supplied values.
// Apply at every system boundary: form submissions, API calls, DB writes.

const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE  = /^\+?[1-9]\d{6,14}$/;
const HTML_RE   = /<[^>]*>/g;
const SCRIPT_RE = /javascript\s*:/gi;

// ── Text sanitization ────────────────────────────────────────

/** Trim, strip HTML tags and javascript: URIs, enforce max length. */
export function sanitizeText(raw: string, maxLength = 500): string {
  return raw
    .trim()
    .replace(HTML_RE, '')
    .replace(SCRIPT_RE, '')
    .slice(0, maxLength);
}

export function sanitizeChatMessage(raw: string): string {
  return sanitizeText(raw, 1000);
}

export function sanitizePassengerNote(raw: string): string {
  return sanitizeText(raw, 280);
}

export function sanitizeTripDescription(raw: string): string {
  return sanitizeText(raw, 500);
}

export function sanitizeAddress(raw: string): string {
  return sanitizeText(raw, 300);
}

/** Referral codes: uppercase alphanumeric only. */
export function sanitizeReferralCode(raw: string): string {
  return raw.trim().replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 20);
}

// ── Validation — return null on success, error string on failure ──

export function validateEmail(email: string): string | null {
  const v = email.trim().toLowerCase();
  if (!v)            return 'Email is required';
  if (v.length > 254) return 'Email address is too long';
  if (!EMAIL_RE.test(v)) return 'Enter a valid email address';
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password)          return 'Password is required';
  if (password.length < 8)   return 'Password must be at least 8 characters';
  if (password.length > 128) return 'Password is too long';
  return null;
}

export function validateFullName(name: string): string | null {
  const v = name.trim();
  if (!v)           return 'Full name is required';
  if (v.length < 2)  return 'Name must be at least 2 characters';
  if (v.length > 100) return 'Name is too long (max 100 characters)';
  if (HTML_RE.test(v)) return 'Name contains invalid characters';
  return null;
}

/** Phone is optional — returns null if blank, validates format otherwise. */
export function validatePhone(phone: string): string | null {
  const v = phone.trim().replace(/[\s\-().]/g, '');
  if (!v) return null;
  if (!PHONE_RE.test(v))
    return 'Enter a valid phone number (e.g. +12345678901)';
  return null;
}

export function validateFare(price: number): string | null {
  if (!isFinite(price) || isNaN(price)) return 'Enter a valid fare';
  if (price < 1)    return 'Minimum fare is $1.00';
  if (price > 9999) return 'Maximum fare is $9,999.00';
  return null;
}

export function validateSeatCount(seats: number): string | null {
  if (!Number.isInteger(seats) || seats < 1 || seats > 8)
    return 'Seats must be between 1 and 8';
  return null;
}

export function validateNegotiationPrice(price: number): string | null {
  if (!isFinite(price) || isNaN(price)) return 'Enter a valid price';
  if (price <= 0)   return 'Price must be greater than $0';
  if (price > 9999) return 'Maximum price is $9,999.00';
  return null;
}