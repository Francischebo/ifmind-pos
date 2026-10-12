/**
 * @deprecated
 * The POS application has fully migrated from Supabase browser-direct access to the
 * standalone Express REST API backend (/api).
 *
 * Direct Supabase client initialization and localStorage session persistence have been
 * decommissioned to eliminate insecure client token storage and dead code.
 *
 * For all backend interactions, use `ApiService` from `src/lib/api.ts` and the unified
 * authentication hook `useAuth` from `src/hooks/useAuth.tsx`.
 */

export const supabase = new Proxy({} as unknown as Record<string, unknown>, {
  get(_target, prop) {
    throw new Error(
      `Attempted to access deprecated Supabase client property "${String(prop)}". ` +
      `The frontend has migrated to the standalone Express REST API (/api). Use ApiService from src/lib/api.ts instead.`
    );
  },
});