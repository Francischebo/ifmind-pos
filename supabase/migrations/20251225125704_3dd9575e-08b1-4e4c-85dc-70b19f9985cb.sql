-- Add loyalty_points_rate setting (points per KES spent)
-- This allows admin to configure how many points customers earn per KES

-- Default: 1 point per 100 KES spent
INSERT INTO public.settings (key, value) VALUES 
  ('loyalty_points_rate', '1'),
  ('loyalty_points_per_amount', '100'),
  ('loyalty_tier_silver_min', '50000'),
  ('loyalty_tier_gold_min', '150000'),
  ('loyalty_tier_platinum_min', '300000')
ON CONFLICT (key) DO NOTHING;

-- Add mpesa_receipt_number column to sales for easy tracking
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS mpesa_receipt_number TEXT;

-- Enable realtime for loyalty_members table
ALTER PUBLICATION supabase_realtime ADD TABLE public.loyalty_members;