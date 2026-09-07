-- Allow multiple historical records per employee in goals_master.
-- Keep only one active record per employee (where ending_date is NULL).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'goals_master_employee_code_key'
      AND conrelid = 'public.goals_master'::regclass
  ) THEN
    ALTER TABLE public.goals_master
      DROP CONSTRAINT goals_master_employee_code_key;
  END IF;
END $$;

-- Defensive cleanup for older/manual unique index variants.
DROP INDEX IF EXISTS public.goals_master_employee_code_key;
DROP INDEX IF EXISTS public.idx_goals_master_employee_code_unique;

-- Keep employee_code index for lookups.
CREATE INDEX IF NOT EXISTS idx_goals_master_employee_code
  ON public.goals_master(employee_code);

-- Ensure only one active record per employee.
CREATE UNIQUE INDEX IF NOT EXISTS uq_goals_master_active_employee
  ON public.goals_master(employee_code)
  WHERE ending_date IS NULL;
