-- Holiday Master table
CREATE TABLE IF NOT EXISTS holiday_master (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  holiday TEXT,
  festival TEXT,
  day TEXT,
  date TEXT,
  andhra_pradesh TEXT,
  assam TEXT,
  bihar TEXT,
  chhattisgarh TEXT,
  delhi_corporate_office TEXT,
  gujarat TEXT,
  haryana TEXT,
  hp_tricity TEXT,
  jharkhand TEXT,
  karnataka TEXT,
  kerala TEXT,
  kolkata_head_office TEXT,
  madhya_pradesh TEXT,
  maharashtra TEXT,
  odisha TEXT,
  punjab TEXT,
  rajasthan TEXT,
  rajkot_factory TEXT,
  tamil_nadu TEXT,
  telangana TEXT,
  uttar_pradesh TEXT,
  west_bengal TEXT,
  western_uttar_pradesh TEXT,
  upload_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_holiday_master_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER holiday_master_updated_at
  BEFORE UPDATE ON holiday_master
  FOR EACH ROW
  EXECUTE FUNCTION update_holiday_master_updated_at();

ALTER TABLE holiday_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read holiday_master"
  ON holiday_master FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin insert holiday_master"
  ON holiday_master FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Allow admin update holiday_master"
  ON holiday_master FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Allow admin delete holiday_master"
  ON holiday_master FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin'))
  );
