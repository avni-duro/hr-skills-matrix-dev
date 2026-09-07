-- Give all currently assigned users access to both DGO and Calculator.
-- This overwrites whatever access_type value each row currently holds.

update public.user_performance_dashboard
set access_type = array['DGO', 'Calculator']::text[]
where true;
