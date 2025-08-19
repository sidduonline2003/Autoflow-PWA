// Simple offline queue using IndexedDB with localStorage fallback
// Stores write requests when offline and retries on reconnect.

const DB_NAME = 'autostudioflow_offline_db';
const STORE_NAME = 'request_queue';
let dbPromise = null;

function openDb() {
  if (!('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function addToQueue(payload) {
  const db = await openDb();
  const record = { ...payload, createdAt: Date.now() };
  if (!db) {
    // Fallback to localStorage
    const key = 'offlineQueue';
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    list.push(record);
    localStorage.setItem(key, JSON.stringify(list));
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllQueued() {
  const db = await openDb();
  if (!db) {
    const key = 'offlineQueue';
    return JSON.parse(localStorage.getItem(key) || '[]');
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function clearQueued(ids) {
  const db = await openDb();
  if (!db) {
    if (!ids) {
      localStorage.removeItem('offlineQueue');
      return;
    }
    const key = 'offlineQueue';
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    const remaining = list.filter((_, idx) => !ids.includes(idx));
    localStorage.setItem(key, JSON.stringify(remaining));
    return;
  }
  return new Promise(async (resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const all = await getAllQueued();
    const mapId = (rec) => rec.id;
    const toDelete = ids ? ids : all.map(mapId);
    toDelete.forEach((id) => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function queueOrSend(requestFn, payloadForQueue) {
  try {
    return await requestFn();
  } catch (e) {
    // Network or backend unavailable; queue it
    await addToQueue(payloadForQueue);
    return { queued: true };
  }
}

export async function flushQueue(processor) {
  const items = await getAllQueued();
  if (!items.length) return { flushed: 0 };
  let success = 0;
  const failedIds = [];
  for (const item of items) {
    try {
      await processor(item);
      success += 1;
    } catch (e) {
      failedIds.push(item.id);
    }
  }
  // Clear successfully processed items
  if (success) {
    const remainingIds = failedIds.length ? items.filter(i => !failedIds.includes(i.id)).map(i => i.id) : null;
    if (remainingIds) {
      await clearQueued(remainingIds);
    } else {
      await clearQueued();
    }
  }
  return { flushed: success, total: items.length };
}

// Hook up online event to auto-flush if caller registers a processor
export function registerAutoFlush(processor) {
  const handler = () => flushQueue(processor);
  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}
