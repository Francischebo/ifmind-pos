-- =====================================================
-- ENTERPRISE POS SYSTEM MIGRATION
-- Complete Business Flow Implementation
-- =====================================================

-- 1. INVOICES TABLE - Formal document linking to sales
-- Status: DRAFT -> ISSUED -> PARTIALLY_PAID -> PAID -> CANCELLED
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  balance_due NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'partially_paid', 'paid', 'cancelled', 'void')),
  due_date DATE,
  issued_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on invoices
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and cashiers can view invoices"
ON public.invoices FOR SELECT
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'cashier'));

CREATE POLICY "Admins and cashiers can create invoices"
ON public.invoices FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'cashier'));

CREATE POLICY "Admins and cashiers can update invoices"
ON public.invoices FOR UPDATE
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'cashier'));

-- 2. INVOICE PAYMENTS - Track partial payments against invoices
CREATE TABLE public.invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'mpesa', 'bank_transfer', 'cheque', 'credit')),
  reference_number TEXT,
  mpesa_receipt TEXT,
  notes TEXT,
  received_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view invoice payments"
ON public.invoice_payments FOR SELECT
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'cashier'));

CREATE POLICY "Staff can create invoice payments"
ON public.invoice_payments FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'cashier'));

-- 3. DELIVERY NOTES (GRN) - Goods Received Notes
-- Created when receiving goods from PO
CREATE TABLE public.delivery_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_number TEXT NOT NULL UNIQUE,
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  received_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'completed', 'disputed')),
  notes TEXT,
  total_items INTEGER NOT NULL DEFAULT 0,
  total_value NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage delivery notes"
ON public.delivery_notes FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can view delivery notes"
ON public.delivery_notes FOR SELECT
USING (has_role(auth.uid(), 'cashier'));

-- 4. DELIVERY NOTE ITEMS - Individual items in GRN
CREATE TABLE public.delivery_note_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_id UUID NOT NULL REFERENCES public.delivery_notes(id) ON DELETE CASCADE,
  po_item_id UUID REFERENCES public.po_items(id) ON DELETE SET NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  ordered_quantity INTEGER NOT NULL,
  received_quantity INTEGER NOT NULL CHECK (received_quantity >= 0),
  rejected_quantity INTEGER NOT NULL DEFAULT 0 CHECK (rejected_quantity >= 0),
  rejection_reason TEXT,
  unit_cost NUMERIC NOT NULL,
  line_total NUMERIC NOT NULL,
  batch_number TEXT,
  expiry_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_note_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage delivery note items"
ON public.delivery_note_items FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can view delivery note items"
ON public.delivery_note_items FOR SELECT
USING (has_role(auth.uid(), 'cashier'));

-- 5. SUPPLIER INVOICES - Bills from vendors
CREATE TABLE public.supplier_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  po_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  delivery_note_id UUID REFERENCES public.delivery_notes(id) ON DELETE SET NULL,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  balance_due NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partially_paid', 'paid', 'overdue', 'disputed', 'void')),
  payment_terms TEXT,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(vendor_id, invoice_number)
);

ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage supplier invoices"
ON public.supplier_invoices FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- 6. SUPPLIER PAYMENTS - Track payments to vendors
CREATE TABLE public.supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_invoice_id UUID NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'mpesa', 'bank_transfer', 'cheque')),
  reference_number TEXT,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  paid_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage supplier payments"
ON public.supplier_payments FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- 7. STOCK MOVEMENTS - Complete audit trail for inventory
CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'sale', 'sale_return', 'purchase_receipt', 'purchase_return',
    'adjustment_in', 'adjustment_out', 'transfer_in', 'transfer_out',
    'damaged', 'expired', 'initial_stock', 'correction'
  )),
  quantity INTEGER NOT NULL,
  quantity_before INTEGER NOT NULL,
  quantity_after INTEGER NOT NULL,
  unit_cost NUMERIC,
  reference_type TEXT NOT NULL CHECK (reference_type IN (
    'sale', 'return', 'delivery_note', 'transfer', 'adjustment', 'initial'
  )),
  reference_id UUID,
  location_id UUID,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view stock movements"
