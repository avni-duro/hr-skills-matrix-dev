-- Working Days Master table
CREATE TABLE IF NOT EXISTS working_days_master (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  state_month TEXT UNIQUE,
  jan INTEGER DEFAULT 0,
  feb INTEGER DEFAULT 0,
  mar INTEGER DEFAULT 0,
  apr INTEGER DEFAULT 0,
  may INTEGER DEFAULT 0,
  jun INTEGER DEFAULT 0,
  jul INTEGER DEFAULT 0,
  aug INTEGER DEFAULT 0,
  sep INTEGER DEFAULT 0,
  oct INTEGER DEFAULT 0,
  nov INTEGER DEFAULT 0,
  dec INTEGER DEFAULT 0,
  annual_total INTEGER DEFAULT 0,
  holidays_annual INTEGER DEFAULT 0,
  upload_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_working_days_master_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER working_days_master_updated_at
  BEFORE UPDATE ON working_days_master
  FOR EACH ROW
  EXECUTE FUNCTION update_working_days_master_updated_at();

ALTER TABLE working_days_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read working_days_master"
  ON working_days_master FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin insert working_days_master"
  ON working_days_master FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Allow admin update working_days_master"
  ON working_days_master FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Allow admin delete working_days_master"
  ON working_days_master FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin'))
  );
