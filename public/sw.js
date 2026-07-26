// Secure Service Worker for PWA with Enterprise Security
// This service worker implements security measures for offline-first POS system

const CACHE_NAME = 'pos-v1.0.2';
const API_CACHE_NAME = 'pos-api-v1.0.2';

// Security: Define authorized origins and endpoints
const AUTHORIZED_ORIGINS = [
  self.location.origin,
  'https://*.supabase.co',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:8080',
  'http://127.0.0.1:8080'
];

// Security: Sensitive endpoints that should never be cached
const SENSITIVE_ENDPOINTS = [
  /\/auth/,
  /\/admin/,
  /\/api\/.*\/sensitive/,
  /\/api\/.*\/payment/,
  /\/api\/.*\/financial/
];

// Security: Maximum cache age for sensitive data (5 minutes)
const MAX_SENSITIVE_CACHE_AGE = 5 * 60 * 1000;

// Install event - cache essential resources
self.addEventListener('install', (event) => {
  console.log('[SW] Install event');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        const urlsToCache = [
          '/',
          '/manifest.json',
          '/favicon.ico',
        ];
        
        // Fetch to bypass HTTP browser cache completely so we don't grab old headers
        return Promise.all(
          urlsToCache.map(url => {
            return fetch(new Request(url, { cache: 'reload' }))
              .then(response => {
                if (!response.ok) throw new Error(`Failed to cache ${url}`);
                return cache.put(url, response);
              });
          })
        );
      })
      .then(() => {
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Cache installation failed:', error);
        // Log security event
        logSecurityEvent('sw_install_failed', { error: error.message });
      })
  );
});

// Activate event - clean up old caches and claim clients
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');

  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Take control of all clients
      self.clients.claim()
    ]).then(() => {
      logSecurityEvent('sw_activated', { cache_name: CACHE_NAME });
    })
  );
});

// Fetch event - handle requests with security checks
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;

  const isAllowedOrigin = AUTHORIZED_ORIGINS.some(origin => {
    if (origin.includes('*')) {
      const parts = origin.split('*');
      return url.origin.startsWith(parts[0]) && url.origin.endsWith(parts[1]);
    }
    return origin === url.origin;
  });

  // CRITICAL FIX: Never intercept Vite HMR or Dev Server internal polling!
  if (url.pathname.includes('@vite') || url.pathname.includes('node_modules') || url.pathname.includes('__vite_ping') || url.search.includes('import')) {
    return;
  }

  if (!isAllowedOrigin && !isSameOrigin) {
    console.warn('[SW] Blocked request to unauthorized origin:', url.origin);
    logSecurityEvent('unauthorized_origin_blocked', {
      origin: url.origin,
      url: event.request.url
    });
    return;
  }

  // Security: Check if this is a sensitive endpoint
  const isSensitiveEndpoint = SENSITIVE_ENDPOINTS.some(pattern => pattern.test(url.pathname));

  if (isSensitiveEndpoint) {
    // For sensitive endpoints, use network-first with short cache
    event.respondWith(
      handleSensitiveRequest(event.request)
    );
  } else if (event.request.method === 'GET' && (isSameOrigin || url.origin.includes('supabase'))) {
    // CRITICAL FIX: Do not cache localhost/127.0.0.1 in development to prevent Vite HMR infinite reload loops!
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
       return; 
    }

    // For regular requests, use cache-first strategy
    event.respondWith(
      handleRegularRequest(event.request)
    );
  }
});

