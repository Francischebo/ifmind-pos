-- Add role checks to stock management functions to prevent unauthorized access

-- Update increment_stock to check for admin/cashier role
CREATE OR REPLACE FUNCTION public.increment_stock(product_id uuid, quantity_change integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user has admin or cashier role
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'cashier'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins and cashiers can modify stock levels';
  END IF;
  
  UPDATE products
  SET stock_on_hand = stock_on_hand + quantity_change,
      updated_at = now()
  WHERE id = product_id;
END;
$$;

-- Update decrement_stock to check for admin/cashier role
CREATE OR REPLACE FUNCTION public.decrement_stock(product_id uuid, quantity_change integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user has admin or cashier role
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'cashier'::app_role)) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins and cashiers can modify stock levels';
  END IF;
  
  UPDATE products
  SET stock_on_hand = stock_on_hand - quantity_change,
      updated_at = now()
  WHERE id = product_id;
END;
$$;