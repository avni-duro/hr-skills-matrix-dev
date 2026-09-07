-- ============================================================
-- Performance Dashboard Master Tables
-- Master data for calculating performance scores
-- ============================================================

-- 1. Sheet Point Master  (brand → points per sheet)
CREATE TABLE IF NOT EXISTS public.sheet_point_master (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  upload_session_id UUID REFERENCES public.excel_upload_sessions(id) ON DELETE SET NULL,
  brand_name TEXT NOT NULL UNIQUE,
  points_per_sheet NUMERIC NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sheet_point_master_brand ON public.sheet_point_master(brand_name);

-- 2. Goals Master  (employee monthly sheet target)
CREATE TABLE IF NOT EXISTS public.goals_master (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  upload_session_id UUID REFERENCES public.excel_upload_sessions(id) ON DELETE SET NULL,
  employee_code TEXT NOT NULL UNIQUE,
  designation TEXT,
  monthly_sheet_goal NUMERIC NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_goals_master_employee_code ON public.goals_master(employee_code);
CREATE INDEX IF NOT EXISTS idx_goals_master_designation ON public.goals_master(designation);

-- ── updated_at triggers ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sheet_point_master_updated_at
  BEFORE UPDATE ON public.sheet_point_master
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_goals_master_updated_at
  BEFORE UPDATE ON public.goals_master
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.sheet_point_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on sheet_point_master"
  ON public.sheet_point_master FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'super_admin')
  ));

CREATE POLICY "Authenticated users can read sheet_point_master"
  ON public.sheet_point_master FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin full access on goals_master"
  ON public.goals_master FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'super_admin')
  ));

CREATE POLICY "Authenticated users can read goals_master"
  ON public.goals_master FOR SELECT TO authenticated
  USING (true);
