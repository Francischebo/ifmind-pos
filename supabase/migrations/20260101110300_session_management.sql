-- Secure Session Management Implementation

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
    user_agent,
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