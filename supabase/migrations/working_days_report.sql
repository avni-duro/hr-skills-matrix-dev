-- Working Days Report table
CREATE TABLE IF NOT EXISTS working_days_report (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month TEXT,
  state TEXT,
  working_days INTEGER DEFAULT 0,
  upload_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_working_days_report_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER working_days_report_updated_at
  BEFORE UPDATE ON working_days_report
  FOR EACH ROW
  EXECUTE FUNCTION update_working_days_report_updated_at();

ALTER TABLE working_days_report ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read working_days_report"
  ON working_days_report FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin insert working_days_report"
  ON working_days_report FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Allow admin update working_days_report"
  ON working_days_report FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Allow admin delete working_days_report"
  ON working_days_report FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin'))
  );
