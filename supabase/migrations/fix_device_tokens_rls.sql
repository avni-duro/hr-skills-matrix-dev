-- Fix RLS on user_device_tokens to include super_admin role
-- The original notification_system.sql migration only checked for 'admin'
-- but missed 'super_admin', causing Active Logins to show empty for super admins

DROP POLICY IF EXISTS "Admins can manage all device tokens" ON user_device_tokens;

CREATE POLICY "Admins can manage all device tokens"
ON user_device_tokens
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
