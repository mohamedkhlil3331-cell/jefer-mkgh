/* MKGH ERP — Service Worker v3 */

const CACHE_VERSION = 'mkgh-erp-v3';
const SYNC_TAG      = 'mkgh-bg-sync';
const DB_NAME       = 'mkgh-pending';
const DB_STORE      = 'requests';

/* ── Derive base path from SW location ── */
const BASE = self.location.pathname.replace(/sw\.js$/, '');

/* ── Install: cache app shell ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.add(BASE || '/'))
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: delete old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch strategy ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* Skip non-GET */
  if (request.method !== 'GET') return;
  /* Skip API calls — never cache, always network */
  if (url.pathname.startsWith('/api/')) return;
  /* Skip cross-origin (fonts, etc.) — let browser handle */
  if (url.origin !== self.location.origin) return;

  const isAsset = /\.(js|css|png|jpg|jpeg|svg|ico|woff2?|ttf)(\?.*)?$/.test(url.pathname);

  if (isAsset) {
    /* Cache-first: static assets have content hashes */
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then(c => c.put(request, clone));
          }
          return res;
        });
      })
    );
  } else {
    /* Network-first with cache fallback for HTML / navigation */
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(request)
            .then(cached => cached || caches.match(BASE || '/'))
        )
    );
  }
});

/* ═══════════════════════════════════════════════
   IndexedDB helpers for pending (offline) requests
   ═══════════════════════════════════════════════ */

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(DB_STORE, { autoIncrement: true, keyPath: '_idbKey' });
    };
    req.onsuccess  = e => resolve(e.target.result);
    req.onerror    = e => reject(e.target.error);
  });
}

function idbGetAll(db) {
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(DB_STORE, 'readonly');
    const store = tx.objectStore(DB_STORE);
    const req   = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

function idbDelete(db, key) {
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const req   = store.delete(key);
    req.onsuccess = resolve;
    req.onerror   = () => reject(req.error);
  });
}

function idbSave(db, item) {
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const req   = store.add(item);
    req.onsuccess = resolve;
    req.onerror   = () => reject(req.error);
  });
}

/* ═══════════════════════════════════════
   Background Sync
   ═══════════════════════════════════════ */

self.addEventListener('sync', event => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(replayPending());
  }
});

async function replayPending() {
  let db;
  try { db = await idbOpen(); } catch { return; }

  const items = await idbGetAll(db);
  for (const item of items) {
    const hasOriginalAuth = Object.keys(item.headers || {})
      .some(key => key.toLowerCase() === 'authorization');
    if (!hasOriginalAuth) {
      await idbDelete(db, item._idbKey);
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(c => c.postMessage({
        type: 'SYNC_CONFLICT',
        url: item.url,
        status: 401,
      }));
      continue;
    }
    try {
      const res = await fetch(item.url, {
        method:  item.method,
        headers: item.headers || {},
        body:    item.body ?? undefined,
      });
      /* Remove from queue on success or 4xx (don't retry client errors) */
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        await idbDelete(db, item._idbKey);
        /* Notify all open windows */
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach(c => c.postMessage({
          type: (res.status === 401 || res.status === 409 || res.status === 428) ? 'SYNC_CONFLICT' : 'SYNC_DONE',
          url:  item.url,
          status: res.status,
        }));
      }
    } catch {
      /* Still offline — leave in queue */
    }
  }
}

/* ═══════════════════════════════════════
   Message handler — save pending request
   ═══════════════════════════════════════ */

self.addEventListener('message', async event => {
  if (event.data?.type === 'SAVE_PENDING') {
    try {
      const db = await idbOpen();
      await idbSave(db, event.data.request);
      await self.registration.sync.register(SYNC_TAG);
    } catch {
      /* Background sync not supported — replay on next online event */
    }
  }
});

/* Chat and order web-push delivery; existing cache and background-sync flows stay unchanged. */
self.addEventListener('push', event => {
  if (!event.data) return;
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data.json(); }
    catch { payload = { body: event.data.text() }; }
    const data = payload.data || {};
    const title = payload.title || (data.kind === 'order' ? 'تحديث طلب' : 'رسالة عمل جديدة');
    const options = {
      body: payload.body || data.body || 'لديك تحديث جديد في نظام MKGH.',
      icon: `${BASE}icons/icon-192.png`,
      badge: `${BASE}icons/icon-192.png`,
      tag: data.tag || data.conversation_id ? `mkgh-${data.tag || `chat-${data.conversation_id}`}` : 'mkgh-update',
      data: {
        url: data.url || payload.url || (data.conversation_id ? `${BASE}chat?conversation=${encodeURIComponent(data.conversation_id)}` : `${BASE}notifications`),
        kind: data.kind || 'chat',
      },
    };
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const requested = event.notification.data?.url || `${BASE}chat`;
  let target;
  try {
    const parsed = new URL(requested, self.location.origin);
    target = parsed.origin === self.location.origin ? parsed.href : new URL(`${BASE}chat`, self.location.origin).href;
  } catch {
    target = new URL(`${BASE}chat`, self.location.origin).href;
  }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(target);
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
