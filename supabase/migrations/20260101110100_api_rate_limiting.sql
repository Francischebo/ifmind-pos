-- API Rate Limiting Implementation for Supabase

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