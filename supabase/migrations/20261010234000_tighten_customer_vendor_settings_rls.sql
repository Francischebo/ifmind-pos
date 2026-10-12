-- Remove legacy permissive policies and make access explicit for staff roles.
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view customers" ON public.customers;
DROP POLICY IF EXISTS "Only admins and cashiers can view customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated admins and cashiers can view customers" ON public.customers;
DROP POLICY IF EXISTS "Admins and cashiers can manage customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated admins and cashiers can manage customers" ON public.customers;
DROP POLICY IF EXISTS "Staff can view customers" ON public.customers;
DROP POLICY IF EXISTS "Staff can manage customers" ON public.customers;

CREATE POLICY "Staff can view customers"
ON public.customers
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'cashier'::public.app_role)
  )
);

CREATE POLICY "Staff can manage customers"
ON public.customers
FOR ALL
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'cashier'::public.app_role)
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'cashier'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Anyone can view vendors" ON public.vendors;
DROP POLICY IF EXISTS "Only admins can view vendors" ON public.vendors;
DROP POLICY IF EXISTS "Admins can manage vendors" ON public.vendors;
DROP POLICY IF EXISTS "Admins can view vendors" ON public.vendors;

CREATE POLICY "Admins can view vendors"
ON public.vendors
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can manage vendors"
ON public.vendors
FOR ALL
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Anyone can view settings" ON public.settings;
DROP POLICY IF EXISTS "Authenticated users can view settings" ON public.settings;
DROP POLICY IF EXISTS "Admins can manage settings" ON public.settings;
DROP POLICY IF EXISTS "Admins can view settings" ON public.settings;

CREATE POLICY "Admins can view settings"
ON public.settings
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can manage settings"
ON public.settings
FOR ALL
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Defense in depth: anonymous requests should not have table privileges at all.
-- Trusted Edge Functions use the service_role key and are unaffected.
REVOKE ALL ON TABLE public.customers, public.vendors, public.settings FROM anon;
