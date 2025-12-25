// EZ Ink PWA Service Worker
// Version: 1.0.0

const CACHE_VERSION = 'v3';
const STATIC_CACHE = `ez-ink-static-${CACHE_VERSION}`;
const ARTICLE_CACHE = `ez-ink-articles-${CACHE_VERSION}`;
const FONT_CACHE = `ez-ink-fonts-${CACHE_VERSION}`;

// Static assets to precache
// Static assets to precache (includes both clean URLs and .html for compatibility)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/index',
  '/list.html',
  '/list',
  '/reader.html',
  '/reader',
  '/css/common.css',
  '/css/login.css',
  '/css/list.css',
  '/css/reader.css',
  '/js/config.js',
  '/js/auth.js',
  '/js/list.js',
  '/js/reader.js',
  '/js/offline-cache.js',
  '/js/common.js',
  '/lib/supabase.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-180.png',
  '/icons/favicon-96x96.png',
  '/icons/favicon.ico',
  '/icons/favicon.svg'
];

// Install event: Precache static assets with fault tolerance
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(async (cache) => {
        console.log('[SW] Precaching static assets individually');

        let successCount = 0;
        let failCount = 0;

        // Cache each asset individually so one failure doesn't break everything
        await Promise.all(
          STATIC_ASSETS.map(async (url) => {
            try {
              const response = await fetch(url);
              if (response.ok) {
                // IMPORTANT: If response was redirected (e.g. /reader -> /reader.html),
                // we must create a clean copy. Using a 'redirected' response to satisfy
                // a navigation request can fail in some browsers/environments.
                if (response.redirected) {
                  console.log(`[SW] Cleaning redirected response for: ${url}`);
                  const body = await response.blob();
                  const cleanResponse = new Response(body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers
                  });
                  await cache.put(url, cleanResponse);
                } else {
                  await cache.put(url, response);
                }
                successCount++;
              } else {
                console.warn(`[SW] Failed to fetch asset: ${url} (${response.status})`);
                failCount++;
              }
            } catch (error) {
              console.warn(`[SW] Failed to cache asset: ${url}`, error);
              failCount++;
            }
          })
        );

        console.log(`[SW] Precache complete. Success: ${successCount}, Failed: ${failCount}`);
      })
      .then(() => {
        return self.skipWaiting();
      })
  );
});

// Activate event: Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              return name.startsWith('ez-ink-') &&
                name !== STATIC_CACHE &&
                name !== ARTICLE_CACHE &&
                name !== FONT_CACHE;
            })
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated');
        return self.clients.claim();
      })
  );
});

// Fetch event: Intelligent routing
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Navigation requests: serve shell pages from cache regardless of search params
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(url));
    return;
  }

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // NEVER cache version.json - always fetch from network for update detection
  if (url.pathname === '/version.json') {
    event.respondWith(fetch(request));
    return;
  }

  // Strategy 1: Static assets - Cache First
  if (STATIC_ASSETS.some(asset => url.pathname === asset || url.pathname === asset + '/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  }
  // Strategy 2: Supabase API - Network First (with cache fallback)
  else if (url.hostname.includes('supabase.co')) {
    event.respondWith(networkFirst(request, ARTICLE_CACHE));
  }
  // Strategy 3: CDN fonts - Stale While Revalidate
  else if (url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('jsdelivr.net')) {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
  }
  // Default: Network only (for other requests)
  else {
    event.respondWith(fetch(request));
  }
});

// Cache First strategy (for static assets)
async function cacheFirst(request, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    // Try exact match first, then fall back to path-only match (ignoring search)
    const cached = (await cache.match(request)) || (await cache.match(request.url.split('?')[0]));

    if (cached) {
      console.log('[SW] Cache hit:', request.url);
      return cached;
    }

    console.log('[SW] Cache miss, fetching:', request.url);
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache first failed:', error);
    throw error;
  }
}

// Network First strategy (for API requests)
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    console.log('[SW] Network first, fetching:', request.url);
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      console.log('[SW] Caching API response:', request.url);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.warn('[SW] Network failed, trying cache:', request.url);
    const cached = await cache.match(request);

    if (cached) {
      console.log('[SW] Serving from cache:', request.url);
      return cached;
    }

    // Return offline response if no cache available
    console.error('[SW] No cache available for:', request.url);
    return new Response(
      JSON.stringify({
        error: 'Offline',
        message: 'No cached data available. Please check your connection.'
      }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Stale While Revalidate strategy (for fonts)
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Background fetch and cache update
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        console.log('[SW] Updating font cache:', request.url);
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch((error) => {
      console.warn('[SW] Font fetch failed:', request.url, error);
      return cached;
    });

  // Return cached version immediately, or wait for network
  return cached || fetchPromise;
}

// Handle navigation with cached shell fallback (ignores search params)
// Handle navigation with cached shell fallback (ignores search params)
async function handleNavigationRequest(url) {
  try {
    // Always try network first for navigation
    return await fetch(url.href);
  } catch (error) {
    console.warn('[SW] Navigation network failed, serving shell from cache:', url.href);
    const cache = await caches.open(STATIC_CACHE);

    // Determine the page type based on URL
    let page = 'index';
    if (url.pathname.includes('reader')) page = 'reader';
    else if (url.pathname.includes('list')) page = 'list';
    else if (url.pathname === '/' || url.pathname.includes('index')) page = 'index';

    // Try multiple possible cache keys for this page
    const possibleKeys = [
      `/${page}.html`, // Localhost style
      `/${page}`,      // Clean URL style
      url.pathname     // Exact path match
    ];

    if (page === 'index') {
      possibleKeys.push('/');
      possibleKeys.push('/index.html');
      possibleKeys.push('/index');
    }

    for (const key of possibleKeys) {
      const cached = await cache.match(key);
      if (cached) {
        console.log(`[SW] Served cached shell for navigation: ${key}`);
        return cached;
      }
    }

    // Last resort fallback
    return (await cache.match('/list.html')) || (await cache.match('/list')) || Response.error();
  }
}

// Listen for messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('ez-ink-'))
            .map((name) => caches.delete(name))
        );
      }).then(() => {
        return self.registration.unregister();
      })
    );
  }
});
