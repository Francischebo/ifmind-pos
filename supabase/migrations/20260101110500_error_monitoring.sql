-- Secure Error Logging and Monitoring Implementation

-- Create error logs table
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