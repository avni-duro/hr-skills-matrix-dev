-- Create video_progress_report_schedules table
CREATE TABLE IF NOT EXISTS video_progress_report_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    frequency VARCHAR(50) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
    -- For weekly: 'monday', 'tuesday', ..., 'sunday' (comma-separated for multiple selections)
    -- For monthly: day of month (1-31)
    schedule_days VARCHAR(255),
    -- Time of day to send the report (HH:MM format)
    send_time TIME NOT NULL DEFAULT '09:00',
    -- Email recipients (comma-separated or JSON array)
    recipient_emails TEXT NOT NULL,
    -- Include branch filter for reports
    branch_id UUID REFERENCES branch_master(id),
    -- Report is active or disabled
    is_active BOOLEAN DEFAULT TRUE,
    -- Last sent timestamp
    last_sent_at TIMESTAMP WITH TIME ZONE,
    -- Next scheduled send time
    next_send_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_recipient_emails CHECK (
        recipient_emails ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(,\s*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})*$'
    )
);

-- Create index for faster queries
CREATE INDEX idx_video_progress_schedules_created_by ON video_progress_report_schedules(created_by);
CREATE INDEX idx_video_progress_schedules_target_user ON video_progress_report_schedules(target_user_id);
CREATE INDEX idx_video_progress_schedules_active ON video_progress_report_schedules(is_active);
CREATE INDEX idx_video_progress_schedules_next_send ON video_progress_report_schedules(next_send_at);

-- Enable Row Level Security
ALTER TABLE video_progress_report_schedules ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Super admins can see all schedules
CREATE POLICY "Super admins can view all video progress schedules" ON video_progress_report_schedules
    FOR SELECT USING (
        auth.jwt() ->> 'role' = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'super_admin'
        )
    );

-- RLS Policy: Admins can only see schedules they created
CREATE POLICY "Admins can view their own video progress schedules" ON video_progress_report_schedules
    FOR SELECT USING (
        auth.uid() = created_by
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- RLS Policy: Only admins can insert
CREATE POLICY "Only admins can create video progress schedules" ON video_progress_report_schedules
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'super_admin')
        )
        AND auth.uid() = created_by
    );

-- RLS Policy: Only admins can update their own schedules
CREATE POLICY "Admins can update their own video progress schedules" ON video_progress_report_schedules
    FOR UPDATE USING (
        auth.uid() = created_by
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'super_admin')
        )
    );

-- RLS Policy: Only admins can delete their own schedules
CREATE POLICY "Admins can delete their own video progress schedules" ON video_progress_report_schedules
    FOR DELETE USING (
        auth.uid() = created_by
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'super_admin')
        )
    );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_video_progress_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS trigger_video_progress_schedules_updated_at ON video_progress_report_schedules;
CREATE TRIGGER trigger_video_progress_schedules_updated_at
    BEFORE UPDATE ON video_progress_report_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_video_progress_schedules_updated_at();
