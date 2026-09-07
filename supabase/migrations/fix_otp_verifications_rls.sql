-- Allow admins and super_admins to read all otp_verifications records
-- Needed for Active Logins screen to show OTP-based login history

ALTER TABLE otp_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access otp_verifications" ON otp_verifications;

CREATE POLICY "Admin full access otp_verifications"
ON otp_verifications
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

-- Users can view their own OTP records
DROP POLICY IF EXISTS "Users can view own otp records" ON otp_verifications;

CREATE POLICY "Users can view own otp records"
ON otp_verifications
FOR SELECT
TO authenticated
USING (user_id = auth.uid());
