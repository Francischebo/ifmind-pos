-- Fix security issue: Restrict customer data access to authenticated admin and cashier users only
DROP POLICY IF EXISTS "Anyone can view customers" ON public.customers;

CREATE POLICY "Only admins and cashiers can view customers"
ON public.customers
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'cashier'::app_role));

-- Fix security issue: Restrict vendor data access to authenticated admin users only
DROP POLICY IF EXISTS "Anyone can view vendors" ON public.vendors;

CREATE POLICY "Only admins can view vendors"
ON public.vendors
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));