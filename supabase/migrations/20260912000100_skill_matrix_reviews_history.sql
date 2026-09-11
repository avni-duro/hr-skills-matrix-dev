-- Keep every review as a permanent history entry instead of overwriting
-- the row for the same rating period.
--
-- Before this migration, skill_matrix_reviews had a unique index on
-- (employee_user_id, rating_period), so a second review in the same
-- period silently replaced the first one and its submitted_at/created_at
-- was lost. Dropping that index makes every submit insert a new row,
-- so the reporting manager's review history stays intact.
--
-- Existing rows are not touched or deleted by this migration.
drop index if exists public.uq_skill_matrix_reviews_employee_period;

-- created_at already has an index (idx_skill_matrix_reviews_created_at)
-- which the history list uses to order entries newest first.
