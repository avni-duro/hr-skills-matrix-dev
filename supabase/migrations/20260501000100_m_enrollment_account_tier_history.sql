-- Allow storing account history by tier in m_enrollment_details.
-- Old behavior enforced one row per account_no.
-- New behavior allows multiple rows per account_no, but only one per account_no+tier.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'm_enrollment_details_account_no_key'
      AND conrelid = 'public.m_enrollment_details'::regclass
  ) THEN
    ALTER TABLE public.m_enrollment_details
      DROP CONSTRAINT m_enrollment_details_account_no_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_m_enrollment_account_tier
  ON public.m_enrollment_details (account_no, tier);
