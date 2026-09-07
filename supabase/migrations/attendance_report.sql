-- Attendance Report table
CREATE TABLE IF NOT EXISTS attendance_report (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT,
  employee_id TEXT,
  login_id TEXT,
  mobile_no TEXT,
  state TEXT,
  district TEXT,
  area_manager TEXT,
  branch TEXT,
  latitude TEXT,
  longitude TEXT,
  attendance_location TEXT,
  attendance_date TEXT,
  attendance_time TEXT,
  end_day_time TEXT,
  end_day_lat TEXT,
  end_day_long TEXT,
  end_day_location TEXT,
  work_hrs TEXT,
  leave_type TEXT,
  attendance_reason TEXT,
  attendance_status TEXT,
  attendance_remark TEXT,
  payroll_company TEXT,
  upload_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_attendance_report_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER attendance_report_updated_at
  BEFORE UPDATE ON attendance_report
  FOR EACH ROW
  EXECUTE FUNCTION update_attendance_report_updated_at();

ALTER TABLE attendance_report ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read attendance_report"
  ON attendance_report FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin insert attendance_report"
  ON attendance_report FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Allow admin update attendance_report"
  ON attendance_report FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Allow admin delete attendance_report"
  ON attendance_report FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin'))
  );
