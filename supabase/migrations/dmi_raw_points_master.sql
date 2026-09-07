-- ============================================================
-- DMI Raw Points Master Table
-- Maps tiers to points per DMI
-- ============================================================

CREATE TABLE IF NOT EXISTS public.dmi_raw_points_master (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  upload_session_id UUID REFERENCES public.excel_upload_sessions(id) ON DELETE SET NULL,
  tier TEXT NOT NULL UNIQUE,
  points_per_dmi NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dmi_raw_points_master_tier ON public.dmi_raw_points_master(tier);

-- ── updated_at trigger ──────────────────────────────────────
CREATE TRIGGER trg_dmi_raw_points_master_updated_at
  BEFORE UPDATE ON public.dmi_raw_points_master
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.dmi_raw_points_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on dmi_raw_points_master"
  ON public.dmi_raw_points_master FOR ALL TO authenticated
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

CREATE POLICY "Authenticated users can read dmi_raw_points_master"
  ON public.dmi_raw_points_master FOR SELECT TO authenticated
  USING (true);
