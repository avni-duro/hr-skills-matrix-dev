-- ============================================================
-- Brand Category Master Table
-- Maps brand names to their categories
-- ============================================================

CREATE TABLE IF NOT EXISTS public.brand_category_master (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  upload_session_id UUID REFERENCES public.excel_upload_sessions(id) ON DELETE SET NULL,
  brand_name TEXT NOT NULL UNIQUE,
  brand_category TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brand_category_master_brand ON public.brand_category_master(brand_name);
CREATE INDEX IF NOT EXISTS idx_brand_category_master_category ON public.brand_category_master(brand_category);

-- ── updated_at trigger ──────────────────────────────────────
CREATE TRIGGER trg_brand_category_master_updated_at
  BEFORE UPDATE ON public.brand_category_master
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.brand_category_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on brand_category_master"
  ON public.brand_category_master FOR ALL TO authenticated
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

CREATE POLICY "Authenticated users can read brand_category_master"
  ON public.brand_category_master FOR SELECT TO authenticated
  USING (true);
