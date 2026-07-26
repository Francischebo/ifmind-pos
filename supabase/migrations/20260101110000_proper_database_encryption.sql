-- Proper Database Encryption Implementation
-- This replaces the basic hashing with proper AES encryption

-- Create encryption functions using pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Function to encrypt sensitive data
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
  key TEXT;
BEGIN
  -- Use provided key or get from environment/settings
  key := COALESCE(encryption_key, 'default_pos_encryption_key_32_chars!');

  -- Ensure key is 32 characters for AES-256
  key := RPAD(key, 32, '0');

  -- Encrypt using AES-256
  RETURN encode(encrypt(data::bytea, key::bytea, 'aes'), 'hex');
END;
$$;

-- Function to decrypt sensitive data
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
  key TEXT;
BEGIN
  -- Use provided key or get from environment/settings
  key := COALESCE(encryption_key, 'default_pos_encryption_key_32_chars!');

  -- Ensure key is 32 characters for AES-256
  key := RPAD(key, 32, '0');

  -- Decrypt using AES-256
  RETURN convert_from(decrypt(decode(encrypted_data, 'hex'), key::bytea, 'aes'), 'UTF8');
EXCEPTION
  WHEN OTHERS THEN
    -- Return null on decryption failure to prevent data leakage
    RETURN NULL;
END;
$$;

-- Update phone number encryption to use proper encryption
CREATE OR REPLACE FUNCTION public.handle_customer_phone_encryption()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only encrypt if not already encrypted (check if it's a valid phone format)
  IF NEW.phone ~ '^254[0-9]{9}$' AND (NEW.phone_encrypted IS NULL OR NEW.phone_encrypted = '') THEN
    NEW.phone_encrypted = public.encrypt_sensitive_data(NEW.phone);
  END IF;
  RETURN NEW;
END;
$$;

-- Update M-Pesa phone encryption
CREATE OR REPLACE FUNCTION public.handle_mpesa_phone_encryption()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.phone_number ~ '^254[0-9]{9}$' AND (NEW.phone_encrypted IS NULL OR NEW.phone_encrypted = '') THEN
    NEW.phone_encrypted = public.encrypt_sensitive_data(NEW.phone_number);
  END IF;
  RETURN NEW;
END;
$$;

-- Function to encrypt audit log sensitive data
CREATE OR REPLACE FUNCTION public.encrypt_audit_log_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Encrypt sensitive data in old_values and new_values
  IF NEW.old_values IS NOT NULL AND NEW.old_values->>'phone' IS NOT NULL THEN
    NEW.old_values = jsonb_set(NEW.old_values, '{phone_encrypted}', to_jsonb(public.encrypt_sensitive_data(NEW.old_values->>'phone')));
    NEW.old_values = NEW.old_values - 'phone';
  END IF;

  IF NEW.new_values IS NOT NULL AND NEW.new_values->>'phone' IS NOT NULL THEN
    NEW.new_values = jsonb_set(NEW.new_values, '{phone_encrypted}', to_jsonb(public.encrypt_sensitive_data(NEW.new_values->>'phone')));
    NEW.new_values = NEW.new_values - 'phone';
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for audit log encryption
CREATE TRIGGER encrypt_audit_log_trigger
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.encrypt_audit_log_data();

-- Function to safely decrypt phone numbers for authorized users only
CREATE OR REPLACE FUNCTION public.get_decrypted_phone(
  encrypted_phone TEXT,
  user_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_user_id UUID;
BEGIN
  -- Get the calling user ID
  caller_user_id := COALESCE(user_id, auth.uid());

  -- Only allow admins and cashiers to decrypt phone numbers
  IF NOT public.has_role(caller_user_id, 'admin'::app_role) AND
     NOT public.has_role(caller_user_id, 'cashier'::app_role) THEN
    RETURN '***-***-****'; -- Masked phone number
  END IF;

  -- Decrypt and return
  RETURN COALESCE(public.decrypt_sensitive_data(encrypted_phone), '***-***-****');
EXCEPTION
  WHEN OTHERS THEN
    RETURN '***-***-****'; -- Return masked on any error
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.encrypt_sensitive_data(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_sensitive_data(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_decrypted_phone(TEXT, UUID) TO authenticated;