ON public.stock_movements FOR SELECT
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'cashier'));

CREATE POLICY "Admins can create stock movements"
ON public.stock_movements FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "System can create stock movements"
ON public.stock_movements FOR INSERT
WITH CHECK (true);

-- 8. CUSTOMER CREDIT - B2B credit management
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS credit_limit NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS credit_balance NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS credit_terms TEXT DEFAULT 'COD',
ADD COLUMN IF NOT EXISTS tax_pin TEXT,
ADD COLUMN IF NOT EXISTS business_name TEXT,
ADD COLUMN IF NOT EXISTS is_business BOOLEAN DEFAULT false;

-- 9. VENDOR PAYABLES SUMMARY VIEW - Track outstanding payables
-- Add balance columns to vendors
ALTER TABLE public.vendors
ADD COLUMN IF NOT EXISTS outstanding_balance NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_paid NUMERIC DEFAULT 0;

-- 10. UPDATE RETURNS TABLE - Add proper fields
ALTER TABLE public.returns
ADD COLUMN IF NOT EXISTS processed_by UUID,
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS stock_restored BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS return_items JSONB;

-- 11. UPDATE PURCHASE ORDERS - Add partially_received status
-- Note: status column already exists, just ensuring proper values are used

-- 12. CREATE SEQUENCE FOR DOCUMENT NUMBERS
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS grn_number_seq START 1001;

-- 13. FUNCTION: Generate Invoice Number
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_number TEXT;
BEGIN
  SELECT 'INV-' || TO_CHAR(CURRENT_DATE, 'YYMM') || '-' || LPAD(nextval('invoice_number_seq')::TEXT, 5, '0')
  INTO new_number;
  RETURN new_number;
END;
$$;

-- 14. FUNCTION: Generate GRN Number
CREATE OR REPLACE FUNCTION public.generate_grn_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_number TEXT;
BEGIN
  SELECT 'GRN-' || TO_CHAR(CURRENT_DATE, 'YYMM') || '-' || LPAD(nextval('grn_number_seq')::TEXT, 5, '0')
  INTO new_number;
  RETURN new_number;
END;
$$;

