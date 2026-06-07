/* ================================================
   Wakeit Service Worker — v3.5
   CRITICAL FIX: Navigation uses network-first so new deploys
   are picked up immediately. Assets use cache-first.
   OneSignal runs in its own isolated scope (/push/onesignal/).
================================================ */

const CACHE_NAME = 'wakeit-v44'; // v44 = prevent alarm re-triggering after member already dismissed (alarm_wake_status gate in triggerAlarm + initAlarmRinging)
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
  // ── SUPABASE STORAGE: Cache public tone files for offline playback ──
  // Match URLs like: https://xxx.supabase.co/storage/v1/object/public/user_data/...
  if (event.request.url.includes('supabase.co/storage/v1/object/public')) {
    event.respondWith(
      caches.open('wakeit-tones').then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached; // serve from cache immediately
        try {
          const response = await fetch(event.request);
          if (response && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        } catch (e) {
          // Offline fallback: serve cached version if available
          return cached || new Response('', { status: 503 });
        }
      })
    );
    return;
  }

  // ── CRITICAL: Never intercept other Supabase API calls — always hit network directly ──
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
  if (data.type === 'alarm' || data.type === 'alarm-ring') {
    event.waitUntil(
      self.registration.showNotification(data.title || ' Alarm Ringing!', {
        body: data.body || 'Your group alarm is ringing. Tap to open Wakeit.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'wakeit-alarm',
        requireInteraction: true,
        vibrate: [300, 100, 300, 100, 300],
        data: { url: '/#/alarm-ringing', type: 'alarm' },
        actions: [
          { action: 'open', title: ' Open Wakeit' },
          { action: 'dismiss', title: '✖ Dismiss' },
        ],
      })
    );
  }

  /* ── type: 'nudge' — admin nudged a sleeping member ── */
  if (data.type === 'nudge') {
    event.waitUntil(
      self.registration.showNotification(' Wake up!', {
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
      self.registration.showNotification(' New Alarm Set', {
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
      self.registration.showNotification(' New Member Joined', {
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
        self.registration.showNotification(' Wakeit Alarm!', {
          body: 'Your alarm is ringing. Wake up!',
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: `wakeit-alarm-local-${data.alarm_id}`,
          requireInteraction: true,
          vibrate: [300, 100, 300, 100, 300],
          data: { url: '/#/alarm-ringing', type: 'alarm' },
          actions: [
            { action: 'open', title: ' Open Wakeit' },
            { action: 'dismiss', title: '✖ Dismiss' },
          ],
          showTrigger: new TimestampTrigger(targetDate.getTime())
        })
      );
    }
  }
});

const activeTimeouts = new Map(); // alarm_id -> timeout_id

/* ── Message: SKIP_WAITING + schedule/cancel local notifications ── */
self.addEventListener('message', async (event) => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'schedule-local') {
    const alarmId = event.data.alarm_id;
    const alarmTime = event.data.alarm_time; // UTC millisecond timestamp
    const clockOffset = event.data.clockOffset || 0;

    // Clear any existing backup timeout for this alarm
    if (activeTimeouts.has(alarmId)) {
      clearTimeout(activeTimeouts.get(alarmId));
      activeTimeouts.delete(alarmId);
    }

    // Calculate delay
    const serverNow = Date.now() + clockOffset;
    const delay = alarmTime - serverNow - 3000; // 3 seconds early buffer, matching client

    if (delay > 0 && delay <= 5 * 60 * 1000) {
      console.log('[SW] Scheduling backup setTimeout for alarm:', alarmId, 'delay:', delay, 'ms');

      // Use event.waitUntil to keep the service worker alive
      event.waitUntil(
        new Promise((resolve) => {
          const tid = setTimeout(async () => {
            activeTimeouts.delete(alarmId);
            console.log('[SW] Backup setTimeout fired for alarm:', alarmId);

            // Check if notification is already showing
            const notifications = await self.registration.getNotifications();
            const alreadyShowing = notifications.some(n => 
              n.tag === 'wakeit-alarm' && n.data && n.data.alarm_id === alarmId
            );

            if (!alreadyShowing) {
              await self.registration.showNotification('⏰ Wakeit Alarm!', {
                body: 'Your group alarm is ringing. Wake up!',
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: 'wakeit-alarm',
                requireInteraction: true,
                vibrate: [300, 100, 300, 100, 300],
                data: { url: '/#/alarm-ringing', type: 'alarm', alarm_id: alarmId },
                actions: [
                  { action: 'open', title: ' Open Wakeit' },
                  { action: 'dismiss', title: '✖ Dismiss' },
                ],
              });
              console.log('[SW] Displayed backup alarm notification for alarm:', alarmId);
            }
            resolve();
          }, delay);
          activeTimeouts.set(alarmId, tid);
        })
      );
    }
  }

  if (event.data.type === 'cancel-local') {
    const alarmId = event.data.alarm_id;
    if (activeTimeouts.has(alarmId)) {
      clearTimeout(activeTimeouts.get(alarmId));
      activeTimeouts.delete(alarmId);
      console.log('[SW] Cancelled backup setTimeout for alarm:', alarmId);
    }
    // Also close any showing notifications for this alarm
    const notifications = await self.registration.getNotifications();
    notifications.forEach(n => {
      if (n.data && n.data.alarm_id === alarmId) {
        n.close();
      }
    });
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
