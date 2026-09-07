-- Allow full re-uploads for m_enrollment_details by removing account_no+tier uniqueness.
-- Business logic uses created_at for month-based tier selection, so duplicate historical rows must be allowed.

DROP INDEX IF EXISTS public.uq_m_enrollment_account_tier;
