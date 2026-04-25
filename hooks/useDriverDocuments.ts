import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchMyDocuments, DriverDocument } from '../lib/kycDocs';

export function useDriverDocuments() {
  const [documents, setDocuments] = useState<DriverDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let userId: string | null = null;

    const refresh = async () => {
      try {
        const docs = await fetchMyDocuments();
        if (!cancelled) {
          setDocuments(docs);
          setLoading(false);
        }
      } catch (e) {
        console.warn('[useDriverDocuments] refresh failed', e);
        if (!cancelled) setLoading(false);
      }
    };

    (async () => {
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
      await refresh();
    })();

    const channel = supabase
      .channel('driver-docs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_documents' },
        (payload: { new: any; old: any; eventType: string }) => {
          const row = payload.new ?? payload.old;
          if (row && userId && row.driver_id === userId) refresh();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return { documents, loading, refresh: async () => setDocuments(await fetchMyDocuments()) };
}
