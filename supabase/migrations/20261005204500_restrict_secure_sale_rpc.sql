DO $$
DECLARE
  v_function RECORD;
  v_role RECORD;
  v_found BOOLEAN := FALSE;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_secure_sale'
  LOOP
    v_found := TRUE;
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC',
      v_function.signature
    );

    FOR v_role IN
      SELECT rolname
      FROM pg_roles
      WHERE rolname IN ('anon', 'authenticated', 'service_role')
    LOOP
      EXECUTE format(
        'REVOKE ALL ON FUNCTION %s FROM %I',
        v_function.signature,
        v_role.rolname
      );
    END LOOP;

    IF EXISTS (
      SELECT 1
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(
        COALESCE(p.proacl, acldefault('f', p.proowner))
      ) privilege
      WHERE p.oid = v_function.signature::oid
        AND privilege.grantee = 0
        AND privilege.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'PUBLIC can still execute create_secure_sale: %',
        v_function.signature;
    END IF;

    FOR v_role IN
      SELECT rolname
      FROM pg_roles
      WHERE rolname IN ('anon', 'authenticated', 'service_role')
    LOOP
      IF has_function_privilege(v_role.rolname, v_function.signature, 'EXECUTE') THEN
        RAISE EXCEPTION 'create_secure_sale remains executable by %: %',
          v_role.rolname,
          v_function.signature;
      END IF;
    END LOOP;
  END LOOP;

  IF NOT v_found THEN
    RAISE NOTICE 'No public.create_secure_sale function exists; no RPC execution path is available';
  END IF;
END;
$$;
