-- Phase 1: Fix Critical Public Data Exposure

-- 1.1 Restrict Profiles Table Access
-- Drop the public policy
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Users can only view their own profile
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Admins can view all profiles (for user management)
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 1.2 Restrict Settings Table Access
-- Drop the public policy
DROP POLICY IF EXISTS "Anyone can view settings" ON public.settings;

-- Only authenticated users can view settings
CREATE POLICY "Authenticated users can view settings"
ON public.settings
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);