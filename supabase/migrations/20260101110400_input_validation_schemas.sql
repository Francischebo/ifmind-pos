-- Comprehensive Server-side Input Validation Schemas

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