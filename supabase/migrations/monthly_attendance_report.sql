-- Monthly Attendance Report table
CREATE TABLE IF NOT EXISTS monthly_attendance_report (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  record_key TEXT UNIQUE,
  employee_code TEXT,
  full_name TEXT,
  employment_status TEXT,
  company TEXT,
  business_unit TEXT,
  department TEXT,
  designation TEXT,
  branch TEXT,
  sub_branch TEXT,
  attendance_date DATE,
  working_hour TEXT,
  shift_code TEXT,
  shift_timings TEXT,
  attendance_status TEXT,
  checkin_timings TEXT,
  upload_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_monthly_attendance_report_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER monthly_attendance_report_updated_at
  BEFORE UPDATE ON monthly_attendance_report
  FOR EACH ROW
  EXECUTE FUNCTION update_monthly_attendance_report_updated_at();

ALTER TABLE monthly_attendance_report ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read monthly_attendance_report"
  ON monthly_attendance_report FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin insert monthly_attendance_report"
  ON monthly_attendance_report FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Allow admin update monthly_attendance_report"
  ON monthly_attendance_report FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Allow admin delete monthly_attendance_report"
  ON monthly_attendance_report FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin'))
  );
