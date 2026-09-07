-- Notification System Database Setup
-- Run this in Supabase SQL Editor

-- 1. Create user_device_tokens table for storing FCM tokens
CREATE TABLE IF NOT EXISTS user_device_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  fcm_token TEXT NOT NULL UNIQUE,
  device_type TEXT, -- 'ios', 'android', 'web'
  device_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_device_tokens_user_id 
ON user_device_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_user_device_tokens_fcm_token 
ON user_device_tokens(fcm_token);

-- 3. Update notifications table structure
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- 4. Create updated_at trigger for user_device_tokens
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_device_tokens_updated_at 
BEFORE UPDATE ON user_device_tokens 
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- 5. Add RLS policies for user_device_tokens (optional - adjust based on your needs)
ALTER TABLE user_device_tokens ENABLE ROW LEVEL SECURITY;

-- Allow users to manage their own device tokens
CREATE POLICY "Users can view their own device tokens" 
ON user_device_tokens FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own device tokens" 
ON user_device_tokens FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own device tokens" 
ON user_device_tokens FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own device tokens" 
ON user_device_tokens FOR DELETE 
USING (auth.uid() = user_id);

-- Allow admins to manage all device tokens
CREATE POLICY "Admins can manage all device tokens" 
ON user_device_tokens FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = 'admin'
  )
);

-- 6. Sample data for testing (optional)
-- INSERT INTO user_device_tokens (user_id, fcm_token, device_type, device_name)
-- VALUES (
--   'your-user-uuid-here',
--   'sample-fcm-token-here',
--   'android',
--   'Test Device'
-- );

-- 7. Verify tables
SELECT 'user_device_tokens table created' as status,
       COUNT(*) as row_count 
FROM user_device_tokens;

SELECT 'notifications table columns verified' as status,
       column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'notifications' 
AND column_name IN ('status', 'sent_at', 'error_message');
