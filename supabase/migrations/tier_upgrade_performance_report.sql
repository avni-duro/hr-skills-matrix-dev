-- Tier Upgrade Performance Report table
CREATE TABLE IF NOT EXISTS tier_upgrade_performance_report (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dmi_id TEXT,
  dmi_name TEXT,
  dmi_market_city TEXT,
  district TEXT,
  state TEXT,
  tier_change_date TEXT,
  previous_tier TEXT,
  new_tier TEXT,
  change_type TEXT,
  reason_for_change TEXT,
  changed_by TEXT,
  effective_from TEXT,
  account_status TEXT,
  tier_change_frequency INTEGER DEFAULT 0,
  mapped_isr TEXT,
  fy_claimpoint NUMERIC DEFAULT 0,
  fy_tierpoints NUMERIC DEFAULT 0,
  upload_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_tier_upgrade_performance_report_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tier_upgrade_performance_report_updated_at
  BEFORE UPDATE ON tier_upgrade_performance_report
  FOR EACH ROW
  EXECUTE FUNCTION update_tier_upgrade_performance_report_updated_at();

-- RLS
ALTER TABLE tier_upgrade_performance_report ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read tier_upgrade_performance_report"
  ON tier_upgrade_performance_report FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Allow admin insert tier_upgrade_performance_report"
  ON tier_upgrade_performance_report FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Allow admin update tier_upgrade_performance_report"
  ON tier_upgrade_performance_report FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Allow admin delete tier_upgrade_performance_report"
  ON tier_upgrade_performance_report FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'super_admin'))
  );
