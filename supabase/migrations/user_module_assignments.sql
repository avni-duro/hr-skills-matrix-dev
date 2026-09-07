-- Create user_module_assignments table for assigning modules to users with date ranges

CREATE TABLE IF NOT EXISTS public.user_module_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, module_id)
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_module_assignments_user_id ON public.user_module_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_module_assignments_module_id ON public.user_module_assignments(module_id);
CREATE INDEX IF NOT EXISTS idx_user_module_assignments_status ON public.user_module_assignments(status);
CREATE INDEX IF NOT EXISTS idx_user_module_assignments_dates ON public.user_module_assignments(start_date, end_date);

-- Enable RLS
ALTER TABLE public.user_module_assignments ENABLE ROW LEVEL SECURITY;

-- Policy for admin and super_admin to manage all assignments
CREATE POLICY "Admin and super_admin can manage all assignments"
  ON public.user_module_assignments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'super_admin')
    )
  );

-- Policy for users to view their own assignments
CREATE POLICY "Users can view their own assignments"
  ON public.user_module_assignments
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION public.update_user_module_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_module_assignments_updated_at
  BEFORE UPDATE ON public.user_module_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_module_assignments_updated_at();

-- Add comment
COMMENT ON TABLE public.user_module_assignments IS 'Stores module assignments for users with date ranges and status tracking';
