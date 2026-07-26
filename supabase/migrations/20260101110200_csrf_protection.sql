-- CSRF Protection Implementation

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