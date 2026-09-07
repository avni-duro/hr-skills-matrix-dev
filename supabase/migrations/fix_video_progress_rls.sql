-- Fix RLS on user_video_progress to allow admin to see all records

-- Drop existing policies if any
DROP POLICY IF EXISTS "Admin full access video progress" ON user_video_progress;
DROP POLICY IF EXISTS "Users can view their own video progress" ON user_video_progress;

-- Enable RLS (in case it's not already enabled)
ALTER TABLE user_video_progress ENABLE ROW LEVEL SECURITY;

-- Admin can read all video progress records
CREATE POLICY "Admin full access video progress" ON user_video_progress
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

-- Users can view their own video progress
CREATE POLICY "Users can view their own video progress" ON user_video_progress
FOR SELECT
TO authenticated
USING (user_id = auth.uid());
