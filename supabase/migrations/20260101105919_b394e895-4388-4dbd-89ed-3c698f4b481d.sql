-- ============================================
-- FIX SECURITY ERROR 1: Profiles table exposure
-- ============================================

-- Drop existing permissive policies and create restrictive ones
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- Require authentication for all profile access
CREATE POLICY "Authenticated users can view own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() IS NOT NULL AND auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
USING (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'admin'::app_role));

-- ============================================
-- FIX SECURITY ERROR 2: Customers table exposure
-- ============================================

-- Drop existing policies and recreate with explicit auth check
DROP POLICY IF EXISTS "Only admins and cashiers can view customers" ON public.customers;
DROP POLICY IF EXISTS "Admins and cashiers can manage customers" ON public.customers;

-- Require authentication explicitly
CREATE POLICY "Authenticated admins and cashiers can view customers"
ON public.customers
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'cashier'::app_role))
);

CREATE POLICY "Authenticated admins and cashiers can manage customers"
ON public.customers
FOR ALL
USING (
  auth.uid() IS NOT NULL 
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'cashier'::app_role))
)
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'cashier'::app_role))
);

-- ============================================
-- FIX WARNING 3: Products/Categories public access
-- ============================================

-- Restrict products to authenticated users only
DROP POLICY IF EXISTS "Anyone can view products" ON public.products;

CREATE POLICY "Authenticated users can view products"
ON public.products
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Restrict categories to authenticated users only
DROP POLICY IF EXISTS "Anyone can view categories" ON public.categories;

CREATE POLICY "Authenticated users can view categories"
ON public.categories
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- ============================================
-- FIX WARNING 4: Stock movements system bypass
-- ============================================

-- Remove overly permissive system policy and require proper auth
DROP POLICY IF EXISTS "System can create stock movements" ON public.stock_movements;

-- Allow authenticated admins and cashiers to create stock movements
CREATE POLICY "Authenticated staff can create stock movements"
ON public.stock_movements
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'cashier'::app_role))
);

-- ============================================
-- PERFORMANCE OPTIMIZATIONS: Add indexes
-- ============================================

-- Indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_sales_cashier_id ON public.sales(cashier_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON public.sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON public.sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_status ON public.sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_payment_status ON public.sales(payment_status);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON public.sale_items(product_id);

CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_stock_on_hand ON public.products(stock_on_hand);
CREATE INDEX IF NOT EXISTS idx_products_name_search ON public.products USING gin(to_tsvector('english', name));

CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_sale_id ON public.invoices(sale_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(due_date);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_name_search ON public.customers USING gin(to_tsvector('english', name));

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON public.stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_movement_type ON public.stock_movements(movement_type);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor_id ON public.purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders(status);

CREATE INDEX IF NOT EXISTS idx_delivery_notes_po_id ON public.delivery_notes(po_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_vendor_id ON public.delivery_notes(vendor_id);

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_vendor_id ON public.supplier_invoices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_status ON public.supplier_invoices(status);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

CREATE INDEX IF NOT EXISTS idx_mpesa_transactions_sale_id ON public.mpesa_transactions(sale_id);
CREATE INDEX IF NOT EXISTS idx_mpesa_transactions_checkout_request_id ON public.mpesa_transactions(checkout_request_id);

-- ============================================
-- Add phone number validation constraint
-- ============================================

ALTER TABLE public.mpesa_transactions 
DROP CONSTRAINT IF EXISTS valid_phone_number;

ALTER TABLE public.mpesa_transactions 
ADD CONSTRAINT valid_phone_number 
CHECK (phone_number ~ '^254[0-9]{9}$');