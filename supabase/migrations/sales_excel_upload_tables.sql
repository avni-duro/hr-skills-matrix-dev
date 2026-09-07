-- ============================================================
-- Sales Excel Upload Tables
-- Stores daily data uploaded from 6 Excel report files
-- ============================================================

-- Upload session log (tracks each file upload)
CREATE TABLE IF NOT EXISTS public.excel_upload_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sheet_type TEXT NOT NULL,  -- 'influencer_claim' | 'influencer_enrollment' | 'influencer_visit' | 'lead_details' | 'lead_task' | 'm_enrollment'
  file_name TEXT NOT NULL,
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  rows_inserted INTEGER DEFAULT 0,
  rows_skipped INTEGER DEFAULT 0,
  upload_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'partial', 'failed')),
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_sheet_type ON public.excel_upload_sessions(sheet_type);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_upload_date ON public.excel_upload_sessions(upload_date DESC);

-- ============================================================
-- 1. Influencer Claim Stage Details
-- ============================================================
CREATE TABLE IF NOT EXISTS public.influencer_claim_details (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  upload_session_id UUID REFERENCES public.excel_upload_sessions(id) ON DELETE CASCADE,
  parent_claim_no TEXT,
  claim_no TEXT UNIQUE,
  claim_date DATE,
  account_number TEXT,
  influencer_name TEXT,
  influencer_type TEXT,
  influencer_market_city TEXT,
  mobile_no TEXT,
  pincode TEXT,
  influencer_city TEXT,
  influencer_district TEXT,
  influencer_state TEXT,
  mapped_isr_code TEXT,
  claim_approved_by TEXT,
  dealer_district TEXT,
  dealer_state TEXT,
  customer_name TEXT,
  customer_mobile_no TEXT,
  site_address TEXT,
  purchase_date TEXT,
  invoice_no TEXT,
  product_code TEXT,
  dealer_name TEXT,
  dealer_code TEXT,
  dealer_gst TEXT,
  distributor_name TEXT,
  distributor_code TEXT,
  base_point_per_sheet NUMERIC,
  claimed_qty_sheets NUMERIC,
  approved_qty NUMERIC,
  approved_points NUMERIC,
  status TEXT,
  status_date DATE,
  se_approved_qty NUMERIC,
  se_verification_status TEXT,
  se_verification_by TEXT,
  se_verification_on DATE,
  se_verification_remark TEXT,
  se_rejection_reason TEXT,
  state_head_name TEXT,
  state_head_approved_qty NUMERIC,
  state_head_verification_status TEXT,
  state_head_site_visit_required TEXT,
  state_head_site_visited TEXT,
  state_head_verification_by TEXT,
  state_head_verification_on DATE,
  state_head_verification_remark TEXT,
  state_head_rejection_reason TEXT,
  lvl3_approved_by TEXT,
  lvl3_status TEXT,
  lvl3_approved_qty NUMERIC,
  lvl3_remark TEXT,
  lvl3_rejection_remark TEXT,
  sales_data_not_available TEXT,
  dealer_volume_bank_exhausted TEXT,
  war_task_no TEXT,
  war_task_description TEXT,
  war_task_date DATE,
  war_task_assign_to TEXT,
  war_task_status TEXT,
  war_task_status_date DATE,
  submitted_by TEXT,
  source TEXT,
  total_attempts INTEGER,
  last_attempt_date TEXT,
  market_city_state TEXT,
  war_task_generated TEXT,
  war_task_assigned TEXT,
  influencer_tier TEXT,
  lead_number TEXT,
  site_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_influencer_claim_account ON public.influencer_claim_details(account_number);
CREATE INDEX IF NOT EXISTS idx_influencer_claim_status ON public.influencer_claim_details(status);
CREATE INDEX IF NOT EXISTS idx_influencer_claim_date ON public.influencer_claim_details(claim_date);

-- ============================================================
-- 2. Influencer Enrollment Detail
-- ============================================================
CREATE TABLE IF NOT EXISTS public.influencer_enrollment_details (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  upload_session_id UUID REFERENCES public.excel_upload_sessions(id) ON DELETE CASCADE,
  influencer_id TEXT UNIQUE,
  se_name TEXT,
  enrollment_date DATE,
  influencer_name TEXT,
  influencer_type TEXT,
  mobile_no TEXT,
  secondary_number TEXT,
  permanent_address TEXT,
  village TEXT,
  city TEXT,
  market_city TEXT,
  district TEXT,
  state TEXT,
  pincode TEXT,
  language TEXT,
  market TEXT,
  visit_days TEXT,
  retailer TEXT,
  active_status TEXT,
  kyc_documents TEXT,
  last_visited_days INTEGER,
  visit_date DATE,
  opening_points NUMERIC,
  earned_points NUMERIC,
  redeemed_points NUMERIC,
  closing_points NUMERIC,
  points_banking_start_date DATE,
  last_login_date DATE,
  segment TEXT,
  address_city TEXT,
  address_district TEXT,
  address_state TEXT,
  anniversary_date DATE,
  enrolled_by_dso_code TEXT,
  enrolled_by_dso_name TEXT,
  mapped_by_dso_code TEXT,
  mapped_by_dso_name TEXT,
  market_city_state TEXT,
  source_name TEXT,
  influencer_tier TEXT,
  selling_branch TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_influencer_enrollment_id ON public.influencer_enrollment_details(influencer_id);
CREATE INDEX IF NOT EXISTS idx_influencer_enrollment_state ON public.influencer_enrollment_details(state);

-- ============================================================
-- 3. Influencer Visit Report
-- ============================================================
CREATE TABLE IF NOT EXISTS public.influencer_visit_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  upload_session_id UUID REFERENCES public.excel_upload_sessions(id) ON DELETE CASCADE,
  influencer_code TEXT,
  influencer_name TEXT,
  remarks TEXT,
  visit_date DATE,
  visit_time TEXT,
  influencer_location TEXT,
  district TEXT,
  state TEXT,
  start_outlet_time TEXT,
  end_outlet_time TEXT,
  time_spent_at_outlet TEXT,
  emp_login TEXT,
  emp_name TEXT,
  days_since_last_visit INTEGER,
  market_city TEXT,
  mapped_isr_name TEXT,
  mapped_isr_code TEXT,
  influencer_tier TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_influencer_visit_code ON public.influencer_visit_reports(influencer_code);
CREATE INDEX IF NOT EXISTS idx_influencer_visit_date ON public.influencer_visit_reports(visit_date);

-- ============================================================
-- 4. Lead Details Report
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lead_details_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  upload_session_id UUID REFERENCES public.excel_upload_sessions(id) ON DELETE CASCADE,
  lead_code TEXT UNIQUE,
  created_date DATE,
  project_name TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  address TEXT,
  landmark TEXT,
  locality TEXT,
  sub_locality TEXT,
  city TEXT,
  district TEXT,
  sub_district TEXT,
  state TEXT,
  pincode TEXT,
  source_of_lead TEXT,
  type_of_project TEXT,
  lead_stage TEXT,
  lead_status TEXT,
  decision_maker TEXT,
  expected_maturity_date DATE,
  linked_dealer TEXT,
  linked_influencer TEXT,
  linked_architect TEXT,
  type_of_contact TEXT,
  no_of_pending_tasks INTEGER,
  no_of_completed_tasks INTEGER,
  pending_task_assigned_to TEXT,
  latest_task_type TEXT,
  latest_task_scheduled_date DATE,
  latest_task_status TEXT,
  latest_task_assign_to TEXT,
  lead_last_update_date DATE,
  lead_created_by TEXT,
  task_created_by TEXT,
  contact_type TEXT,
  contact_person TEXT,
  mobile_no TEXT,
  whatsapp_no TEXT,
  email_id TEXT,
  old_lead_status TEXT,
  ageing INTEGER,
  market_city TEXT,
  lead_assign_to TEXT,
  lead_assign_date DATE,
  lead_status_changed_on DATE,
  on_site_location TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_details_code ON public.lead_details_reports(lead_code);
CREATE INDEX IF NOT EXISTS idx_lead_details_status ON public.lead_details_reports(lead_status);
CREATE INDEX IF NOT EXISTS idx_lead_details_date ON public.lead_details_reports(created_date);

-- ============================================================
-- 5. Lead Task Report
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lead_task_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  upload_session_id UUID REFERENCES public.excel_upload_sessions(id) ON DELETE CASCADE,
  lead_id TEXT,
  lead_status TEXT,
  task_type TEXT,
  task_assign_to_dso_code TEXT,
  task_assign_to_dso_name TEXT,
  task_created_by_dso_code TEXT,
  task_created_by_dso_name TEXT,
  purpose TEXT,
  task_created_on DATE,
  schedule_date DATE,
  contact_person TEXT,
  contact_no TEXT,
  discussion_point TEXT,
  task_last_updated_date DATE,
  task_status TEXT,
  remark TEXT,
  district TEXT,
  state TEXT,
  task_location_remark TEXT,
  market_city TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_task_lead_id ON public.lead_task_reports(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_task_status ON public.lead_task_reports(task_status);
CREATE INDEX IF NOT EXISTS idx_lead_task_date ON public.lead_task_reports(schedule_date);

-- ============================================================
-- 6. M Enrollment (Master Enrollment)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.m_enrollment_details (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  upload_session_id UUID REFERENCES public.excel_upload_sessions(id) ON DELETE CASCADE,
  account_no TEXT UNIQUE,
  salutation TEXT,
  first_name TEXT,
  middle_name TEXT,
  last_name TEXT,
  date_of_birth DATE,
  gender TEXT,
  dealer TEXT,
  enrolled_by TEXT,
  enrolment_date DATE,
  mapped_by TEXT,
  mapping_date DATE,
  market_city TEXT,
  mapped_isr TEXT,
  mobile_no TEXT,
  whatsapp_no TEXT,
  is_own_firm TEXT,
  email_id TEXT,
  firm_name TEXT,
  firm_address TEXT,
  permanent_address TEXT,
  village TEXT,
  city TEXT,
  state TEXT,
  district TEXT,
  landmark TEXT,
  area TEXT,
  sub_area TEXT,
  pincode TEXT,
  influencer_area TEXT,
  area_type TEXT,
  visit_day TEXT,
  link_retailer TEXT,
  languages TEXT,
  bank_name TEXT,
  ifsc_code TEXT,
  bank_account_number TEXT,
  account_holder_name TEXT,
  branch_name TEXT,
  documents TEXT,
  document_no TEXT,
  is_active TEXT,
  enrolled TEXT,
  tele_verification TEXT,
  tele_verification_by TEXT,
  tele_verification_remark TEXT,
  physical_verification TEXT,
  physical_verification_by TEXT,
  physical_verification_remark TEXT,
  tier TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_m_enrollment_account ON public.m_enrollment_details(account_no);
CREATE INDEX IF NOT EXISTS idx_m_enrollment_mobile ON public.m_enrollment_details(mobile_no);

-- ============================================================
-- Enable RLS on all tables
-- ============================================================
ALTER TABLE public.excel_upload_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencer_claim_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencer_enrollment_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencer_visit_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_details_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_task_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m_enrollment_details ENABLE ROW LEVEL SECURITY;

-- Admin/super_admin full access policy (applied to all tables)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'excel_upload_sessions',
    'influencer_claim_details',
    'influencer_enrollment_details',
    'influencer_visit_reports',
    'lead_details_reports',
    'lead_task_reports',
    'm_enrollment_details'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY "Admin full access on %1$s"
       ON public.%1$s FOR ALL TO authenticated
       USING (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN (''admin'',''super_admin'')))
       WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN (''admin'',''super_admin'')));',
      tbl
    );
  END LOOP;
END $$;
