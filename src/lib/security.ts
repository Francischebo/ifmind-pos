// Security utilities for rate limiting, input validation, and enterprise security

import { ApiService } from '@/lib/api';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private limits = new Map<string, RateLimitEntry>();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number = 60000, maxRequests: number = 10) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry || now > entry.resetTime) {
      this.limits.set(key, { count: 1, resetTime: now + this.windowMs });
      return true;
    }

    if (entry.count >= this.maxRequests) {
      return false;
    }

    entry.count++;
    return true;
  }

  getRemainingTime(key: string): number {
    const entry = this.limits.get(key);
    if (!entry) return 0;
    return Math.max(0, entry.resetTime - Date.now());
  }
}

// Global rate limiter instances
export const apiRateLimiter = new RateLimiter(60000, 30); // 30 requests per minute
export const paymentRateLimiter = new RateLimiter(300000, 5); // 5 payment requests per 5 minutes

// Input validation functions
export const normalizeKenyanPhoneNumber = (phone: string): string | null => {
  const cleaned = String(phone ?? '').trim().replace(/\s+/g, '');
  if (!cleaned) return null;

  const withoutPlus = cleaned.replace(/^\+/, '');

  if (/^254[1-9]\d{8}$/.test(withoutPlus)) return withoutPlus;
  if (/^0[1-9]\d{8}$/.test(withoutPlus)) return `254${withoutPlus.slice(1)}`;
  if (/^[1-9]\d{8}$/.test(withoutPlus)) return `254${withoutPlus}`;

  return null;
};

export const validatePhoneNumber = (phone: string): boolean => {
  return normalizeKenyanPhoneNumber(phone) !== null;
};

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validateAmount = (amount: number): boolean => {
  return amount > 0 && amount <= 1000000 && Number.isFinite(amount); // Max 1M KSh
};

export const sanitizeInput = (input: string): string => {
  return input
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .trim()
    .slice(0, 255); // Limit length
};

export const validateProductData = (product: any): boolean => {
  return (
    product.name &&
    product.name.length > 0 &&
    product.name.length <= 100 &&
    validateAmount(product.retail_price) &&
    validateAmount(product.unit_cost) &&
    product.sku &&
    product.sku.length > 0 &&
    product.sku.length <= 50
  );
};

// Enhanced input validation with server-side validation schemas
export const validateInputWithSchema = async (data: any, schemaType: string): Promise<boolean> => {
  try {
    const result = await ApiService.post<{ valid: boolean }>('/auth/validate_input_data', {
      data,
      schemaType
    });

    return result.valid;
  } catch (error: any) {
    console.error('Input validation failed:', error);
    await logApplicationError('validation_error', error.message, { schema_type: schemaType, data });
    return false;
  }
};

// Secure local storage wrapper with encryption
export class SecureStorage {
  private static instance: SecureStorage;
  private keyPromise: Promise<CryptoKey> | null = null;

  static getInstance(): SecureStorage {
    if (!SecureStorage.instance) {
      SecureStorage.instance = new SecureStorage();
    }
    return SecureStorage.instance;
  }

  private getEncryptionKey(): Promise<CryptoKey> {
    if (!this.keyPromise) {
      this.keyPromise = (async () => {
        const storedKey = sessionStorage.getItem('pos_session_key');
        const material = storedKey || crypto.getRandomValues(new Uint8Array(32)).reduce((acc, x) => acc + x.toString(16).padStart(2, '0'), '');
        if (!storedKey) {
          sessionStorage.setItem('pos_session_key', material);
        }

        const keyBytes = new TextEncoder().encode(material.slice(0, 32));
        return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
      })();
    }
    return this.keyPromise;
  }

  async setItem(key: string, value: any): Promise<void> {
    try {
      const encrypted = await this.encryptData(JSON.stringify(value));
      localStorage.setItem(key, encrypted);
    } catch (error) {
      console.error('Failed to store item securely:', error);
      await logApplicationError('secure_storage_error', 'Failed to encrypt and store data', { key });
    }
  }

