ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS leaving_date date;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS status text;

UPDATE public.users
SET status = lower(trim(status))
WHERE status IS NOT NULL;

UPDATE public.users
SET status = 'active'
WHERE status IS NULL OR status NOT IN ('active', 'inactive');

ALTER TABLE public.users
ALTER COLUMN status SET DEFAULT 'active';

ALTER TABLE public.users
DROP CONSTRAINT IF EXISTS users_status_check;

ALTER TABLE public.users
ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'inactive'));
