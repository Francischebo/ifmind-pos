-- Allow admins to update any profile
CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete profiles
CREATE POLICY "Admins can delete profiles"
ON public.profiles
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create function to get user MFA status from auth.users
CREATE OR REPLACE FUNCTION public.get_user_mfa_status(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mfa_status boolean;
BEGIN
  SELECT 
    COALESCE(
      (SELECT COUNT(*) > 0 
       FROM auth.mfa_factors 
       WHERE auth.mfa_factors.user_id = get_user_mfa_status.user_id 
       AND status = 'verified'),
      false
    ) INTO mfa_status;
  
  RETURN mfa_status;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_mfa_status(uuid) TO authenticated;