  async getItem(key: string): Promise<any> {
    try {
      const encrypted = localStorage.getItem(key);
      if (!encrypted) return null;
      const decrypted = await this.decryptData(encrypted);
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('Failed to retrieve item securely:', error);
      await logApplicationError('secure_storage_error', 'Failed to decrypt and retrieve data', { key });
      return null;
    }
  }

  removeItem(key: string): void {
    localStorage.removeItem(key);
  }

  clear(): void {
    localStorage.clear();
    sessionStorage.removeItem('pos_session_key');
  }

  private async encryptData(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const key = await this.getEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      dataBuffer
    );
    return btoa(JSON.stringify({ iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) }));
  }

  private async decryptData(encryptedData: string): Promise<string> {
    const { iv, data } = JSON.parse(atob(encryptedData));
    const key = await this.getEncryptionKey();
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      new Uint8Array(data)
    );
    return new TextDecoder().decode(decrypted);
  }
}

// API request wrapper with rate limiting and security
export const secureApiCall = async (
  apiCall: () => Promise<any>,
  rateLimiter: RateLimiter,
  key: string = 'default'
): Promise<any> => {
  if (!rateLimiter.isAllowed(key)) {
    const remainingTime = rateLimiter.getRemainingTime(key);
    await logSecurityEvent('rate_limit_exceeded', 'API rate limit exceeded', 'medium', {
      key,
      remaining_time: remainingTime
    });
    throw new Error(`Rate limit exceeded. Try again in ${Math.ceil(remainingTime / 1000)} seconds.`);
  }

  try {
    return await apiCall();
  } catch (error: any) {
    // Log the error securely
    await logApplicationError('api_call_error', error.message || 'API call failed', {
      endpoint: key,
      status: error.status
    });

    // Don't expose sensitive error details
    if (error.message?.includes('JWT') || error.message?.includes('token')) {
      throw new Error('Authentication error. Please log in again.');
    }
    if (error.message?.includes('permission') || error.message?.includes('unauthorized')) {
      throw new Error('You do not have permission to perform this action.');
    }
    throw new Error('An error occurred. Please try again.');
  }
};

// Error logging functions
export const logApplicationError = async (
  errorType: string,
  errorMessage: string,
  errorDetails?: any,
  severity: string = 'error',
  endpoint?: string,
  requestMethod?: string,
  requestBody?: any,
  stackTrace?: string
): Promise<void> => {
  try {
    await ApiService.post('/auth/log_application_error', {
      error_type: errorType,
      error_message: errorMessage,
      error_details: errorDetails,
      severity: severity,
      endpoint: endpoint,
      request_method: requestMethod,
      request_body: requestBody,
      stack_trace: stackTrace
    }).catch(() => { /* Silent fail for logs */ });
  } catch (error) {
    console.error('Failed to log application error:', error);
  }
};

