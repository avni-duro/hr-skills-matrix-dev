-- Update ALL admin RLS policies to include super_admin role
-- This is needed because the original policies only checked for 'admin'
-- but the system now has 'super_admin' role as well

-- ============================================================
-- 1. Fix user_video_progress RLS
-- ============================================================
DROP POLICY IF EXISTS "Admin full access video progress" ON user_video_progress;

CREATE POLICY "Admin full access video progress" ON user_video_progress
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'super_admin')
  )
);

-- ============================================================
-- 2. Fix module_user_access RLS
-- ============================================================
DROP POLICY IF EXISTS "Admin full access" ON module_user_access;

CREATE POLICY "Admin full access" ON module_user_access
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'super_admin')
  )
);

-- ============================================================
-- 3. Fix module_access_requests RLS
-- ============================================================
DROP POLICY IF EXISTS "Admin full access requests" ON module_access_requests;

CREATE POLICY "Admin full access requests" ON module_access_requests
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'super_admin')
  )
);

-- ============================================================
-- 4. Fix module_department_access RLS
-- ============================================================
DROP POLICY IF EXISTS "Admin full access department" ON module_department_access;

CREATE POLICY "Admin full access department" ON module_department_access
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'super_admin')
  )
);
