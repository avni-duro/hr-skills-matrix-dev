ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS reporting_manager text;
