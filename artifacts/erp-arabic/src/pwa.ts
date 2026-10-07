/**
 * MKGH ERP — PWA helpers
 * - Service Worker registration
 * - Offline-aware fetch (never claims a state-changing request was saved
 *   while the server cannot verify its version)
 * - Legacy background sync replay with conflict protection
 * - Online/offline event broadcasting
 */

const SYNC_TAG  = 'mkgh-bg-sync';
const DB_NAME   = 'mkgh-pending';
const DB_STORE  = 'requests';

/* ── IDB helpers ── */

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      (e.target as IDBOpenDBRequest).result
        .createObjectStore(DB_STORE, { autoIncrement: true, keyPath: '_idbKey' });
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror   = (e) => reject((e.target as IDBOpenDBRequest).error);
  });
}

function idbSave(db: IDBDatabase, item: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(DB_STORE, 'readwrite');
    const req = tx.objectStore(DB_STORE).add(item);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

function idbGetAll(db: IDBDatabase): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror   = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(DB_STORE, 'readwrite');
    const req = tx.objectStore(DB_STORE).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/* ── Service Worker registration ── */

export function registerSW(): void {
  if (!('serviceWorker' in navigator)) return;

  const base = import.meta.env.BASE_URL ?? '/';

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(`${base}sw.js`, { scope: base });
      console.info('[PWA] Service Worker registered — scope:', reg.scope);

      /* Listen for SW messages (sync done notifications) */
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SYNC_DONE') {
          window.dispatchEvent(new CustomEvent('pwa:sync-done', { detail: event.data }));
        } else if (event.data?.type === 'SYNC_CONFLICT') {
          window.dispatchEvent(new CustomEvent('mkgh:stale-write', { detail: event.data }));
        }
      });
    } catch (err) {
      console.warn('[PWA] SW registration failed:', err);
    }
  });
}

/* ── Queue a failed request in IndexedDB ── */

async function queueRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | null,
): Promise<void> {
  const payload = { url, method, headers, body, savedAt: Date.now() };

  const sw = navigator.serviceWorker?.controller;
  if (sw) {
    sw.postMessage({ type: 'SAVE_PENDING', request: payload });
    try {
      const reg = await navigator.serviceWorker.ready;
      await (reg as unknown as { sync?: { register(tag: string): Promise<void> } }).sync?.register(SYNC_TAG);
    } catch { /* sync API not available */ }
  } else {
    try {
      const db = await idbOpen();
      await idbSave(db, payload);
    } catch { /* IDB not available */ }
  }
}

/**
 * Drop-in replacement for `fetch` on mutating endpoints.
 * - Online → behaves exactly like fetch
 * - Offline → rejects safely; stale mutations are never queued as successful
 */
export async function offlineFetch(url: string, options: RequestInit = {}): Promise<Response> {
  if (navigator.onLine) {
    try {
      return await fetch(url, options);
    } catch {
      /* Fall through to offline path on network error */
    }
  }

  return new Response(
    JSON.stringify({
      queued: false,
      error: 'الاتصال غير متاح — لم يتم الحفظ. أعد المحاولة بعد عودة الإنترنت حتى لا تُستبدل بيانات أحدث.',
    }),
    { status: 503, headers: { 'Content-Type': 'application/json' } },
  );
}

/* ── Replay from page when back online (fallback if SW sync not available) ── */

async function replayFromPage(): Promise<void> {
  let db: IDBDatabase;
  try { db = await idbOpen(); } catch { return; }

  const items = await idbGetAll(db);
  let replayed = 0;

  for (const item of items) {
    const i = item as { _idbKey: IDBValidKey; url: string; method: string; headers: Record<string,string>; body: string | null };
    const hasOriginalAuth = Object.keys(i.headers || {}).some(key => key.toLowerCase() === "authorization");
    if (!hasOriginalAuth) {
      await idbDelete(db, i._idbKey);
      window.dispatchEvent(new CustomEvent('mkgh:stale-write', { detail: { url: i.url } }));
      continue;
    }
    try {
      const res = await fetch(i.url, { method: i.method, headers: i.headers, body: i.body ?? undefined });
      if (res.status === 401 || res.status === 409 || res.status === 428) {
        window.dispatchEvent(new CustomEvent('mkgh:stale-write', { detail: { url: i.url } }));
      }
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        await idbDelete(db, i._idbKey);
        replayed++;
      }
    } catch { /* still offline */ }
  }

  if (replayed > 0) {
    window.dispatchEvent(new CustomEvent('pwa:sync-done', { detail: { replayed } }));
  }
}

/* ── Online/offline event listeners ── */

export function listenConnectivity(): void {
  window.addEventListener('online', () => {
    window.dispatchEvent(new Event('pwa:online'));
    navigator.serviceWorker?.ready
      .then(reg => (reg as unknown as { sync?: { register(tag: string): Promise<void> } }).sync?.register(SYNC_TAG))
      .catch(() => replayFromPage());
  });

  window.addEventListener('offline', () => {
    window.dispatchEvent(new Event('pwa:offline'));
  });
}
