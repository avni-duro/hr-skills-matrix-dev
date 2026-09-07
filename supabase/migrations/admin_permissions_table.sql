-- ============================================
-- Admin Permissions Table
-- ============================================
-- This table stores per-admin screen access permissions.
-- super_admin users bypass this table entirely.
-- Only admin role users have rows here.
--
-- Run this in the Supabase SQL Editor.
-- ============================================

-- Create the admin_permissions table
CREATE TABLE IF NOT EXISTS public.admin_permissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  allowed_screens jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid REFERENCES public.users(id),
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT admin_permissions_user_id_unique UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read their own permissions
CREATE POLICY "Users can read own permissions"
  ON public.admin_permissions
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert/update (super_admin will do this from the admin panel)
CREATE POLICY "Admins can manage permissions"
  ON public.admin_permissions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_admin_permissions_user_id
  ON public.admin_permissions (user_id);
