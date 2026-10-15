// Service Worker fürs Online-Duell: zeigt Push-Mitteilungen an und öffnet beim Antippen das Duell.
// Kein Offline-Cache, damit immer die aktuelle Version des Spiels geladen wird.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }
  // iOS verlangt, dass jede Push-Nachricht sichtbar angezeigt wird.
  event.waitUntil(self.registration.showNotification(data.title || 'Higher or Lower', {
    body: (data.body || '') + (data.code ? ` (Duell ${data.code})` : ''),
    tag: data.tag || 'hl-duell',
    renotify: true,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/duell', code: data.code || '' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const { url, code } = event.notification.data || {};
  const target = new URL(url || '/duell', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Ist das Duell schon offen, nur nach vorne holen; sonst das offene Fenster umleiten oder neu öffnen.
    const same = windows.find(w => code && w.url.includes('c=' + code));
    if (same) return same.focus();
    if (windows[0]) {
      await windows[0].focus();
      if ('navigate' in windows[0]) return windows[0].navigate(target);
    }
    return self.clients.openWindow(target);
  })());
});
