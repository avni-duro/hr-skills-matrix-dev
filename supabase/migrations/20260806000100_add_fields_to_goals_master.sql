-- Add additional metadata columns to goals_master without touching existing columns/rows
-- Requested fields: employee name, reporting manager, reporting manager id,
-- quarter, starting date, ending date.

ALTER TABLE public.goals_master
  ADD COLUMN IF NOT EXISTS employee_name TEXT,
  ADD COLUMN IF NOT EXISTS reporting_manager TEXT,
  ADD COLUMN IF NOT EXISTS reporting_manager_id TEXT,
  ADD COLUMN IF NOT EXISTS quarter TEXT,
  ADD COLUMN IF NOT EXISTS starting_date DATE,
  ADD COLUMN IF NOT EXISTS ending_date DATE;

-- Optional backfill from users table (best effort, no row deletion/modification of existing goal values)
-- Assumes goals_master.employee_code maps to users.employee_id.
UPDATE public.goals_master gm
SET
  employee_name = COALESCE(gm.employee_name, u.full_name),
  reporting_manager_id = COALESCE(gm.reporting_manager_id, m.employee_id, u.reporting_manager),
  reporting_manager = COALESCE(gm.reporting_manager, m.full_name)
FROM public.users u
LEFT JOIN public.users m
  ON m.employee_id = u.reporting_manager
WHERE gm.employee_code = u.employee_id
  AND (
    gm.employee_name IS NULL
    OR gm.reporting_manager_id IS NULL
    OR gm.reporting_manager IS NULL
  );

-- Helpful indexes for common filtering
CREATE INDEX IF NOT EXISTS idx_goals_master_quarter
  ON public.goals_master(quarter);

CREATE INDEX IF NOT EXISTS idx_goals_master_starting_date
  ON public.goals_master(starting_date);

CREATE INDEX IF NOT EXISTS idx_goals_master_ending_date
  ON public.goals_master(ending_date);