// Handle sensitive requests (network-first with security)
async function handleSensitiveRequest(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);

    // CRITICAL FIX: Only attempt to put into cache if it's a GET request.
    // CacheStorage API strictly throws TypeError for POST/PUT/DELETE.
    if (request.method !== 'GET') {
      return networkResponse;
    }

    // Clone the response for caching and validation
    const responseClone = networkResponse.clone();

    // Validate response headers for security
    const contentSecurityPolicy = networkResponse.headers.get('content-security-policy');
    const strictTransportSecurity = networkResponse.headers.get('strict-transport-security');

    if (!contentSecurityPolicy || !strictTransportSecurity) {
      const urlObj = new URL(request.url);
      if (urlObj.hostname !== 'localhost' && urlObj.hostname !== '127.0.0.1') {
        logSecurityEvent('missing_security_headers', {
          url: request.url,
          csp: !!contentSecurityPolicy,
          hsts: !!strictTransportSecurity
        });
      }
    }

    // Cache with short expiration
    const cache = await caches.open(API_CACHE_NAME);
    const cacheResponse = new Response(responseClone.body, {
      status: responseClone.status,
      statusText: responseClone.statusText,
      headers: {
        ...responseClone.headers,
        'sw-cache-time': new Date().toISOString(),
        'sw-cache-type': 'sensitive',
        'cache-control': `max-age=${MAX_SENSITIVE_CACHE_AGE / 1000}`
      }
    });

    cache.put(request, cacheResponse);

    return networkResponse;
  } catch (error) {
    console.error('[SW] Network request failed for sensitive endpoint:', error);

    // Try cache as fallback, but check if it's still valid
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      const cacheTime = new Date(cachedResponse.headers.get('sw-cache-time') || 0);
      const age = Date.now() - cacheTime.getTime();

      if (age < MAX_SENSITIVE_CACHE_AGE) {
        logSecurityEvent('sensitive_cache_used', {
          url: request.url,
          cache_age: age
        });
        return cachedResponse;
      } else {
        // Cache expired, don't use it
        await caches.delete(request);
      }
    }

    // Return offline response for sensitive endpoints
    return new Response(
      JSON.stringify({
        error: 'Network unavailable',
        offline: true,
        timestamp: new Date().toISOString()
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Handle regular requests (cache-first)
async function handleRegularRequest(request) {
  // Try cache first
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    // Fetch from network
    const networkResponse = await fetch(request);

    // Cache successful GET requests
    if (request.method === 'GET' && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error('[SW] Network request failed:', error);

    // Return offline fallback for navigation requests
    if (request.mode === 'navigate') {
      const cache = await caches.open(CACHE_NAME);
      return cache.match('/offline.html') || new Response('Offline', { status: 503 });
    }

    throw error;
  }
}

// Security event logging function
function logSecurityEvent(eventType, details) {
  // In a real implementation, this would send to your logging endpoint
  console.log('[SW Security]', eventType, details);

  // Queue for later sending when online
  const securityEvent = {
    type: eventType,
    details,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: self.location.href
  };

  // Store in IndexedDB or send to server when possible
  if ('indexedDB' in self) {
    storeSecurityEvent(securityEvent);
  }
}

// Store security events in IndexedDB
function storeSecurityEvent(securityEvent) {
  const request = indexedDB.open('pos-security-events', 1);

  request.onupgradeneeded = (event) => {
    const db = event.target.result;
    if (!db.objectStoreNames.contains('events')) {
      db.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
    }
  };

  request.onsuccess = (event) => {
    const db = event.target.result;
    const transaction = db.transaction(['events'], 'readwrite');
    const store = transaction.objectStore('events');
    store.add(securityEvent);
  };
}

// Message event handler for communication with main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'GET_CACHE_INFO') {
    // Send cache information back to main thread
    caches.keys().then((cacheNames) => {
      event.ports[0].postMessage({
        cacheNames,
        currentCache: CACHE_NAME,
        apiCache: API_CACHE_NAME
      });
    });
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    // Clear all caches
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => caches.delete(cacheName))
      );
    }).then(() => {
      event.ports[0].postMessage({ success: true });
    }).catch((error) => {
      event.ports[0].postMessage({ error: error.message });
    });
  }
});

// Periodic cleanup of expired cache entries
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'cache-cleanup') {
    event.waitUntil(cleanupExpiredCache());
  }
});

async function cleanupExpiredCache() {
  const cache = await caches.open(API_CACHE_NAME);
  const keys = await cache.keys();

  for (const request of keys) {
    const response = await cache.match(request);
    if (response) {
      const cacheTime = new Date(response.headers.get('sw-cache-time') || 0);
      const age = Date.now() - cacheTime.getTime();

      if (age > MAX_SENSITIVE_CACHE_AGE) {
        await cache.delete(request);
        logSecurityEvent('expired_cache_cleaned', { url: request.url, age });
      }
    }
  }
}