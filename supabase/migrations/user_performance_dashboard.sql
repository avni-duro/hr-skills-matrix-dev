-- Create user_performance_dashboard table for assigning Performance Dashboard access to users

CREATE TABLE IF NOT EXISTS public.user_performance_dashboard (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_performance_dashboard_user_id ON public.user_performance_dashboard(user_id);
CREATE INDEX IF NOT EXISTS idx_user_performance_dashboard_assigned_at ON public.user_performance_dashboard(assigned_at);

-- Enable RLS
ALTER TABLE public.user_performance_dashboard ENABLE ROW LEVEL SECURITY;

-- Policy for admin and super_admin to manage all assignments
CREATE POLICY "Admin and super_admin can manage performance dashboard assignments"
  ON public.user_performance_dashboard
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

-- Policy for users to view their own performance dashboard assignment
CREATE POLICY "Users can view their own performance dashboard assignment"
  ON public.user_performance_dashboard
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Store branch-level access for performance dashboard users
CREATE TABLE IF NOT EXISTS public.performance_dashboard_branch_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_performance_dashboard_branch_access_user_id
  ON public.performance_dashboard_branch_access(user_id);

CREATE INDEX IF NOT EXISTS idx_performance_dashboard_branch_access_branch_id
  ON public.performance_dashboard_branch_access(branch_id);

ALTER TABLE public.performance_dashboard_branch_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and super_admin can manage performance dashboard branch access"
  ON public.performance_dashboard_branch_access
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

CREATE POLICY "Users can view their own performance dashboard branch access"
  ON public.performance_dashboard_branch_access
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
