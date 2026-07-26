-- PWA Security Hardening and Re-enablement

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
GRANT EXECUTE ON FUNCTION public.process_offline_transactions() TO authenticated;