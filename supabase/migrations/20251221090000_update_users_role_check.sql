-- Update users.role check constraint to allow the new 'test' role
-- Run this via Supabase CLI migrations or paste into the Supabase SQL editor.

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('user', 'admin', 'super_admin', 'trainer', 'test'));
