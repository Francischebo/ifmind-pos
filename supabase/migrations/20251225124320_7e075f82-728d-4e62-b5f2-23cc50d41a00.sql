-- Drop the existing check constraint and add a new one that includes 'hybrid'
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;

ALTER TABLE public.sales 
ADD CONSTRAINT sales_payment_method_check 
CHECK (payment_method = ANY (ARRAY['cash'::text, 'mpesa'::text, 'hybrid'::text]));

-- Add UPDATE policy for sales table so sales can be updated after creation
CREATE POLICY "Cashiers can update their own sales"
ON public.sales
FOR UPDATE
USING (cashier_id = auth.uid())
WITH CHECK (cashier_id = auth.uid());