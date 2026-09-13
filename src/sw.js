self.addEventListener('install', (e) => {
  console.log('Service Worker installed');
});

self.addEventListener('fetch', (e) => {
  // Pass network requests through normally for your PHP backend
  e.respondWith(fetch(e.request));
});