-- 15. FUNCTION: Record Stock Movement (Audit Trail)
CREATE OR REPLACE FUNCTION public.record_stock_movement(
  p_product_id UUID,
  p_movement_type TEXT,
  p_quantity INTEGER,
  p_reference_type TEXT,
  p_reference_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quantity_before INTEGER;
  v_quantity_after INTEGER;
  v_unit_cost NUMERIC;
  v_movement_id UUID;
BEGIN
  -- Get current stock and cost
  SELECT stock_on_hand, unit_cost INTO v_quantity_before, v_unit_cost
  FROM products WHERE id = p_product_id FOR UPDATE;
  
  v_quantity_after := v_quantity_before + p_quantity;
  
  -- Update product stock
  UPDATE products 
  SET stock_on_hand = v_quantity_after, updated_at = now()
  WHERE id = p_product_id;
  
  -- Insert movement record
  INSERT INTO stock_movements (
    product_id, movement_type, quantity, quantity_before, quantity_after,
    unit_cost, reference_type, reference_id, notes, created_by
  ) VALUES (
    p_product_id, p_movement_type, p_quantity, v_quantity_before, v_quantity_after,
    v_unit_cost, p_reference_type, p_reference_id, p_notes, COALESCE(p_created_by, auth.uid())
  ) RETURNING id INTO v_movement_id;
  
  RETURN v_movement_id;
END;
$$;

-- 16. FUNCTION: Update Invoice Balance on Payment
CREATE OR REPLACE FUNCTION public.update_invoice_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update invoice paid_amount and balance
  UPDATE invoices
  SET 
    paid_amount = paid_amount + NEW.amount,
    balance_due = total_amount - (paid_amount + NEW.amount),
    status = CASE 
      WHEN total_amount <= (paid_amount + NEW.amount) THEN 'paid'
      WHEN (paid_amount + NEW.amount) > 0 THEN 'partially_paid'
      ELSE status
    END,
    paid_at = CASE 
      WHEN total_amount <= (paid_amount + NEW.amount) THEN now()
      ELSE paid_at
    END,
    updated_at = now()
  WHERE id = NEW.invoice_id;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_invoice_on_payment
AFTER INSERT ON public.invoice_payments
FOR EACH ROW EXECUTE FUNCTION public.update_invoice_on_payment();

-- 17. FUNCTION: Update Supplier Invoice on Payment
CREATE OR REPLACE FUNCTION public.update_supplier_invoice_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update supplier invoice
  UPDATE supplier_invoices
  SET 
    paid_amount = paid_amount + NEW.amount,
    balance_due = total_amount - (paid_amount + NEW.amount),
    status = CASE 
      WHEN total_amount <= (paid_amount + NEW.amount) THEN 'paid'
      WHEN (paid_amount + NEW.amount) > 0 THEN 'partially_paid'
      ELSE status
    END,
    updated_at = now()
  WHERE id = NEW.supplier_invoice_id;
  
  -- Update vendor outstanding balance
  UPDATE vendors
  SET 
    outstanding_balance = outstanding_balance - NEW.amount,
    total_paid = total_paid + NEW.amount
  WHERE id = NEW.vendor_id;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_supplier_invoice_on_payment
AFTER INSERT ON public.supplier_payments
FOR EACH ROW EXECUTE FUNCTION public.update_supplier_invoice_on_payment();

-- 18. FUNCTION: Process Delivery Note and Update Stock
CREATE OR REPLACE FUNCTION public.process_delivery_note(
  p_delivery_note_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
BEGIN
  -- Process each item in the delivery note
  FOR v_item IN 
    SELECT * FROM delivery_note_items WHERE delivery_note_id = p_delivery_note_id
  LOOP
    -- Record stock movement
    PERFORM record_stock_movement(
      v_item.product_id,
      'purchase_receipt',
      v_item.received_quantity,
      'delivery_note',
      p_delivery_note_id,
      'Received via GRN'
    );
  END LOOP;
  
  -- Update delivery note status
  UPDATE delivery_notes
  SET status = 'completed', updated_at = now()
  WHERE id = p_delivery_note_id;
  
  RETURN TRUE;
END;
$$;

-- 19. FUNCTION: Process Return and Restore Stock
CREATE OR REPLACE FUNCTION public.process_return_stock(
  p_return_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_return RECORD;
  v_sale_item RECORD;
BEGIN
  SELECT * INTO v_return FROM returns WHERE id = p_return_id;
  
  IF v_return.stock_restored THEN
    RETURN FALSE; -- Already processed
  END IF;
  
  -- Get original sale items and restore stock
  FOR v_sale_item IN 
    SELECT si.product_id, si.quantity 
    FROM sale_items si 
    WHERE si.sale_id = v_return.sale_id
  LOOP
    -- Record stock movement (positive = adding back)
    PERFORM record_stock_movement(
      v_sale_item.product_id,
      'sale_return',
      v_sale_item.quantity,
      'return',
      p_return_id,
      'Stock restored from return'
    );
  END LOOP;
  
  -- Mark return as processed
  UPDATE returns
  SET stock_restored = true, processed_at = now()
  WHERE id = p_return_id;
  
  RETURN TRUE;
END;
$$;

-- 20. Enable Realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.supplier_invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_movements;

-- 21. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON public.invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_po ON public.delivery_notes(po_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_vendor ON public.delivery_notes(vendor_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_vendor ON public.supplier_invoices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_status ON public.supplier_invoices(status);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON public.stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON public.stock_movements(created_at DESC);