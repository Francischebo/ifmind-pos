DO $$
BEGIN
    IF to_regclass('public.sales') IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'sales'
             AND column_name = 'status'
       ) THEN
        ALTER TABLE public.sales
        DROP CONSTRAINT IF EXISTS sales_status_check;

        ALTER TABLE public.sales
        ADD CONSTRAINT sales_status_check
        CHECK (status::text = ANY (ARRAY[
            'completed',
            'pending',
            'voided',
            'partially_refunded',
            'parked'
        ]::text[]));
    END IF;
END
$$;
