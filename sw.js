/* ================================================
   Wakeit Service Worker — v3.5
   CRITICAL FIX: Navigation uses network-first so new deploys
   are picked up immediately. Assets use cache-first.
   OneSignal runs in its own isolated scope (/push/onesignal/).
================================================ */

const CACHE_NAME = 'wakeit-v28'; // v28 = never cache supabase.co requests
const ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/offline.html'
  // NOTE: Do NOT pre-cache /index.html — navigation uses network-first
];

/* ── Install: cache static assets (NOT index.html) ── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

/* ── Activate: clear old caches ── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME && key !== 'wakeit-tones').map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* ── Fetch: network-first for navigation, cache-first for assets ── */
self.addEventListener('fetch', (event) => {
  // ── CRITICAL: Never intercept Supabase API calls — always hit network directly ──
  if (event.request.url.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  // NAVIGATION (page loads, refreshes, back/forward):
  // Use NETWORK-FIRST so new deployments are always picked up.
  // Fall back to cached /index.html only when truly offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch('/index.html', { cache: 'no-cache' })
        .then((response) => {
          // Cache the fresh response for offline use
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone));
          }
          return response;
        })
        .catch(() => {
          // Offline: serve cached index.html
          return caches.match('/index.html').then((cached) => {
            if (cached) return cached;
            return caches.match('/offline.html');
          });
        })
    );
    return;
  }

  // ASSETS (JS, CSS, images, fonts, etc.): cache-first with network fallback.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('/offline.html');
          }
        });
    })
  );
});

/* ── Push: handle incoming notifications ── */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try { data = event.data.json(); }
  catch (e) { data = { type: 'info', title: 'Wakeit', body: event.data.text() }; }

  /* ── type: 'alarm' — alarm is about to ring ── */
  if (data.type === 'alarm') {
    event.waitUntil(
      self.registration.showNotification(data.title || '⏰ Alarm Ringing!', {
        body: data.body || 'Your group alarm is ringing. Tap to open Wakeit.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'wakeit-alarm',
        requireInteraction: true,
        vibrate: [300, 100, 300, 100, 300],
        data: { url: '/#/alarm-ringing', type: 'alarm' },
        actions: [
          { action: 'open', title: '⏰ Open Wakeit' },
          { action: 'dismiss', title: '✖ Dismiss' },
        ],
      })
    );
  }

  /* ── type: 'nudge' — admin nudged a sleeping member ── */
  if (data.type === 'nudge') {
    event.waitUntil(
      self.registration.showNotification('⏰ Wake up!', {
        body: data.body || `${data.group_name || 'Your group'} admin is waiting. Open Wakeit to confirm you're awake!`,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'wakeit-nudge',
        requireInteraction: false,
        vibrate: [500, 200, 500],
        data: { url: '/#/alarm-ringing', type: 'nudge' },
      })
    );
  }

  /* ── type: 'new-alarm' — a new alarm was created for the group ── */
  if (data.type === 'new-alarm') {
    event.waitUntil(
      self.registration.showNotification('🔔 New Alarm Set', {
        body: data.body || 'A new alarm has been scheduled for your group.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'wakeit-new-alarm',
        data: { url: '/#/home', type: 'new-alarm' },
      })
    );
  }

  /* ── type: 'new-member' — someone joined the owner's group ── */
  if (data.type === 'new-member') {
    event.waitUntil(
      self.registration.showNotification('👥 New Member Joined', {
        body: data.body || 'Someone just joined your group.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'wakeit-member',
        data: { url: '/#/group-detail', type: 'new-member' },
      })
    );
  }

  /* ── Task D1 & D2: Schedule local notification from nightly-sync push ── */
  if (data.type === 'nightly-sync') {
    const timeString = data.time_string;
    if (timeString && 'showTrigger' in Notification.prototype) {
      const [hours, minutes] = timeString.split(':').map(Number);
      const now = new Date();
      let targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
      if (targetDate < now) {
        targetDate.setDate(targetDate.getDate() + 1);
      }

      event.waitUntil(
        self.registration.showNotification('⏰ Wakeit Alarm!', {
          body: 'Your alarm is ringing. Wake up!',
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: `wakeit-alarm-local-${data.alarm_id}`,
          requireInteraction: true,
          vibrate: [300, 100, 300, 100, 300],
          data: { url: '/#/alarm-ringing', type: 'alarm' },
          actions: [
            { action: 'open', title: '⏰ Open Wakeit' },
            { action: 'dismiss', title: '✖ Dismiss' },
          ],
          showTrigger: new TimestampTrigger(targetDate.getTime())
        })
      );
    }
  }
});

/* ── Message: SKIP_WAITING + schedule/cancel local notifications ── */
self.addEventListener('message', async (event) => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'schedule-local') {
    const timeString = event.data.time_string;
    if (timeString && 'showTrigger' in Notification.prototype) {
      const [hours, minutes] = timeString.split(':').map(Number);
      const now = new Date();
      let targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
      if (targetDate < now) {
        targetDate.setDate(targetDate.getDate() + 1);
      }

      await self.registration.showNotification('⏰ Wakeit Alarm!', {
        body: 'Your alarm is ringing. Wake up!',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: `wakeit-alarm-local-${event.data.alarm_id}`,
        requireInteraction: true,
        vibrate: [300, 100, 300, 100, 300],
        data: { url: '/#/alarm-ringing', type: 'alarm' },
        actions: [
          { action: 'open', title: '⏰ Open Wakeit' },
          { action: 'dismiss', title: '✖ Dismiss' },
        ],
        showTrigger: new TimestampTrigger(targetDate.getTime())
      });
    }
  }

  if (event.data.type === 'cancel-local') {
    const notifications = await self.registration.getNotifications({ tag: `wakeit-alarm-local-${event.data.alarm_id}` });
    notifications.forEach(n => n.close());
  }
});

/* ── Notification click: focus app or open it ── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  let url = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/#/alarm-ringing';

  if (event.action === 'open') url = '/#/alarm-ringing';
  if (event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'navigate', url });
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

/* ── Background sync (future use) ── */
self.addEventListener('sync', (event) => {
  if (event.tag === 'wakeit-alarm-sync') {
    console.log('[SW] Background sync: wakeit-alarm-sync');
  }
});
