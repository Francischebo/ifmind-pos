-- Encryption keys must be supplied through the app.encryption_key database setting.
-- Configure the same 64-character hex value for the TypeORM backend and PostgREST role.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
ALTER TABLE IF EXISTS public.mpesa_transactions ADD COLUMN IF NOT EXISTS callback_token_hash TEXT;

DO $$
DECLARE
  active_key TEXT := current_setting('app.encryption_key', true);
  legacy_key TEXT := nullif(current_setting('app.legacy_encryption_key', true), '');
  has_legacy_ciphertext BOOLEAN := false;
  has_audit_ciphertext BOOLEAN := false;
  has_offline_ciphertext BOOLEAN := false;
BEGIN
  IF active_key IS NULL OR active_key !~ '^[0-9A-Fa-f]{64}$' THEN
    RAISE EXCEPTION 'app.encryption_key must contain a 32-byte hexadecimal key';
  END IF;

  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    EXECUTE $query$
      SELECT EXISTS (
        SELECT 1 FROM public.audit_logs
        WHERE old_values->>'phone_encrypted' IS NOT NULL
           OR new_values->>'phone_encrypted' IS NOT NULL
      )
    $query$ INTO has_audit_ciphertext;
    has_legacy_ciphertext := has_audit_ciphertext;
  END IF;

  IF to_regclass('public.offline_transaction_queue') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.offline_transaction_queue WHERE encrypted_data IS NOT NULL)'
      INTO has_offline_ciphertext;
    has_legacy_ciphertext := has_legacy_ciphertext OR has_offline_ciphertext;
  END IF;

  IF has_legacy_ciphertext AND legacy_key IS NULL THEN
    RAISE EXCEPTION 'Existing encrypted audit/offline data requires app.legacy_encryption_key for re-encryption';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.encrypt_sensitive_data(
  data TEXT,
  encryption_key TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key_text TEXT;
BEGIN
  key_text := COALESCE(encryption_key, current_setting('app.encryption_key', true));
  IF key_text IS NULL OR key_text !~ '^[0-9A-Fa-f]{64}$' THEN
    RAISE EXCEPTION 'app.encryption_key must contain a 32-byte hexadecimal key';
  END IF;

  RETURN encode(pgp_sym_encrypt(data, key_text, 'cipher-algo=aes256'), 'base64');
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.reencrypt_legacy_sensitive_data(encrypted_data TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  legacy_key TEXT := nullif(current_setting('app.legacy_encryption_key', true), '');
  active_key TEXT := current_setting('app.encryption_key', true);
  plaintext TEXT;
BEGIN
  IF legacy_key IS NULL THEN
    RAISE EXCEPTION 'app.legacy_encryption_key is required to re-encrypt legacy ciphertext';
  END IF;

  plaintext := convert_from(
    decrypt(decode(encrypted_data, 'hex'), convert_to(rpad(legacy_key, 32, '0'), 'UTF8'), 'aes'),
    'UTF8'
  );
  RETURN public.encrypt_sensitive_data(plaintext, active_key);
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.customers') IS NOT NULL THEN
    UPDATE public.customers
    SET phone_encrypted = public.encrypt_sensitive_data(phone)
    WHERE phone IS NOT NULL AND phone <> '';
  END IF;

  IF to_regclass('public.mpesa_transactions') IS NOT NULL THEN
    UPDATE public.mpesa_transactions
    SET phone_encrypted = public.encrypt_sensitive_data(phone_number)
    WHERE phone_number IS NOT NULL AND phone_number <> '';
  END IF;

  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    UPDATE public.audit_logs
    SET old_values = jsonb_set(
      old_values,
      '{phone_encrypted}',
      to_jsonb(pg_temp.reencrypt_legacy_sensitive_data(old_values->>'phone_encrypted'))
    )
    WHERE old_values->>'phone_encrypted' IS NOT NULL;

    UPDATE public.audit_logs
    SET new_values = jsonb_set(
      new_values,
      '{phone_encrypted}',
      to_jsonb(pg_temp.reencrypt_legacy_sensitive_data(new_values->>'phone_encrypted'))
    )
    WHERE new_values->>'phone_encrypted' IS NOT NULL;
  END IF;

  IF to_regclass('public.offline_transaction_queue') IS NOT NULL THEN
    UPDATE public.offline_transaction_queue
    SET encrypted_data = pg_temp.reencrypt_legacy_sensitive_data(encrypted_data)
    WHERE encrypted_data IS NOT NULL;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_sensitive_data(
  encrypted_data TEXT,
  encryption_key TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key_text TEXT;
BEGIN
  key_text := COALESCE(encryption_key, current_setting('app.encryption_key', true));
  IF key_text IS NULL OR key_text !~ '^[0-9A-Fa-f]{64}$' THEN
    RAISE EXCEPTION 'app.encryption_key must contain a 32-byte hexadecimal key';
  END IF;

  RETURN pgp_sym_decrypt(decode(encrypted_data, 'base64'), key_text);
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;
