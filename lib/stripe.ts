// Web stub — @stripe/stripe-react-native is native-only.
// Metro resolves lib/stripe.native.ts on iOS/Android and this file on web.
import type { ReactNode } from 'react';

// Accept (and ignore) all props the real StripeProvider accepts
interface ProviderProps {
  children: ReactNode;
  publishableKey?: string;
  merchantIdentifier?: string;
  [key: string]: unknown;
}

export function StripeProvider({ children }: ProviderProps) {
  return children as unknown as React.ReactElement;
}

// Error shape compatible with how initPaymentSheet / presentPaymentSheet are called
type ShimError = { message: string; code: string } | undefined;

export function useStripe() {
  return {
    initPaymentSheet: async (_opts: unknown): Promise<{ error: ShimError }> =>
      ({ error: undefined }),
    presentPaymentSheet: async (): Promise<{ error: ShimError }> =>
      ({ error: undefined }),
  };
}
