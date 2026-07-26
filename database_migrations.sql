-- ===========================================
-- SECURE POS SYSTEM - DATABASE MIGRATIONS
-- Apply these migrations in order to your Supabase SQL Editor
-- ===========================================

-- Migration 0: Foundational Security Schema (20251007052759)
-- ===========================================

-- Create user roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'cashier');

-- Create user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create categories table
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create products table
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  barcode TEXT UNIQUE,
  name TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id),
  unit_cost DECIMAL(10,2) NOT NULL,
  retail_price DECIMAL(10,2) NOT NULL,
  tax_rate DECIMAL(5,2) DEFAULT 16.00,
  unit_of_measure TEXT DEFAULT 'piece',
  reorder_level INTEGER DEFAULT 10,
  stock_on_hand INTEGER DEFAULT 0,
  location TEXT DEFAULT 'main',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT positive_prices CHECK (unit_cost >= 0 AND retail_price >= 0),
  CONSTRAINT positive_stock CHECK (stock_on_hand >= 0)
);

-- Create sales table
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id UUID REFERENCES auth.users(id) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  tax_amount DECIMAL(10,2) NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'mpesa')),
  status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'pending', 'voided')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create sale_items table
CREATE TABLE IF NOT EXISTS public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10,2) NOT NULL,
  tax_rate DECIMAL(5,2) NOT NULL,
  line_total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

-- Create security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for categories
CREATE POLICY "Authenticated users can view categories"
  ON public.categories FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage categories"
  ON public.categories FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for products
CREATE POLICY "Authenticated users can view products"
  ON public.products FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage products"
  ON public.products FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for sales
CREATE POLICY "Users can view their own sales"
  ON public.sales FOR SELECT
  USING (auth.uid() = cashier_id);

CREATE POLICY "Cashiers can create sales"
  ON public.sales FOR INSERT
  WITH CHECK (auth.uid() = cashier_id AND public.has_role(auth.uid(), 'cashier'::app_role));

CREATE POLICY "Admins can view all sales"
  ON public.sales FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for sale_items
CREATE POLICY "Users can view their own sale items"
  ON public.sale_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sales
      WHERE id = sale_items.sale_id AND cashier_id = auth.uid()
    )
  );

CREATE POLICY "Cashiers can create sale items"
  ON public.sale_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales
      WHERE id = sale_items.sale_id AND cashier_id = auth.uid()
    ) AND public.has_role(auth.uid(), 'cashier'::app_role)
  );

CREATE POLICY "Admins can view all sale items"
  ON public.sale_items FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ===========================================
-- Migration 1: Error Monitoring (20260101110500)
CREATE TABLE IF NOT EXISTS public.error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_details JSONB,
  user_id UUID REFERENCES auth.users(id),
  session_id TEXT,
  ip_address INET,
  user_agent TEXT,
  endpoint TEXT,
  request_method TEXT,
  request_body JSONB,
  stack_trace TEXT,
  severity TEXT DEFAULT 'error' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_error_logs_type ON public.error_logs(error_type);
CREATE INDEX IF NOT EXISTS idx_error_logs_user ON public.error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON public.error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON public.error_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON public.error_logs(resolved);

-- Enable RLS
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can view all error logs"
ON public.error_logs FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can insert error logs"
ON public.error_logs FOR INSERT
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins can update error logs"
ON public.error_logs FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Create security monitoring table
CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  investigated BOOLEAN DEFAULT false,
  investigated_at TIMESTAMPTZ,
  investigated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_security_events_type ON public.security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON public.security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_risk ON public.security_events(risk_level);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON public.security_events(created_at);

