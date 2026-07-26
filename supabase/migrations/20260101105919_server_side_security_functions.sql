-- Server-side Security Functions Migration

-- Function to calculate sale totals server-side
CREATE OR REPLACE FUNCTION public.calculate_sale_totals(
  p_subtotal DECIMAL,
  p_tax_rate DECIMAL DEFAULT 16.00,
  p_loyalty_discount DECIMAL DEFAULT 0
)
RETURNS TABLE(
  subtotal DECIMAL,
  tax_amount DECIMAL,
  discount_amount DECIMAL,
  total_amount DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tax_amount DECIMAL;
  v_total DECIMAL;
BEGIN
  -- Validate inputs
  IF p_subtotal < 0 THEN
    RAISE EXCEPTION 'Subtotal cannot be negative';
  END IF;

  IF p_loyalty_discount < 0 THEN
    RAISE EXCEPTION 'Discount cannot be negative';
  END IF;

  -- Calculate tax on pre-discount amount
  v_tax_amount := (p_subtotal * p_tax_rate) / 100;

  -- Apply discount after tax calculation
  v_total := p_subtotal + v_tax_amount - p_loyalty_discount;

  -- Ensure total is not negative
  v_total := GREATEST(v_total, 0);

  RETURN QUERY SELECT
    p_subtotal,
    ROUND(v_tax_amount, 2),
    p_loyalty_discount,
    ROUND(v_total, 2);
END;
$$;

-- Function to calculate loyalty points server-side
CREATE OR REPLACE FUNCTION public.calculate_loyalty_points(
  p_amount DECIMAL,
  p_customer_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points_rate DECIMAL := 1;
  v_points_per_amount DECIMAL := 100;
  v_points INTEGER;
BEGIN
  -- Get loyalty settings
  SELECT COALESCE(value::DECIMAL, 1) INTO v_points_rate
  FROM public.settings WHERE key = 'loyalty_points_rate';

  SELECT COALESCE(value::DECIMAL, 100) INTO v_points_per_amount
  FROM public.settings WHERE key = 'loyalty_points_per_amount';

  -- Calculate points
  v_points := FLOOR((p_amount / v_points_per_amount) * v_points_rate);

  RETURN GREATEST(v_points, 0);
END;
$$;

-- Function to validate and create sale server-side
CREATE OR REPLACE FUNCTION public.create_secure_sale(
  p_cashier_id UUID,
  p_customer_id UUID DEFAULT NULL,
  p_payment_method TEXT,
  p_items JSONB,
  p_loyalty_discount DECIMAL DEFAULT 0,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE(
  sale_id UUID,
  total_amount DECIMAL,
  loyalty_points_earned INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id UUID;
  v_subtotal DECIMAL := 0;
  v_total_amount DECIMAL;
  v_loyalty_points INTEGER := 0;
  v_shift_id UUID;
  v_item RECORD;
BEGIN
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_sale_id
    FROM public.sales
    WHERE idempotency_key = p_idempotency_key;

    IF v_sale_id IS NOT NULL THEN
      -- Return existing sale
      SELECT total_amount, loyalty_points_earned INTO v_total_amount, v_loyalty_points
      FROM public.sales WHERE id = v_sale_id;

      RETURN QUERY SELECT v_sale_id, v_total_amount, v_loyalty_points;
      RETURN;
    END IF;
  END IF;

  -- Get active shift for cashier
  SELECT id INTO v_shift_id
  FROM public.shifts
  WHERE user_id = p_cashier_id AND status = 'active'
  ORDER BY start_time DESC
  LIMIT 1;

  IF v_shift_id IS NULL THEN
    RAISE EXCEPTION 'No active shift found for cashier';
  END IF;

  -- Calculate subtotal from items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_subtotal := v_subtotal + (v_item->>'unit_price')::DECIMAL * (v_item->>'quantity')::INTEGER;
  END LOOP;

  -- Calculate totals server-side
  SELECT total_amount INTO v_total_amount
  FROM public.calculate_sale_totals(v_subtotal, 16.00, p_loyalty_discount);

  -- Calculate loyalty points if customer provided
  IF p_customer_id IS NOT NULL THEN
    v_loyalty_points := public.calculate_loyalty_points(v_total_amount, p_customer_id);
  END IF;

  -- Create sale record
  INSERT INTO public.sales (
    cashier_id,
    customer_id,
    shift_id,
    subtotal,
    tax_amount,
    total_amount,
    payment_method,
    status,
    payment_status,
    loyalty_discount,
    loyalty_points_earned,
    idempotency_key,
    created_by
  )
  SELECT
    p_cashier_id,
    p_customer_id,
    v_shift_id,
    ct.subtotal,
    ct.tax_amount,
    ct.total_amount,
    p_payment_method,
    'pending',
    'pending',
    ct.discount_amount,
    v_loyalty_points,
    p_idempotency_key,
    auth.uid()
  FROM public.calculate_sale_totals(v_subtotal, 16.00, p_loyalty_discount) ct
  RETURNING id INTO v_sale_id;

  -- Insert sale items
  INSERT INTO public.sale_items (
    sale_id,
    product_id,
    quantity,
    unit_price,
    tax_rate,
    line_total
  )
  SELECT
    v_sale_id,
    (item->>'product_id')::UUID,
    (item->>'quantity')::INTEGER,
    (item->>'unit_price')::DECIMAL,
    (item->>'tax_rate')::DECIMAL,
    (item->>'unit_price')::DECIMAL * (item->>'quantity')::INTEGER
  FROM jsonb_array_elements(p_items) AS item;

  -- Update inventory
  UPDATE public.products
  SET stock_on_hand = stock_on_hand - (item->>'quantity')::INTEGER,
      updated_at = now()
  FROM jsonb_array_elements(p_items) AS item
  WHERE products.id = (item->>'product_id')::UUID;

  -- Log audit event
  PERFORM public.log_audit_event('CREATE', 'sale', v_sale_id, NULL,
    jsonb_build_object(
      'cashier_id', p_cashier_id,
      'customer_id', p_customer_id,
      'total_amount', v_total_amount,
      'payment_method', p_payment_method
    )
  );

  RETURN QUERY SELECT v_sale_id, v_total_amount, v_loyalty_points;
END;
$$;

-- Function to validate payment completion
CREATE OR REPLACE FUNCTION public.validate_payment_completion(
  p_sale_id UUID,
  p_payment_method TEXT,
  p_amount_paid DECIMAL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale RECORD;
  v_total_paid DECIMAL := 0;
BEGIN
  -- Get sale details
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id;

  IF v_sale IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Calculate total paid
  v_total_paid := COALESCE(v_sale.cash_amount, 0) + COALESCE(v_sale.mpesa_amount, 0);

  -- Add new payment
  IF p_payment_method = 'cash' THEN
    v_total_paid := v_total_paid + p_amount_paid;
  ELSIF p_payment_method = 'mpesa' THEN
    v_total_paid := v_total_paid + p_amount_paid;
  END IF;

  -- Check if fully paid
  RETURN v_total_paid >= v_sale.total_amount;
END;
$$;

-- Function to calculate shift totals server-side
CREATE OR REPLACE FUNCTION public.calculate_shift_totals(p_shift_id UUID)
RETURNS TABLE(
  total_sales DECIMAL,
  cash_sales DECIMAL,
  mpesa_sales DECIMAL,
  total_transactions INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift RECORD;
BEGIN
  -- Get shift details
  SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;

  IF v_shift IS NULL THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;

  -- Calculate totals for the shift period
  RETURN QUERY
  SELECT
    COALESCE(SUM(s.total_amount), 0)::DECIMAL as total_sales,
    COALESCE(SUM(CASE WHEN s.payment_method = 'cash' THEN s.total_amount ELSE 0 END), 0)::DECIMAL as cash_sales,
    COALESCE(SUM(CASE WHEN s.payment_method = 'mpesa' THEN s.total_amount ELSE 0 END), 0)::DECIMAL as mpesa_sales,
    COUNT(*)::INTEGER as total_transactions
  FROM public.sales s
  WHERE s.shift_id = p_shift_id
  AND s.status = 'completed'
  AND s.created_at >= v_shift.start_time
  AND (v_shift.end_time IS NULL OR s.created_at <= v_shift.end_time);
END;
$$;

-- Function to validate shift closure
CREATE OR REPLACE FUNCTION public.validate_shift_closure(
  p_shift_id UUID,
  p_entered_closing_cash DECIMAL
)
RETURNS TABLE(
  expected_closing_cash DECIMAL,
  variance DECIMAL,
  is_valid BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift RECORD;
  v_total_sales DECIMAL;
  v_expected DECIMAL;
  v_variance DECIMAL;
BEGIN
  -- Get shift
  SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;

  IF v_shift IS NULL THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;

  -- Get total sales
  SELECT total_sales INTO v_total_sales
  FROM public.calculate_shift_totals(p_shift_id);

  v_expected := COALESCE(v_shift.opening_cash, 0) + v_total_sales;
  v_variance := p_entered_closing_cash - v_expected;

  RETURN QUERY SELECT
    v_expected,
    v_variance,
    (ABS(v_variance) <= 100) as is_valid; -- Allow 100 KSh variance
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.calculate_shift_totals(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_shift_closure(UUID, DECIMAL) TO authenticated;