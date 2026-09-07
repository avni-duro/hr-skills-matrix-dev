-- Fix RLS on quizzes and questions tables to allow admin/super_admin full access
-- This fixes the "add assignment" feature not working for admin role

-- ============================================================
-- 1. Fix quizzes table RLS
-- ============================================================
DROP POLICY IF EXISTS "Admin full access quizzes" ON quizzes;
DROP POLICY IF EXISTS "Users can view quizzes" ON quizzes;

ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;

-- Admin and Super Admin can do everything with quizzes
CREATE POLICY "Admin full access quizzes" ON quizzes
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

-- Users can view quizzes (for taking quizzes in the app)
CREATE POLICY "Users can view quizzes" ON quizzes
FOR SELECT
TO authenticated
USING (true);

-- ============================================================
-- 2. Fix questions table RLS
-- ============================================================
DROP POLICY IF EXISTS "Admin full access questions" ON questions;
DROP POLICY IF EXISTS "Users can view questions" ON questions;

ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

-- Admin and Super Admin can do everything with questions
CREATE POLICY "Admin full access questions" ON questions
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

-- Users can view questions (for taking quizzes in the app)
CREATE POLICY "Users can view questions" ON questions
FOR SELECT
TO authenticated
USING (true);
