-- Create function to increment product stock (for receiving purchase orders)
CREATE OR REPLACE FUNCTION public.increment_stock(product_id uuid, quantity_change integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE products
  SET stock_on_hand = stock_on_hand + quantity_change,
      updated_at = now()
  WHERE id = product_id;
END;
$$;

-- Create function to decrement product stock (for sales)
CREATE OR REPLACE FUNCTION public.decrement_stock(product_id uuid, quantity_change integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE products
  SET stock_on_hand = stock_on_hand - quantity_change,
      updated_at = now()
  WHERE id = product_id;
END;
$$;