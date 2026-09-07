-- Fix RLS for category_department_access table
-- Allow admin and super_admin full access

ALTER TABLE IF EXISTS category_department_access ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow admin full access to category_department_access" ON category_department_access;
DROP POLICY IF EXISTS "Allow super_admin full access to category_department_access" ON category_department_access;
DROP POLICY IF EXISTS "Allow admin and super_admin full access to category_department_access" ON category_department_access;

-- Create combined policy for admin and super_admin
CREATE POLICY "Allow admin and super_admin full access to category_department_access"
ON category_department_access
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
