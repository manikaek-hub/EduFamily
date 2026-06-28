/* Service Worker for Family Flow notifications */

// Routes mapped by notification tag
const ROUTES = {
  'photo-reminder': '/photos',
  'homework-reminder': '/homework',
  'routine-reminder': '/routine',
  'quiz-reminder': '/quiz',
  'plan-reminder': '/progress',
  'test-notification': '/',
};

// Listen for messages from the main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag, url } = event.data;
    self.registration.showNotification(title, {
      body: body || '',
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: tag || 'family-flow',
      data: { url: url || '/' },
      vibrate: [200, 100, 200],
      requireInteraction: false,
    });
  }
});

// Handle notification click — open the right page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || ROUTES[event.notification.tag] || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if available
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Open new window
      return self.clients.openWindow(url);
    })
  );
});

// Activate immediately
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
