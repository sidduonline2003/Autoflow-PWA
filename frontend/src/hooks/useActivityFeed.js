import { useState, useEffect, useCallback } from 'react';
import { ref, query, orderByChild, limitToLast, onValue, off, get } from 'firebase/database';
import { rtdb } from '../firebase';

const DEFAULT_LIMIT = 20;

export function useActivityFeed(orgId, eventId, limit = DEFAULT_LIMIT, { enabled = true } = {}) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [hasMore, setHasMore] = useState(false);

  const loadSnapshot = useCallback(
    (snapshot) => {
      const entries = [];
      if (snapshot && snapshot.exists()) {
        snapshot.forEach((child) => {
          entries.unshift({ id: child.key, ...child.val() });
        });
      }
      setActivities(entries);
      setHasMore(entries.length === limit);
      setLoading(false);
    },
    [limit]
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }
    if (!orgId || !eventId) {
      setLoading(false);
      return undefined;
    }

    const basePath = `organizations/${orgId}/postprod-live/${eventId}/recent-activity`;
    const dbRef = query(ref(rtdb, basePath), orderByChild('timestamp'), limitToLast(limit));

    const unsubscribe = onValue(dbRef, loadSnapshot, (error) => {
      console.error('[useActivityFeed] Listener error', error);
      setActivities([]);
      setHasMore(false);
      setLoading(false);
    });

    return () => {
      off(dbRef, 'value', loadSnapshot);
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [orgId, eventId, limit, enabled, loadSnapshot]);

  const refresh = useCallback(async () => {
    if (!enabled || !orgId || !eventId) return;

    const basePath = `organizations/${orgId}/postprod-live/${eventId}/recent-activity`;
    const dbRef = query(ref(rtdb, basePath), orderByChild('timestamp'), limitToLast(limit));

    try {
      const snapshot = await get(dbRef);
      loadSnapshot(snapshot);
    } catch (error) {
      console.error('[useActivityFeed] Refresh error', error);
    }
  }, [enabled, orgId, eventId, limit, loadSnapshot]);

  return {
    activities,
    loading,
    hasMore,
    refresh
  };
}

export default useActivityFeed;
