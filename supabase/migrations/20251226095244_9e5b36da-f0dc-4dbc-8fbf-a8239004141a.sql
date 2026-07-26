-- Add settings for points redemption value (how much KES each point is worth)
INSERT INTO public.settings (key, value)
VALUES ('loyalty_points_value', '1')
ON CONFLICT (key) DO NOTHING;

-- Add column to sales for tracking loyalty discount applied
ALTER TABLE public.sales 
ADD COLUMN IF NOT EXISTS loyalty_discount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS loyalty_points_redeemed integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS loyalty_points_earned integer DEFAULT 0;