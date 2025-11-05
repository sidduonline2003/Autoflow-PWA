import { useState, useEffect, useCallback, useRef } from 'react';
import { getJob } from '../api/postprod.api';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const defaultCache = {
  data: null,
  timestamp: 0,
  versions: { photo: 0, video: 0 }
};

export function usePostProdCache(eventId, { autoLoad = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(eventId) && autoLoad);
  const [error, setError] = useState(null);
  const cacheRef = useRef({ ...defaultCache });

  const loadFromApi = useCallback(
    async (nextPhotoVersion, nextVideoVersion, force = false) => {
      if (!eventId) {
        setLoading(false);
        return null;
      }

      const now = Date.now();
      const cached = cacheRef.current;

      if (!force) {
        const cacheValid =
          cached.data &&
          (nextPhotoVersion === undefined || cached.versions.photo === nextPhotoVersion) &&
          (nextVideoVersion === undefined || cached.versions.video === nextVideoVersion) &&
          now - cached.timestamp < CACHE_TTL_MS;

        if (cacheValid) {
          setData(cached.data);
          setLoading(false);
          return cached.data;
        }
      }

      try {
        setLoading(true);
        const response = await getJob(eventId);
        const resolvedPhotoVersion =
          nextPhotoVersion ?? (response?.photo?.version ?? cached.versions.photo ?? 0);
        const resolvedVideoVersion =
          nextVideoVersion ?? (response?.video?.version ?? cached.versions.video ?? 0);

        cacheRef.current = {
          data: response,
          timestamp: now,
          versions: {
            photo: resolvedPhotoVersion,
            video: resolvedVideoVersion
          }
        };

        setData(response);
        setError(null);
        return response;
      } catch (err) {
        console.error('[usePostProdCache] Failed to load job overview', err);
        setError(err?.message || 'Failed to load post-production job');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [eventId]
  );

  const fetchIfNeeded = useCallback(
    async (photoVersion, videoVersion) => loadFromApi(photoVersion, videoVersion, false),
    [loadFromApi]
  );

  const forceRefresh = useCallback(async () => {
    cacheRef.current = { ...defaultCache };
    return loadFromApi(undefined, undefined, true);
  }, [loadFromApi]);

  useEffect(() => {
    if (!eventId) {
      setData(null);
      setLoading(false);
      return;
    }
    cacheRef.current = { ...defaultCache };
    if (autoLoad) {
      forceRefresh().catch(() => undefined);
    } else {
      setLoading(false);
    }
  }, [eventId, forceRefresh, autoLoad]);

  return {
    data,
    loading,
    error,
    fetchIfNeeded,
    forceRefresh,
    cacheState: cacheRef.current
  };
}

export default usePostProdCache;
