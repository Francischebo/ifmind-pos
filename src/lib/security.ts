// Security utilities for rate limiting, input validation, and enterprise security

import { ApiRequestError, ApiService } from '@/lib/api';

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

interface ProductValidationInput {
  name: string;
  retail_price: number;
  unit_cost: number;
  sku: string;
}

export const validateProductData = (product: ProductValidationInput): boolean => {
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
export const validateInputWithSchema = async (data: unknown, schemaType: string): Promise<boolean> => {
  try {
    const result = await ApiService.post<{ valid: boolean }>('/auth/validate_input_data', {
      data,
      schemaType
    });

    return result.valid;
  } catch (error) {
    console.error('Input validation failed:', error);
    await logApplicationError(
      'validation_error',
      error instanceof Error ? error.message : 'Unknown validation error',
      { schema_type: schemaType, data },
    );
    return false;
  }
};

// Multi-tab safe origin-isolated local storage wrapper using browser IndexedDB
const SECURE_STORAGE_DB_NAME = 'cfi_pos_secure_storage';
const SECURE_STORAGE_DB_VERSION = 1;
const SECURE_STORAGE_STORE_NAME = 'keyval';

export class SecureStorage {
  private static instance: SecureStorage;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private memoryFallback = new Map<string, unknown>();

  static getInstance(): SecureStorage {
    if (!SecureStorage.instance) {
      SecureStorage.instance = new SecureStorage();
    }
    return SecureStorage.instance;
  }

  private getDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      if (typeof indexedDB === 'undefined') {
        return Promise.reject(new Error('IndexedDB is not supported in this environment'));
      }
      this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(SECURE_STORAGE_DB_NAME, SECURE_STORAGE_DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(SECURE_STORAGE_STORE_NAME)) {
            db.createObjectStore(SECURE_STORAGE_STORE_NAME);
          }
        };
        request.onsuccess = () => {
          // Clean up legacy per-tab session key if present
          try {
            sessionStorage.removeItem('pos_session_key');
          } catch {
            // Ignore access errors
          }
          resolve(request.result);
        };
        request.onerror = () => {
          reject(request.error || new Error('Failed to open secure storage DB'));
        };
      });
    }
    return this.dbPromise;
  }

  async setItem(key: string, value: unknown): Promise<void> {
    try {
      const db = await this.getDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(SECURE_STORAGE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(SECURE_STORAGE_STORE_NAME);
        const req = store.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      this.memoryFallback.set(key, value);
    } catch {
      this.memoryFallback.set(key, value);
    }
  }

  async getItem<T = unknown>(key: string): Promise<T | null> {
    try {
      const db = await this.getDb();
      const result = await new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(SECURE_STORAGE_STORE_NAME, 'readonly');
        const store = tx.objectStore(SECURE_STORAGE_STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
      });
      if (result !== undefined) {
        return result;
      }
      return (this.memoryFallback.get(key) as T) ?? null;
    } catch {
      return (this.memoryFallback.get(key) as T) ?? null;
    }
  }

  async removeItem(key: string): Promise<void> {
    this.memoryFallback.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore
    }
    try {
      const db = await this.getDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(SECURE_STORAGE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(SECURE_STORAGE_STORE_NAME);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // Ignore
    }
  }

  async clear(): Promise<void> {
    this.memoryFallback.clear();
    try {
      sessionStorage.removeItem('pos_session_key');
    } catch {
      // Ignore
    }
    try {
      const db = await this.getDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(SECURE_STORAGE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(SECURE_STORAGE_STORE_NAME);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // Ignore
    }
  }
}

// API request wrapper with rate limiting and security
export const secureApiCall = async <T>(
  apiCall: () => Promise<T>,
  rateLimiter: RateLimiter,
  key: string = 'default'
): Promise<T> => {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'API call failed';
    // Log the error securely
    await logApplicationError('api_call_error', message, {
      endpoint: key,
      status: error instanceof ApiRequestError ? error.status : undefined
    });

    // Don't expose sensitive error details
    if (message.includes('JWT') || message.includes('token')) {
      throw new Error('Authentication error. Please log in again.');
    }
    if (message.includes('permission') || message.includes('unauthorized')) {
      throw new Error('You do not have permission to perform this action.');
    }
    throw new Error('An error occurred. Please try again.');
  }
};

// Error logging functions
export const logApplicationError = async (
  errorType: string,
  errorMessage: string,
  errorDetails?: unknown,
  severity: string = 'error',
  endpoint?: string,
  requestMethod?: string,
  requestBody?: unknown,
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
  metadata?: unknown
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
    if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;

    const registration = await navigator.serviceWorker.getRegistration("/");
    this.serviceWorker = registration?.active ?? navigator.serviceWorker.controller;
  }

  async validateCacheIntegrity(): Promise<boolean> {
    try {
      const result = await ApiService.post<{ valid: boolean }>('/auth/validate_pwa_cache_integrity', {
        cache_manifest: await this.getCacheManifest()
      });

      return Boolean(result?.valid);
    } catch (error) {
      console.error('Cache validation failed:', error);
      await logApplicationError(
        'pwa_cache_validation_error',
        error instanceof Error ? error.message : 'PWA cache validation failed',
      );
      return false;
    }
  }

  private async getCacheManifest(): Promise<Record<string, string[]>> {
    // Get current cache manifest for validation
    const cacheNames = await caches.keys();
    const manifest: Record<string, string[]> = {};

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

    console.log('Security systems initialized successfully');
  } catch (error) {
    console.error('Failed to initialize security systems:', error);
    await logApplicationError('security_initialization_failed', 'Failed to initialize security systems', { error: error.message });
  }
};