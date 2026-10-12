/**
 * Secure Offline Authentication Vault
 *
 * Provides tamper-proof cryptographic caching for offline POS user sessions.
 * Uses a non-exportable browser-generated Web Cryptography HMAC key stored in
 * IndexedDB so that claims cannot be forged, manipulated, or escalated via
 * browser DevTools / localStorage edits.
 */

export type UserRole = "admin" | "cashier" | "supervisor" | "manager";

export interface VaultUser {
  id: string;
  email: string;
  role: UserRole;
  profile?: Record<string, unknown>;
}

interface VaultRecord {
  user: VaultUser;
  issuedAt: number;
  signature: string;
}

const VAULT_STORAGE_KEY = "pos:offline-auth-vault:v2";
const LEGACY_STORAGE_KEYS = ["pos:last-verified-user", "pos:last-verified-user-token"];
const VAULT_DB_NAME = "cfi-pos-security-vault";
const VAULT_DB_VERSION = 1;
const VAULT_KEY_STORE = "device-keys";
const VAULT_KEY_ID = "offline-auth-signing-key";

// Maximum validity for an offline cached session snapshot (24 hours)
const MAX_OFFLINE_CACHE_AGE_MS = 24 * 60 * 60 * 1000;

const ALLOWED_ROLES: ReadonlySet<string> = new Set<UserRole>([
  "admin",
  "cashier",
  "supervisor",
  "manager",
]);

const bufferToHex = (buffer: ArrayBuffer): string => {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const hexToBuffer = (hex: string): ArrayBuffer => {
  if (hex.length % 2 !== 0) return new ArrayBuffer(0);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
};

/**
 * Opens or creates the IndexedDB security store for the device key.
 */
const openVaultDb = (): Promise<IDBDatabase> => {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not supported in this environment"));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(VAULT_DB_NAME, VAULT_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VAULT_KEY_STORE)) {
        db.createObjectStore(VAULT_KEY_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open security vault DB"));
  });
};

/**
 * Retrieves the device-bound, non-exportable HMAC key or generates a new one.
 */
let cachedDeviceKey: CryptoKey | null = null;

export const getDeviceSigningKey = async (): Promise<CryptoKey | null> => {
  if (cachedDeviceKey) return cachedDeviceKey;
  if (typeof crypto === "undefined" || !crypto.subtle) {
    return null;
  }

  try {
    const db = await openVaultDb();
    const existingKey = await new Promise<CryptoKey | undefined>((resolve, reject) => {
      const tx = db.transaction(VAULT_KEY_STORE, "readonly");
      const store = tx.objectStore(VAULT_KEY_STORE);
      const req = store.get(VAULT_KEY_ID);
      req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
      req.onerror = () => reject(req.error);
    });

    if (existingKey) {
      cachedDeviceKey = existingKey;
      return existingKey;
    }

    // Generate a fresh, non-exportable HMAC-SHA256 key
    const newKey = await crypto.subtle.generateKey(
      {
        name: "HMAC",
        hash: { name: "SHA-256" },
      },
      false, // extractable = false prevents raw key extraction from memory / DevTools
      ["sign", "verify"],
    );

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(VAULT_KEY_STORE, "readwrite");
      const store = tx.objectStore(VAULT_KEY_STORE);
      const req = store.put(newKey, VAULT_KEY_ID);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    cachedDeviceKey = newKey;
    return newKey;
  } catch (err) {
    console.warn("Unable to access non-exportable security key from IndexedDB:", err);
    return null;
  }
};

const buildSigningPayload = (user: VaultUser, issuedAt: number): Uint8Array => {
  const canonical = `${user.id}#${user.email.toLowerCase()}#${user.role}#${issuedAt}`;
  return new TextEncoder().encode(canonical);
};

/**
 * Stores a cryptographically signed snapshot of a user who has just been verified ONLINE.
 * Should ONLY be called immediately following verified online server responses.
 */
export const storeVerifiedOfflineUser = async (user: VaultUser): Promise<void> => {
  try {
    // Purge legacy insecure storage keys
    LEGACY_STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));

    if (!user || !user.id || !user.email || !ALLOWED_ROLES.has(user.role)) {
      return;
    }

    const deviceKey = await getDeviceSigningKey();
    if (!deviceKey) {
      // If Web Cryptography is unavailable, do not store unverified plaintext credentials
      console.warn("Web Cryptography is unavailable; skipping offline credential caching.");
      return;
    }

    const issuedAt = Date.now();
    const dataToSign = buildSigningPayload(user, issuedAt);
    const signatureBuffer = await crypto.subtle.sign("HMAC", deviceKey, dataToSign);
    const signature = bufferToHex(signatureBuffer);

    const record: VaultRecord = {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        profile: user.profile,
      },
      issuedAt,
      signature,
    };

    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(record));
  } catch (error) {
    console.error("Failed to store signed offline user snapshot:", error);
  }
};

/**
 * Reads and verifies the offline user snapshot.
 * Returns null if the snapshot is missing, tampered with, expired, or invalid.
 */
export const readVerifiedOfflineUser = async (): Promise<VaultUser | null> => {
  try {
    // Check and remove any legacy unauthenticated storage
    LEGACY_STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));

    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    if (!raw) return null;

    let parsed: VaultRecord;
    try {
      parsed = JSON.parse(raw) as VaultRecord;
    } catch {
      localStorage.removeItem(VAULT_STORAGE_KEY);
      return null;
    }

    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.user ||
      typeof parsed.user.id !== "string" ||
      typeof parsed.user.email !== "string" ||
      !ALLOWED_ROLES.has(parsed.user.role) ||
      typeof parsed.issuedAt !== "number" ||
      typeof parsed.signature !== "string"
    ) {
      localStorage.removeItem(VAULT_STORAGE_KEY);
      return null;
    }

    // Check expiration (max 24 hours old)
    const age = Date.now() - parsed.issuedAt;
    if (age < 0 || age > MAX_OFFLINE_CACHE_AGE_MS) {
      localStorage.removeItem(VAULT_STORAGE_KEY);
      return null;
    }

    // Verify cryptographic signature against the device key
    const deviceKey = await getDeviceSigningKey();
    if (!deviceKey) {
      localStorage.removeItem(VAULT_STORAGE_KEY);
      return null;
    }

    const dataToVerify = buildSigningPayload(parsed.user, parsed.issuedAt);
    const signatureBytes = hexToBuffer(parsed.signature);

    const isValid = await crypto.subtle.verify("HMAC", deviceKey, signatureBytes, dataToVerify);
    if (!isValid) {
      console.warn("[SECURITY ALERT] Offline auth vault signature verification failed. Tampered record purged.");
      localStorage.removeItem(VAULT_STORAGE_KEY);
      return null;
    }

    return parsed.user;
  } catch (error) {
    console.error("Failed to read verified offline user:", error);
    localStorage.removeItem(VAULT_STORAGE_KEY);
    return null;
  }
};

/**
 * Clears the offline vault completely (e.g. on user sign out).
 */
export const clearOfflineVault = (): void => {
  localStorage.removeItem(VAULT_STORAGE_KEY);
  LEGACY_STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));
};
