-- Add payment tracking columns to sales table
ALTER TABLE public.sales 
ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS cash_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS mpesa_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS change_amount numeric DEFAULT 0;

-- Add index for payment status queries
CREATE INDEX IF NOT EXISTS idx_sales_payment_status ON public.sales(payment_status);

-- Update mpesa_transactions table for better tracking
ALTER TABLE public.mpesa_transactions
ADD COLUMN IF NOT EXISTS checkout_request_id text,
ADD COLUMN IF NOT EXISTS merchant_request_id text,
ADD COLUMN IF NOT EXISTS callback_received boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS callback_data jsonb;

-- Add index for checkout request lookups
CREATE INDEX IF NOT EXISTS idx_mpesa_checkout_request ON public.mpesa_transactions(checkout_request_id);

-- Create policy for updating mpesa transactions (for callback handler)
CREATE POLICY "Service role can update mpesa transactions"
ON public.mpesa_transactions
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Add realtime for mpesa_transactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.mpesa_transactions;