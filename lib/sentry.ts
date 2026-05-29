// Sentry error tracking + performance monitoring.
// Call initSentry() once at app startup (in _layout.tsx).
// Call setSentryUser() after sign-in; clearSentryUser() after sign-out.

import * as Sentry from '@sentry/react-native';

export function initSentry() {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,

    // Disabled in development — avoids noise during local testing.
    enabled: !__DEV__,

    // Capture 20 % of sessions for performance (adjust up once you have volume).
    tracesSampleRate: 0.2,

    // Tag every event with the JS bundle release so you can correlate
    // errors to specific OTA updates / EAS builds.
    release: process.env.EXPO_PUBLIC_APP_VERSION ?? 'unknown',

    // Never send these to Sentry — keep PII out of error reports.
    beforeSend(event) {
      // Strip any email / phone that may leak through exception messages.
      if (event.message) {
        event.message = event.message
          .replace(/\b[\w.+-]+@[\w-]+\.\w{2,}\b/g, '[email]')
          .replace(/\+?[\d\s\-().]{7,}/g, '[phone]');
      }
      return event;
    },
  });
}

/**
 * Set non-PII user context after sign-in.
 * Only attaches user ID and role — never email, phone, or name.
 */
export function setSentryUser(userId: string, role: 'passenger' | 'driver' | 'both') {
  Sentry.setUser({ id: userId });
  Sentry.setTag('user_role', role);
}

/** Clear Sentry context on sign-out. */
export function clearSentryUser() {
  Sentry.setUser(null);
  Sentry.setTag('user_role', null);
}

/**
 * Wrap an async operation in a Sentry performance span.
 *
 * Usage:
 *   const result = await withSpan('ride.book', async () => {
 *     return await createRide(params);
 *   });
 */
export async function withSpan<T>(
  name: string,
  op: () => Promise<T>,
): Promise<T> {
  return Sentry.startSpan({ name, op: 'app.flow' }, op);
}

/** Capture a handled error with optional extra context. */
export function captureError(err: unknown, context?: Record<string, unknown>) {
  if (context) Sentry.setContext('extra', context);
  Sentry.captureException(err);
}