export const logSecurityEvent = async (
  eventType: string,
  description: string,
  riskLevel: string = 'low',
  metadata?: any
): Promise<void> => {
  try {
    await ApiService.post('/auth/log_security_event', {
      event_type: eventType,
      description: description,
      risk_level: riskLevel,
      metadata: metadata
    }).catch(() => { /* Silent fail */ });
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
};

// PWA Security Functions
export class PWASecurity {
  private static instance: PWASecurity;
  private serviceWorker: ServiceWorker | null = null;

  static getInstance(): PWASecurity {
    if (!PWASecurity.instance) {
      PWASecurity.instance = new PWASecurity();
    }
    return PWASecurity.instance;
  }

  async initialize(): Promise<void> {
    if ('serviceWorker' in navigator) {
      if (import.meta.env.DEV) {
        // Enforce unregister in development to prevent Vite HMR caching issues causing refresh loops
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const reg of registrations) {
            await reg.unregister();
          }
          // Also clear caches in dev to break loops
          const cacheKeys = await caches.keys();
          for (const key of cacheKeys) {
            await caches.delete(key);
          }
          console.log('[PWA] Service workers unregistered and caches cleared in development mode to prevent HMR loops.');
        } catch(e) {
          console.error('Failed to clear SW / Cache in dev', e);
        }
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/'
        });

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New version available
                this.notifyUpdateAvailable();
              }
            });
          }
        });

        this.serviceWorker = registration.active;

        // Log PWA initialization
        await ApiService.post('/auth/log_pwa_security_event', {
          event_type: 'pwa_initialized',
          description: 'PWA service worker initialized successfully',
          sw_version: '1.0.0',
          cache_status: 'active',
          offline_capabilities: true
        }).catch(() => {});

      } catch (error: any) {
        console.error('Service Worker registration failed:', error);
        await logApplicationError('pwa_initialization_failed', 'Service Worker registration failed', { error: error.message });
      }
    }
  }

  async validateCacheIntegrity(): Promise<boolean> {
    try {
      const result = await ApiService.post<{ valid: boolean }>('/auth/validate_pwa_cache_integrity', {
        cache_manifest: await this.getCacheManifest()
      }).catch(() => ({ valid: true }));

      return result.valid;
    } catch (error) {
      console.error('Cache validation failed:', error);
      return false;
    }
  }

  private async getCacheManifest(): Promise<any> {
    // Get current cache manifest for validation
    const cacheNames = await caches.keys();
    const manifest = {};

    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();
      manifest[cacheName] = requests.map(r => r.url);
    }

    return manifest;
  }

  private notifyUpdateAvailable(): void {
    // Show update notification to user
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('POS System Update Available', {
        body: 'A new version is available. Please refresh to update.',
        icon: '/favicon.ico'
      });
    }
  }

  async clearCache(): Promise<void> {
    if (this.serviceWorker) {
      const messageChannel = new MessageChannel();
      this.serviceWorker.postMessage({ type: 'CLEAR_CACHE' }, [messageChannel.port2]);

      await new Promise((resolve, reject) => {
        messageChannel.port1.onmessage = (event) => {
          if (event.data.success) {
            resolve(void 0);
          } else {
            reject(new Error(event.data.error));
          }
        };
      });
    }
  }
}

// Session management
export class SessionManager {
  private static instance: SessionManager;
  private sessionId: string | null = null;
  private lastActivity: number = Date.now();

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  async initializeSession(): Promise<void> {
    this.sessionId = crypto.randomUUID();
    this.lastActivity = Date.now();

    // Store session in secure storage
    const secureStorage = SecureStorage.getInstance();
    await secureStorage.setItem('session_id', this.sessionId);
    await secureStorage.setItem('session_start', new Date().toISOString());

    // Set up activity tracking
    this.setupActivityTracking();
  }

  private setupActivityTracking(): void {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];

    const updateActivity = () => {
      this.lastActivity = Date.now();
    };

    events.forEach(event => {
      document.addEventListener(event, updateActivity, { passive: true });
    });

    // Check session expiry every minute
    setInterval(() => {
      this.checkSessionExpiry();
    }, 60000);
  }

  private async checkSessionExpiry(): Promise<void> {
    const sessionTimeout = 30 * 60 * 1000; // 30 minutes
    const now = Date.now();

    if (now - this.lastActivity > sessionTimeout) {
      await this.endSession('timeout');
    }
  }

  async endSession(reason: string = 'manual'): Promise<void> {
    if (this.sessionId) {
      await logSecurityEvent('session_ended', `User session ended: ${reason}`, 'low', {
        session_id: this.sessionId,
        reason
      });

      const secureStorage = SecureStorage.getInstance();
      await secureStorage.removeItem('session_id');
      await secureStorage.removeItem('session_start');

      this.sessionId = null;
    }
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  updateActivity(): void {
    this.lastActivity = Date.now();
  }
}

// Initialize security systems
export const initializeSecurity = async (): Promise<void> => {
  try {
    // Initialize PWA security
    const pwaSecurity = PWASecurity.getInstance();
    await pwaSecurity.initialize();

    // Initialize session management
    const sessionManager = SessionManager.getInstance();
    await sessionManager.initializeSession();

    // Validate cache integrity periodically
    setInterval(async () => {
      const pwaSecurity = PWASecurity.getInstance();
      await pwaSecurity.validateCacheIntegrity();
    }, 30 * 60 * 1000); // Every 30 minutes

    console.log('Security systems initialized successfully');
  } catch (error) {
    console.error('Failed to initialize security systems:', error);
    await logApplicationError('security_initialization_failed', 'Failed to initialize security systems', { error: error.message });
  }
};