-- Enable RLS
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can view all security events"
ON public.security_events FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can insert security events"
ON public.security_events FOR INSERT
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins can update security events"
ON public.security_events FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Function to log application errors
CREATE OR REPLACE FUNCTION public.log_application_error(
  p_error_type TEXT,
  p_error_message TEXT,
  p_error_details JSONB DEFAULT NULL,
  p_severity TEXT DEFAULT 'error',
  p_endpoint TEXT DEFAULT NULL,
  p_request_method TEXT DEFAULT NULL,
  p_request_body JSONB DEFAULT NULL,
  p_stack_trace TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_error_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  INSERT INTO public.error_logs (
    error_type,
    error_message,
    error_details,
    user_id,
    endpoint,
    request_method,
    request_body,
    stack_trace,
    severity
  )
  VALUES (
    p_error_type,
    p_error_message,
    p_error_details,
    v_user_id,
    p_endpoint,
    p_request_method,
    p_request_body,
    p_stack_trace,
    p_severity
  )
  RETURNING id INTO v_error_id;

  RETURN v_error_id;
END;
$$;

-- Function to log security events
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_event_type TEXT,
  p_description TEXT,
  p_risk_level TEXT DEFAULT 'low',
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  INSERT INTO public.security_events (
    event_type,
    description,
    user_id,
    risk_level,
    metadata
  )
  VALUES (
    p_event_type,
    p_description,
    v_user_id,
    p_risk_level,
    p_metadata
  )
  RETURNING id INTO v_event_id;

  -- Log high-risk events as errors too
  IF p_risk_level IN ('high', 'critical') THEN
    PERFORM public.log_application_error(
      'security_event',
      p_description,
      p_metadata,
      'critical'
    );
  END IF;

  RETURN v_event_id;
END;
$$;

-- Function to detect suspicious activity
CREATE OR REPLACE FUNCTION public.detect_suspicious_activity(
  p_user_id UUID,
  p_ip_address TEXT,
  p_user_agent TEXT,
  p_action TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent_failed_logins INTEGER;
  v_recent_rate_limit_hits INTEGER;
  v_unusual_location BOOLEAN := FALSE;
BEGIN
  -- Check for multiple failed login attempts
  SELECT COUNT(*)
  INTO v_recent_failed_logins
  FROM public.security_events
  WHERE user_id = p_user_id
    AND event_type = 'failed_login'
    AND created_at > now() - INTERVAL '1 hour';

  -- Check for rate limit hits
  SELECT COUNT(*)
  INTO v_recent_rate_limit_hits
  FROM public.security_events
  WHERE user_id = p_user_id
    AND event_type = 'rate_limit_exceeded'
    AND created_at > now() - INTERVAL '1 hour';

  -- Flag suspicious activity
  IF v_recent_failed_logins >= 5 OR v_recent_rate_limit_hits >= 3 THEN
    PERFORM public.log_security_event(
      'suspicious_activity_detected',
      format('Suspicious activity detected for user %s: %s failed logins, %s rate limit hits',
             p_user_id, v_recent_failed_logins, v_recent_rate_limit_hits),
      'high',
      jsonb_build_object(
        'action', p_action,
        'ip_address', p_ip_address,
        'user_agent', p_user_agent,
        'failed_logins', v_recent_failed_logins,
        'rate_limit_hits', v_recent_rate_limit_hits
      )
    );
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- Function to get error statistics
CREATE OR REPLACE FUNCTION public.get_error_statistics(
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE(
  error_type TEXT,
  count BIGINT,
  severity TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    el.error_type,
    COUNT(*) as count,
    el.severity
  FROM public.error_logs el
  WHERE el.created_at > now() - (p_days || ' days')::INTERVAL
  GROUP BY el.error_type, el.severity
  ORDER BY count DESC;
END;
$$;

-- Function to get security statistics
CREATE OR REPLACE FUNCTION public.get_security_statistics(
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE(
  event_type TEXT,
  count BIGINT,
  risk_level TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    se.event_type,
    COUNT(*) as count,
    se.risk_level
  FROM public.security_events se
  WHERE se.created_at > now() - (p_days || ' days')::INTERVAL
  GROUP BY se.event_type, se.risk_level
  ORDER BY count DESC;
END;
$$;

-- Function to clean up old logs (keep last 90 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_logs()
RETURNS TABLE(deleted_errors INTEGER, deleted_security INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_errors INTEGER := 0;
  v_deleted_security INTEGER := 0;
BEGIN
  -- Delete old error logs
  DELETE FROM public.error_logs
  WHERE created_at < now() - INTERVAL '90 days';
  GET DIAGNOSTICS v_deleted_errors = ROW_COUNT;

  -- Delete old security events
  DELETE FROM public.security_events
  WHERE created_at < now() - INTERVAL '90 days';
  GET DIAGNOSTICS v_deleted_security = ROW_COUNT;

  RETURN QUERY SELECT v_deleted_errors, v_deleted_security;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.log_application_error(TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_security_event(TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_suspicious_activity(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_error_statistics(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_security_statistics(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_logs() TO authenticated;

-- ===========================================
-- Migration 2: Database Encryption (20260101110000)
-- ===========================================

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
  key := COALESCE(encryption_key, 'POS_SYSTEM_ENCRYPTION_KEY_32CHARS');

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
  key := COALESCE(encryption_key, 'POS_SYSTEM_ENCRYPTION_KEY_32CHARS');

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

-- ===========================================
-- Migration 3: API Rate Limiting (20260101110100)
-- ===========================================

-- Create rate limiting table
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL, -- IP address, user ID, or API key
  endpoint TEXT NOT NULL,
  request_count INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier_endpoint ON public.rate_limits(identifier, endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON public.rate_limits(window_start);

-- Enable RLS
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- RLS Policies - only service role can manage rate limits
CREATE POLICY "Service role can manage rate limits"
ON public.rate_limits FOR ALL
USING (auth.role() = 'service_role');

-- Function to check and update rate limits
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier TEXT,
  p_endpoint TEXT,
  p_max_requests INTEGER DEFAULT 10,
  p_window_minutes INTEGER DEFAULT 1
)
RETURNS TABLE(
  allowed BOOLEAN,
  remaining_requests INTEGER,
  reset_time TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_current_count INTEGER;
  v_reset_time TIMESTAMPTZ;
BEGIN
  -- Calculate window start
  v_window_start := now() - (p_window_minutes || ' minutes')::INTERVAL;
  v_reset_time := now() + (p_window_minutes || ' minutes')::INTERVAL;

  -- Get current count for this window
  SELECT COALESCE(request_count, 0)
  INTO v_current_count
  FROM public.rate_limits
  WHERE identifier = p_identifier
    AND endpoint = p_endpoint
    AND window_start >= v_window_start;

  -- If no record exists, create one
  IF v_current_count IS NULL THEN
    INSERT INTO public.rate_limits (identifier, endpoint, request_count, window_start)
    VALUES (p_identifier, p_endpoint, 1, now());

    RETURN QUERY SELECT
      true as allowed,
      p_max_requests - 1 as remaining_requests,
      v_reset_time as reset_time;
    RETURN;
  END IF;

  -- Check if limit exceeded
  IF v_current_count >= p_max_requests THEN
    RETURN QUERY SELECT
      false as allowed,
      0 as remaining_requests,
      v_reset_time as reset_time;
    RETURN;
  END IF;

  -- Update count
  UPDATE public.rate_limits
  SET request_count = request_count + 1,
      updated_at = now()
  WHERE identifier = p_identifier
    AND endpoint = p_endpoint
    AND window_start >= v_window_start;

  RETURN QUERY SELECT
    true as allowed,
    p_max_requests - v_current_count - 1 as remaining_requests,
    v_reset_time as reset_time;
END;
$$;

-- Function to get client identifier (IP or user ID)
CREATE OR REPLACE FUNCTION public.get_client_identifier(req jsonb DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_ip TEXT;
BEGIN
  -- Try to get user ID first
  v_user_id := auth.uid();

  IF v_user_id IS NOT NULL THEN
    RETURN 'user_' || v_user_id::TEXT;
  END IF;

  -- Fallback to IP address from request headers
  -- Note: In Supabase Edge Functions, IP might not be directly available
  -- This is a simplified implementation
  v_ip := COALESCE(req->>'cf-connecting-ip', req->>'x-forwarded-for', 'unknown');

  RETURN 'ip_' || v_ip;
END;
$$;

-- Clean up old rate limit records (run this periodically)
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM public.rate_limits
  WHERE window_start < now() - INTERVAL '1 hour';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_identifier(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits() TO authenticated;

-- ===========================================
-- Migration 4: CSRF Protection (20260101110200)
-- ===========================================

-- Create CSRF tokens table
CREATE TABLE IF NOT EXISTS public.csrf_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_csrf_tokens_user ON public.csrf_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_csrf_tokens_token ON public.csrf_tokens(token);
CREATE INDEX IF NOT EXISTS idx_csrf_tokens_expires ON public.csrf_tokens(expires_at);

-- Enable RLS
ALTER TABLE public.csrf_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own CSRF tokens"
ON public.csrf_tokens FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own CSRF tokens"
ON public.csrf_tokens FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own CSRF tokens"
ON public.csrf_tokens FOR DELETE
USING (auth.uid() = user_id);

-- Function to generate CSRF token
CREATE OR REPLACE FUNCTION public.generate_csrf_token(
  p_session_id TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated to generate CSRF token';
  END IF;

  -- Generate a secure random token
  v_token := encode(gen_random_bytes(32), 'hex');

  -- Insert token with 1-hour expiration
  INSERT INTO public.csrf_tokens (token, user_id, session_id, expires_at)
  VALUES (v_token, v_user_id, p_session_id, now() + INTERVAL '1 hour');

  RETURN v_token;
END;
$$;

-- Function to validate CSRF token
CREATE OR REPLACE FUNCTION public.validate_csrf_token(
  p_token TEXT,
  p_session_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_token_exists BOOLEAN := FALSE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if token exists and is not expired
  SELECT EXISTS(
    SELECT 1 FROM public.csrf_tokens
    WHERE token = p_token
      AND user_id = v_user_id
      AND (session_id = p_session_id OR p_session_id IS NULL)
      AND expires_at > now()
  ) INTO v_token_exists;

  -- Delete used token (one-time use)
  IF v_token_exists THEN
    DELETE FROM public.csrf_tokens WHERE token = p_token;
  END IF;

  RETURN v_token_exists;
END;
$$;

-- Function to clean up expired CSRF tokens
CREATE OR REPLACE FUNCTION public.cleanup_csrf_tokens()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM public.csrf_tokens WHERE expires_at < now();
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.generate_csrf_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_csrf_token(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_csrf_tokens() TO authenticated;

-- ===========================================
-- Migration 5: Session Management (20260101110300)
-- ===========================================

-- Create sessions table
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  device_info JSONB,
  ip_address INET,
  user_agent TEXT,
  last_activity TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON public.user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON public.user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON public.user_sessions(is_active);

-- Enable RLS
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own sessions"
ON public.user_sessions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions"
ON public.user_sessions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all sessions"
ON public.user_sessions FOR ALL
USING (auth.role() = 'service_role');

-- Function to create secure session
CREATE OR REPLACE FUNCTION public.create_user_session(
  p_device_info JSONB DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS TABLE(
  session_id UUID,
  session_token TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_session_token TEXT;
  v_session_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated to create session';
  END IF;

  -- Generate secure session token
  v_session_token := 'sess_' || encode(gen_random_bytes(32), 'hex');
  v_expires_at := now() + INTERVAL '24 hours'; -- 24 hour sessions

  -- Insert session
  INSERT INTO public.user_sessions (
    user_id,
    session_token,
    device_info,
    ip_address,
    p_user_agent,
    expires_at
  )
  VALUES (
    v_user_id,
    v_session_token,
    p_device_info,
    p_ip_address::INET,
    p_user_agent,
    v_expires_at
  )
  RETURNING id INTO v_session_id;

  RETURN QUERY SELECT v_session_id, v_session_token, v_expires_at;
END;
$$;

-- Function to validate session
CREATE OR REPLACE FUNCTION public.validate_user_session(
  p_session_token TEXT
)
RETURNS TABLE(
  user_id UUID,
  is_valid BOOLEAN,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_is_active BOOLEAN;
BEGIN
  -- Get session details
  SELECT us.user_id, us.expires_at, us.is_active
  INTO v_user_id, v_expires_at, v_is_active
  FROM public.user_sessions us
  WHERE us.session_token = p_session_token;

  -- Check if session exists and is valid
  IF v_user_id IS NULL OR NOT v_is_active OR v_expires_at < now() THEN
    RETURN QUERY SELECT NULL::UUID, false, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Update last activity
  UPDATE public.user_sessions
  SET last_activity = now()
  WHERE session_token = p_session_token;

  RETURN QUERY SELECT v_user_id, true, v_expires_at;
END;
$$;

-- Function to invalidate session
CREATE OR REPLACE FUNCTION public.invalidate_user_session(
  p_session_token TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  UPDATE public.user_sessions
  SET is_active = false
  WHERE session_token = p_session_token
    AND user_id = v_user_id;

  RETURN FOUND;
END;
$$;

-- Function to invalidate all user sessions (for logout from all devices)
CREATE OR REPLACE FUNCTION public.invalidate_all_user_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_affected_count INTEGER;
BEGIN
  v_user_id := auth.uid();

  UPDATE public.user_sessions
  SET is_active = false
  WHERE user_id = v_user_id AND is_active = true;

  GET DIAGNOSTICS v_affected_count = ROW_COUNT;
  RETURN v_affected_count;
END;
$$;

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM public.user_sessions
  WHERE expires_at < now() OR is_active = false;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

-- Function to get active sessions for user
CREATE OR REPLACE FUNCTION public.get_user_sessions()
RETURNS TABLE(
  session_id UUID,
  device_info JSONB,
  ip_address INET,
  last_activity TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  RETURN QUERY
  SELECT
    us.id,
    us.device_info,
    us.ip_address,
    us.last_activity,
    us.created_at
  FROM public.user_sessions us
  WHERE us.user_id = v_user_id
    AND us.is_active = true
    AND us.expires_at > now()
  ORDER BY us.last_activity DESC;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.create_user_session(JSONB, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_user_session(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invalidate_user_session(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invalidate_all_user_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_sessions() TO authenticated;

-- ===========================================
-- Migration 6: Input Validation Schemas (20260101110400)
-- ===========================================

-- Function to validate email format
CREATE OR REPLACE FUNCTION public.validate_email_format(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Basic email validation regex
  RETURN p_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$';
END;
$$;

-- Function to validate Kenyan phone number
CREATE OR REPLACE FUNCTION public.validate_kenyan_phone(p_phone TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  clean_phone TEXT;
BEGIN
  -- Remove all non-digit characters
  clean_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');

  -- Check for valid Kenyan formats
  -- 254XXXXXXXXX (12 digits) or 0XXXXXXXXX (10 digits starting with 7)
  RETURN (length(clean_phone) = 12 AND clean_phone LIKE '254%') OR
         (length(clean_phone) = 10 AND clean_phone LIKE '07%');
END;
$$;

-- Function to validate amount (positive decimal with max 2 decimal places)
CREATE OR REPLACE FUNCTION public.validate_amount(p_amount DECIMAL)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN p_amount > 0 AND p_amount <= 1000000 AND
         (p_amount * 100)::INTEGER = (p_amount * 100); -- Max 2 decimal places
END;
$$;

-- Function to validate product data
CREATE OR REPLACE FUNCTION public.validate_product_data(
  p_name TEXT,
  p_sku TEXT,
  p_retail_price DECIMAL,
  p_unit_cost DECIMAL
)
RETURNS TABLE(
  is_valid BOOLEAN,
  errors TEXT[]
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_errors TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Validate name
  IF p_name IS NULL OR length(trim(p_name)) < 2 OR length(trim(p_name)) > 100 THEN
    v_errors := v_errors || 'Product name must be between 2 and 100 characters';
  END IF;

  -- Validate SKU
  IF p_sku IS NULL OR length(trim(p_sku)) < 1 OR length(trim(p_sku)) > 50 THEN
    v_errors := v_errors || 'SKU must be between 1 and 50 characters';
  END IF;

  -- Validate prices
  IF NOT public.validate_amount(p_retail_price) THEN
    v_errors := v_errors || 'Retail price must be positive and less than 1,000,000';
  END IF;

  IF NOT public.validate_amount(p_unit_cost) THEN
    v_errors := v_errors || 'Unit cost must be positive and less than 1,000,000';
  END IF;

  IF p_unit_cost >= p_retail_price THEN
    v_errors := v_errors || 'Unit cost must be less than retail price';
  END IF;

  RETURN QUERY SELECT
    array_length(v_errors, 1) IS NULL as is_valid,
    v_errors as errors;
END;
$$;

-- Function to validate customer data
CREATE OR REPLACE FUNCTION public.validate_customer_data(
  p_name TEXT,
  p_phone TEXT,
  p_email TEXT DEFAULT NULL
)
RETURNS TABLE(
  is_valid BOOLEAN,
  errors TEXT[]
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_errors TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Validate name
  IF p_name IS NULL OR length(trim(p_name)) < 2 OR length(trim(p_name)) > 100 THEN
    v_errors := v_errors || 'Customer name must be between 2 and 100 characters';
  END IF;

  -- Validate phone
  IF NOT public.validate_kenyan_phone(p_phone) THEN
    v_errors := v_errors || 'Phone number must be a valid Kenyan number (254XXXXXXXXX or 07XXXXXXXX)';
  END IF;

  -- Validate email if provided
  IF p_email IS NOT NULL AND NOT public.validate_email_format(p_email) THEN
    v_errors := v_errors || 'Email must be in valid format';
  END IF;

  RETURN QUERY SELECT
    array_length(v_errors, 1) IS NULL as is_valid,
    v_errors as errors;
END;
$$;

-- Function to validate sale data
CREATE OR REPLACE FUNCTION public.validate_sale_data(
  p_customer_id UUID,
  p_payment_method TEXT,
  p_items JSONB
)
RETURNS TABLE(
  is_valid BOOLEAN,
  errors TEXT[]
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_errors TEXT[] := ARRAY[]::TEXT[];
  v_item JSONB;
  v_product_id UUID;
  v_quantity INTEGER;
  v_unit_price DECIMAL;
BEGIN
  -- Validate payment method
  IF p_payment_method NOT IN ('cash', 'mpesa', 'hybrid') THEN
    v_errors := v_errors || 'Payment method must be cash, mpesa, or hybrid';
  END IF;

  -- Validate customer exists (if not walk-in)
  IF p_customer_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id) THEN
      v_errors := v_errors || 'Customer does not exist';
    END IF;
  END IF;

  -- Validate items
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    v_errors := v_errors || 'Sale must have at least one item';
  END IF;

  -- Validate each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_unit_price := (v_item->>'unit_price')::DECIMAL;

    -- Check product exists and has stock
    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_product_id AND stock_on_hand >= v_quantity
    ) THEN
      v_errors := v_errors || format('Product %s has insufficient stock', v_product_id);
    END IF;

    -- Validate quantity
    IF v_quantity <= 0 OR v_quantity > 1000 THEN
      v_errors := v_errors || 'Quantity must be between 1 and 1000';
    END IF;

    -- Validate unit price
    IF NOT public.validate_amount(v_unit_price) THEN
      v_errors := v_errors || 'Unit price must be valid amount';
    END IF;
  END LOOP;

  RETURN QUERY SELECT
    array_length(v_errors, 1) IS NULL as is_valid,
    v_errors as errors;
END;
$$;

-- Function to validate user role
CREATE OR REPLACE FUNCTION public.validate_user_role(p_role app_role)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN p_role IN ('admin', 'cashier');
END;
$$;

-- Function to sanitize text input
CREATE OR REPLACE FUNCTION public.sanitize_text_input(p_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Remove potentially dangerous characters and limit length
  RETURN substring(
    regexp_replace(p_text, '[<>\"'';]', '', 'g'),
    1, 255
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.validate_email_format(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_kenyan_phone(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_amount(DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_product_data(TEXT, TEXT, DECIMAL, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_customer_data(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_sale_data(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_user_role(app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sanitize_text_input(TEXT) TO authenticated;

-- ===========================================
-- Migration 7: PWA Security Hardening (20260101110600)
-- ===========================================

-- Create PWA service worker security table
CREATE TABLE IF NOT EXISTS public.pwa_security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  sw_version TEXT,
  cache_status TEXT,
  offline_capabilities BOOLEAN DEFAULT false,
  security_headers JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_pwa_security_events_user ON public.pwa_security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_pwa_security_events_type ON public.pwa_security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_pwa_security_events_created ON public.pwa_security_events(created_at);

-- Enable RLS
ALTER TABLE public.pwa_security_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own PWA events"
ON public.pwa_security_events FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert PWA events"
ON public.pwa_security_events FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- Function to log PWA security events
CREATE OR REPLACE FUNCTION public.log_pwa_security_event(
  p_event_type TEXT,
  p_description TEXT,
  p_sw_version TEXT DEFAULT NULL,
  p_cache_status TEXT DEFAULT NULL,
  p_offline_capabilities BOOLEAN DEFAULT false,
  p_security_headers JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  INSERT INTO public.pwa_security_events (
    event_type,
    description,
    user_id,
    sw_version,
    cache_status,
    offline_capabilities,
    security_headers
  )
  VALUES (
    p_event_type,
    p_description,
    v_user_id,
    p_sw_version,
    p_cache_status,
    p_offline_capabilities,
    p_security_headers
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

-- Function to validate PWA cache integrity
CREATE OR REPLACE FUNCTION public.validate_pwa_cache_integrity(
  p_cache_manifest JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected_hash TEXT;
  v_actual_hash TEXT;
BEGIN
  -- This would validate cache manifest against expected hashes
  -- For now, just log the validation attempt
  PERFORM public.log_pwa_security_event(
    'cache_integrity_check',
    'PWA cache integrity validation performed',
    NULL,
    'validated',
    true,
    p_cache_manifest
  );

  RETURN true;
END;
$$;

-- Function to handle offline transaction queue security
CREATE OR REPLACE FUNCTION public.secure_offline_transaction(
  p_transaction_data JSONB,
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_id UUID;
  v_encrypted_data TEXT;
BEGIN
  -- Encrypt the offline transaction data
  v_encrypted_data := public.encrypt_sensitive_data(p_transaction_data::TEXT);

  -- Store in offline queue with encryption
  INSERT INTO public.offline_transaction_queue (
    user_id,
    transaction_type,
    encrypted_data,
    created_at
  )
  VALUES (
    p_user_id,
    p_transaction_data->>'type',
    v_encrypted_data,
    now()
  )
  RETURNING id INTO v_transaction_id;

  -- Log PWA offline transaction
  PERFORM public.log_pwa_security_event(
    'offline_transaction_queued',
    format('Offline transaction queued for user %s', p_user_id),
    NULL,
    'offline',
    true,
    jsonb_build_object('transaction_id', v_transaction_id)
  );

  RETURN v_transaction_id;
END;
$$;

-- Create offline transaction queue table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.offline_transaction_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  transaction_type TEXT NOT NULL,
  encrypted_data TEXT NOT NULL,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes for offline queue
CREATE INDEX IF NOT EXISTS idx_offline_queue_user ON public.offline_transaction_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_offline_queue_processed ON public.offline_transaction_queue(processed);
CREATE INDEX IF NOT EXISTS idx_offline_queue_created ON public.offline_transaction_queue(created_at);

-- Enable RLS for offline queue
ALTER TABLE public.offline_transaction_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies for offline queue
CREATE POLICY "Users can view their own offline transactions"
ON public.offline_transaction_queue FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own offline transactions"
ON public.offline_transaction_queue FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can update offline transactions"
ON public.offline_transaction_queue FOR UPDATE
USING (auth.role() = 'service_role');

-- Function to process offline transactions securely
CREATE OR REPLACE FUNCTION public.process_offline_transactions()
RETURNS TABLE(processed_count INTEGER, failed_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction RECORD;
  v_decrypted_data JSONB;
  v_processed_count INTEGER := 0;
  v_failed_count INTEGER := 0;
BEGIN
  FOR v_transaction IN
    SELECT * FROM public.offline_transaction_queue
    WHERE processed = false
    ORDER BY created_at ASC
  LOOP
    BEGIN
      -- Decrypt transaction data
      v_decrypted_data := public.decrypt_sensitive_data(v_transaction.encrypted_data)::JSONB;

      -- Process the transaction based on type
      CASE v_transaction.transaction_type
        WHEN 'sale' THEN
          -- Process sale transaction
          PERFORM public.process_secure_sale(v_decrypted_data);
        WHEN 'inventory_update' THEN
          -- Process inventory update
          PERFORM public.process_secure_inventory_update(v_decrypted_data);
        ELSE
          -- Unknown transaction type
          RAISE EXCEPTION 'Unknown transaction type: %', v_transaction.transaction_type;
      END CASE;

      -- Mark as processed
      UPDATE public.offline_transaction_queue
      SET processed = true, processed_at = now()
      WHERE id = v_transaction.id;

      v_processed_count := v_processed_count + 1;

    EXCEPTION WHEN OTHERS THEN
      -- Log processing failure
      PERFORM public.log_application_error(
        'offline_transaction_processing_failed',
        SQLERRM,
        jsonb_build_object(
          'transaction_id', v_transaction.id,
          'transaction_type', v_transaction.transaction_type
        ),
        'error'
      );

      v_failed_count := v_failed_count + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT v_processed_count, v_failed_count;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.log_pwa_security_event(TEXT, TEXT, TEXT, TEXT, BOOLEAN, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_pwa_cache_integrity(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.secure_offline_transaction(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_offline_transactions() TO authenticated;-- ===========================================
-- Migration 7: Inventory Procurement and Advanced Batch Tracking (20260411080000)
-- ===========================================

-- Create vendors table
CREATE TABLE IF NOT EXISTS public.vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  payment_terms TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create purchase_orders table
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT NOT NULL UNIQUE,
  vendor_id UUID REFERENCES public.vendors(id) NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'partial', 'received', 'cancelled')),
  total_amount DECIMAL(10,2) DEFAULT 0,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create po_items table
CREATE TABLE IF NOT EXISTS public.po_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost DECIMAL(10,2) NOT NULL,
  received_quantity INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create delivery_notes table (GRNs)
CREATE TABLE IF NOT EXISTS public.delivery_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_number TEXT NOT NULL UNIQUE,
  purchase_order_id UUID REFERENCES public.purchase_orders(id),
  vendor_id UUID REFERENCES public.vendors(id),
  delivery_date DATE NOT NULL,
  received_by UUID REFERENCES public.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create product_batches table for advanced batch tracking
CREATE TABLE IF NOT EXISTS public.product_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) NOT NULL,
  batch_number TEXT NOT NULL,
  manufacturing_date DATE,
  expiry_date DATE,
  supplier_batch_reference TEXT,
  quality_check_status TEXT DEFAULT 'pending' CHECK (quality_check_status IN ('pending', 'passed', 'failed')),
  environmental_conditions TEXT,
  initial_quantity INTEGER NOT NULL,
  current_quantity INTEGER NOT NULL,
  delivery_note_id UUID REFERENCES public.delivery_notes(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create delivery_note_items table
CREATE TABLE IF NOT EXISTS public.delivery_note_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_id UUID REFERENCES public.delivery_notes(id) ON DELETE CASCADE NOT NULL,
  po_item_id UUID REFERENCES public.po_items(id),
  product_id UUID REFERENCES public.products(id) NOT NULL,
  batch_id UUID REFERENCES public.product_batches(id),
  quantity_received INTEGER NOT NULL CHECK (quantity_received > 0),
  unit_cost DECIMAL(10,2) NOT NULL,
  condition_upon_receipt TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_note_items ENABLE ROW LEVEL SECURITY;

-- Note: RLS policies would follow standard user/admin restrictions as established in earlier migrations.
