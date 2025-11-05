import { useState, useEffect, useRef, useCallback } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { rtdb } from '../firebase';

const DEFAULT_STATE = Object.freeze({
  state: null,
  version: 0,
  activeUsers: [],
  lastAction: null
});

export function usePostProdLiveSync(orgId, eventId, stream, onVersionChange, { enabled = true } = {}) {
  const [liveState, setLiveState] = useState(DEFAULT_STATE.state);
  const [activeUsers, setActiveUsers] = useState(DEFAULT_STATE.activeUsers);
  const [lastAction, setLastAction] = useState(DEFAULT_STATE.lastAction);
  const [version, setVersion] = useState(DEFAULT_STATE.version);
  const [loading, setLoading] = useState(Boolean(enabled));

  const lastVersionRef = useRef(0);

  const handleSnapshot = useCallback(
    (snapshot) => {
      const payload = snapshot.val();
      if (!payload) {
        setLoading(false);
        return;
      }

      const nextState = payload.state ?? DEFAULT_STATE.state;
      const nextUsers = Array.isArray(payload.activeUsers) ? payload.activeUsers : DEFAULT_STATE.activeUsers;
      const nextAction = payload.lastAction ?? DEFAULT_STATE.lastAction;
      const nextVersion = Number(payload.version || 0);

      setLiveState(nextState);
      setActiveUsers(nextUsers);
      setLastAction(nextAction);
      setVersion(nextVersion);
      setLoading(false);

      if (nextVersion > 0 && nextVersion !== lastVersionRef.current) {
        lastVersionRef.current = nextVersion;
        if (typeof onVersionChange === 'function') {
          onVersionChange(nextVersion);
        }
      }
    },
    [onVersionChange]
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }
    if (!orgId || !eventId || !stream) {
      setLoading(false);
      return undefined;
    }

    const path = `organizations/${orgId}/postprod-live/${eventId}/streams/${stream}`;
    const dbRef = ref(rtdb, path);

    const unsubscribe = onValue(dbRef, handleSnapshot, (error) => {
      console.error('[usePostProdLiveSync] Listener error', error);
      setLoading(false);
    });

    return () => {
      off(dbRef, 'value', handleSnapshot);
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [orgId, eventId, stream, enabled, handleSnapshot]);

  return {
    liveState,
    activeUsers,
    lastAction,
    version,
    loading
  };
}

export default usePostProdLiveSync;
