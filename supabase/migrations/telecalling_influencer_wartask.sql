-- TeleCalling Influencer War Task table
CREATE TABLE IF NOT EXISTS telecalling_influencer_wartask (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_date TEXT,
  task_no TEXT,
  influencer_market_city TEXT,
  influencer_type TEXT,
  influencer_id TEXT,
  influencer_name TEXT,
  primary_phone_no TEXT,
  secondary_phone_no TEXT,
  owner_name TEXT,
  task_priority TEXT,
  task_description TEXT,
  task_description2 TEXT,
  tele_caller_comment TEXT,
  status_as_on_today TEXT,
  status_change_date TEXT,
  status_elapse_days INTEGER DEFAULT 0,
  tele_calling_escalation TEXT,
  current_owner_type TEXT,
  current_owner_name TEXT,
  isr_contact_details TEXT,
  distributor_code TEXT,
  distributor_name TEXT,
  task_remark TEXT,
  order_status TEXT,
  so_no TEXT,
  so_amount TEXT,
  so_date TEXT,
  customer_latitude TEXT,
  customer_longitude TEXT,
  war_activity_lat TEXT,
  war_activity_long TEXT,
  distance_in_km TEXT,
  location_compliance TEXT,
  war_activity_date TEXT,
  state TEXT,
  call_type TEXT,
  caller_id TEXT,
  caller_name TEXT,
  mapped_isr_name TEXT,
  mapped_isr_code TEXT,
  influencer_tier TEXT,
  upload_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_telecalling_influencer_wartask_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER telecalling_influencer_wartask_updated_at
  BEFORE UPDATE ON telecalling_influencer_wartask
  FOR EACH ROW
  EXECUTE FUNCTION update_telecalling_influencer_wartask_updated_at();

ALTER TABLE telecalling_influencer_wartask ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read telecalling_influencer_wartask"
  ON telecalling_influencer_wartask FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow admin insert telecalling_influencer_wartask"
  ON telecalling_influencer_wartask FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Allow admin update telecalling_influencer_wartask"
  ON telecalling_influencer_wartask FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Allow admin delete telecalling_influencer_wartask"
  ON telecalling_influencer_wartask FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin'))
  );
