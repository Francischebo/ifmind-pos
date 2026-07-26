-- Security and Schema Hardening Migration
-- Add shift_id to sales table for proper shift management
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES public.shifts(id);

-- Add idempotency keys for payments and operations
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
ALTER TABLE public.mpesa_transactions ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

-- Encrypt sensitive data - Add encrypted phone number columns
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS phone_encrypted TEXT;
ALTER TABLE public.mpesa_transactions ADD COLUMN IF NOT EXISTS phone_encrypted TEXT;

-- Add payment verification columns
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS payment_verified BOOLEAN DEFAULT false;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ;

-- Add audit columns
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Add constraints for data integrity
ALTER TABLE public.sales ADD CONSTRAINT positive_total CHECK (total_amount >= 0);
ALTER TABLE public.sales ADD CONSTRAINT positive_tax CHECK (tax_amount >= 0);
ALTER TABLE public.customers ADD CONSTRAINT valid_phone_format CHECK (phone ~ '^254[0-9]{9}$');

-- Create indexes for performance and security
CREATE INDEX IF NOT EXISTS idx_sales_shift_id ON public.sales(shift_id);
CREATE INDEX IF NOT EXISTS idx_sales_cashier_shift ON public.sales(cashier_id, shift_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON public.sales(created_at);
CREATE INDEX IF NOT EXISTS idx_mpesa_checkout_request ON public.mpesa_transactions(checkout_request_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);

-- Update RLS policies to be more restrictive
DROP POLICY IF EXISTS "Users can view sales" ON public.sales;
CREATE POLICY "Users can view their own sales and admin all"
ON public.sales FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  cashier_id = auth.uid()
);

-- Add policy for shift-based access
CREATE POLICY "Users can view sales from their active shifts"
ON public.sales FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.shifts
    WHERE shifts.id = sales.shift_id
    AND shifts.user_id = auth.uid()
    AND shifts.status = 'active'
  )
);

-- Create function for secure phone number encryption
CREATE OR REPLACE FUNCTION public.encrypt_phone_number(phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- In production, use proper encryption like pgcrypto
  -- For now, return hashed version (not reversible encryption)
  RETURN encode(digest(phone, 'sha256'), 'hex');
END;
$$;

-- Create function for shift validation
CREATE OR REPLACE FUNCTION public.validate_shift_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ensure sale is linked to an active shift
  IF NEW.shift_id IS NULL THEN
    -- Auto-assign to active shift if not specified
    SELECT id INTO NEW.shift_id
    FROM public.shifts
    WHERE user_id = NEW.cashier_id
    AND status = 'active'
    ORDER BY start_time DESC
    LIMIT 1;

    IF NEW.shift_id IS NULL THEN
      RAISE EXCEPTION 'No active shift found for user %', NEW.cashier_id;
    END IF;
  END IF;

  -- Set audit fields
  NEW.created_by = auth.uid();
  NEW.updated_by = auth.uid();

  RETURN NEW;
END;
$$;

-- Create trigger for shift validation
CREATE TRIGGER validate_shift_sale_trigger
  BEFORE INSERT ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_shift_sale();

-- Create function for secure audit logging
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values
  ) VALUES (
    auth.uid(),
    p_action,
    p_entity_type,
    p_entity_id,
    p_old_values,
    p_new_values
  );
END;
$$;

-- Update customer creation to encrypt phone
CREATE OR REPLACE FUNCTION public.handle_customer_phone_encryption()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.phone_encrypted = public.encrypt_phone_number(NEW.phone);
  RETURN NEW;
END;
$$;

CREATE TRIGGER encrypt_customer_phone_trigger
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_customer_phone_encryption();

-- Update M-Pesa transaction phone encryption
CREATE TRIGGER encrypt_mpesa_phone_trigger
  BEFORE INSERT OR UPDATE ON public.mpesa_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_customer_phone_encryption();