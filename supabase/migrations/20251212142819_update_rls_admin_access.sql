-- Drop existing policies if any
DROP POLICY IF EXISTS "Admin full access" ON module_user_access;
DROP POLICY IF EXISTS "Users can view their own access" ON module_user_access;

-- Enable RLS
ALTER TABLE module_user_access ENABLE ROW LEVEL SECURITY;

-- Create policy for admin full access
CREATE POLICY "Admin full access" ON module_user_access
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Create policy for users to view their own access
CREATE POLICY "Users can view their own access" ON module_user_access
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Similarly update module_access_requests table
DROP POLICY IF EXISTS "Admin full access requests" ON module_access_requests;
DROP POLICY IF EXISTS "Users can view their own requests" ON module_access_requests;
DROP POLICY IF EXISTS "Users can create requests" ON module_access_requests;

ALTER TABLE module_access_requests ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "Admin full access requests" ON module_access_requests
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Users can view their own requests
CREATE POLICY "Users can view their own requests" ON module_access_requests
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can create requests for themselves
CREATE POLICY "Users can create requests" ON module_access_requests
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Update module_department_access table
DROP POLICY IF EXISTS "Admin full access department" ON module_department_access;
DROP POLICY IF EXISTS "Users can view department access" ON module_department_access;

ALTER TABLE module_department_access ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin full access department" ON module_department_access
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Users can view department access (for checking module availability)
CREATE POLICY "Users can view department access" ON module_department_access
FOR SELECT
TO authenticated
USING (true);
