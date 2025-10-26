const CACHE_NAME = 'sao-miguel-map-cache-v1'; // Zmień wersję, jeśli aktualizujesz zasoby
const urlsToCache = [
    '/', // Alias dla index.html
    'index.html',
    // Główne biblioteki Leaflet (możesz dodać więcej, jeśli używasz innych pluginów online)
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
    'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
    'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
    'https://unpkg.com/leaflet-terminator@1.0.0/L.Terminator.js',
    'https://cdnjs.cloudflare.com/ajax/libs/suncalc/1.8.0/suncalc.min.js',
    // Pliki PWA
    'manifest.json',
    'icon-192.png' // Ważne, aby ikona też była offline
];

// Instalacja Service Workera - cache'owanie podstawowych zasobów
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Otwarto cache:', CACHE_NAME);
                return cache.addAll(urlsToCache);
            })
            .catch(error => {
                console.error('Nie udało się zcache\'ować podstawowych zasobów podczas instalacji:', error);
            })
    );
});

// Aktywacja Service Workera - czyszczenie starych cache'y
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Usuwanie starego cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Przechwytywanie zapytań sieciowych
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    // Strategia: Cache-first dla podstawowych zasobów aplikacji (HTML, CSS, JS z urlsToCache)
    if (urlsToCache.includes(requestUrl.pathname) || urlsToCache.includes(requestUrl.href) || requestUrl.origin === self.location.origin) {
        event.respondWith(
            caches.match(event.request)
                .then(response => {
                    // Jeśli jest w cache, zwróć z cache
                    if (response) {
                        return response;
                    }
                    // Jeśli nie ma, pobierz z sieci, dodaj do cache i zwróć
                    return fetch(event.request).then(
                        networkResponse => {
                            // Sprawdź, czy odpowiedź jest poprawna
                            if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && networkResponse.type !== 'cors') {
                                return networkResponse;
                            }
                            // Sklonuj odpowiedź, bo może być użyta tylko raz
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => {
                                    cache.put(event.request, responseToCache);
                                });
                            return networkResponse;
                        }
                    ).catch(error => {
                         console.error('Fetch failed for app shell resource:', event.request.url, error);
                         // Możesz tu zwrócić stronę offline (jeśli masz)
                    });
                })
        );
    }
    // Strategia: Network-first, fallback to cache dla kafelków mapy i API pogody
    else if (requestUrl.hostname.includes('tile.openstreetmap.org') ||
             requestUrl.hostname.includes('tile.opentopomap.org') ||
             requestUrl.hostname.includes('api.openweathermap.org')) {
        event.respondWith(
            caches.open(CACHE_NAME).then(cache => {
                return fetch(event.request)
                    .then(networkResponse => {
                        // Jeśli się udało, zapisz w cache i zwróć
                         if (networkResponse && networkResponse.ok) {
                             cache.put(event.request, networkResponse.clone());
                         }
                        return networkResponse;
                    })
                    .catch(() => {
                        // Jeśli sieć zawiodła (offline), spróbuj pobrać z cache
                        return cache.match(event.request);
                    });
            })
        );
    }
    // Dla innych zapytań (np. obrazki pogody), po prostu pobieraj z sieci (lub cache, jeśli tam są)
    else {
         event.respondWith(
            caches.match(event.request)
                .then(response => {
                    return response || fetch(event.request);
                })
        );
    }
});