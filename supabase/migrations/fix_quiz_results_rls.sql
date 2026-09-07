-- Fix RLS on user_quiz_results to allow admin/super_admin to see all records
-- This fixes the "Assignment Results not showing" issue for admin panel

-- Drop existing policies if any
DROP POLICY IF EXISTS "Admin full access quiz results" ON user_quiz_results;
DROP POLICY IF EXISTS "Users can view their own quiz results" ON user_quiz_results;

-- Enable RLS (in case it's not already enabled)
ALTER TABLE user_quiz_results ENABLE ROW LEVEL SECURITY;

-- Admin and Super Admin can read all quiz results
CREATE POLICY "Admin full access quiz results" ON user_quiz_results
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

-- Users can view their own quiz results
CREATE POLICY "Users can view their own quiz results" ON user_quiz_results
FOR SELECT
TO authenticated
USING (user_id = auth.uid());
