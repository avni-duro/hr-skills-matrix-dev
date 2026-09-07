-- Create RPC function to get weekly signup counts (optimized for performance)
-- This is much faster than fetching all rows and grouping in JS
CREATE OR REPLACE FUNCTION get_weekly_signups()
RETURNS TABLE (week_index int, count bigint) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (6 - FLOOR((EXTRACT(EPOCH FROM (NOW() - created_at)) / (86400 * 7)))::int)::int as week_index,
    COUNT(*) as count
  FROM users
  WHERE created_at >= NOW() - INTERVAL '7 weeks'
  GROUP BY week_index
  ORDER BY week_index ASC;
END;
$$ LANGUAGE plpgsql;
