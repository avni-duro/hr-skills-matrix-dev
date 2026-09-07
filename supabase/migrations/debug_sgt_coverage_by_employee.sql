-- ============================================================
-- SGT Coverage Goal Check - July 2026
-- Set employee code ONCE below, rest runs automatically
-- ============================================================

-- !! SET YOUR EMPLOYEE CODE HERE !!
WITH params AS (
  SELECT 'D10599' AS emp_code    -- <-- change this only
),

-- Step 1: Get the GLOBALLY latest enrollment per account (no ISR filter yet)
latest_enrollment AS (
  SELECT DISTINCT ON (account_no)
    account_no,
    tier,
    is_active,
    mapped_isr
  FROM m_enrollment_details
  ORDER BY account_no, created_at DESC
),

-- Step 2: Filter to only active S/G/T accounts whose LATEST enrollment belongs to this employee
active_accounts AS (
  SELECT
    account_no,
    tier,
    mapped_isr
  FROM latest_enrollment, params p
  WHERE mapped_isr ILIKE (p.emp_code || '%')
    AND tier IN ('Silver', 'Gold', 'Titanium')
    AND LOWER(TRIM(is_active)) IN ('true', 't', '1', 'yes', 'y')
),

-- Step 2: SGT visits in July (deduplicated by day)
july_visits AS (
  SELECT DISTINCT
    v.influencer_code,
    DATE_TRUNC('day', v.visit_date::date) AS visit_day,
    v.mapped_isr_code
  FROM influencer_visit_reports v, params p
  WHERE v.influencer_tier IN ('Silver', 'Gold', 'Titanium')
    AND v.mapped_isr_code ILIKE (p.emp_code || '%')
    AND v.visit_date >= '2026-07-01'
    AND v.visit_date <  '2026-08-01'
    AND v.influencer_code IN (SELECT account_no FROM active_accounts)
),

-- Step 3: Cap at 1 visit per influencer per month
monthly_capped AS (
  SELECT
    influencer_code,
    mapped_isr_code             AS jul_mapped_isr,
    LEAST(COUNT(*), 1)          AS capped_visits
  FROM july_visits
  GROUP BY influencer_code, mapped_isr_code
),

-- Step 4: Summary totals
summary AS (
  SELECT
    COUNT(*)                                        AS total_active_sgt_accounts,
    COUNT(*) FILTER (WHERE a.tier = 'Silver')       AS silver_count,
    COUNT(*) FILTER (WHERE a.tier = 'Gold')         AS gold_count,
    COUNT(*) FILTER (WHERE a.tier = 'Titanium')     AS titanium_count,
    COUNT(*)                                        AS total_goal,
    SUM(COALESCE(v.capped_visits, 0))               AS total_achieved
  FROM active_accounts a
  LEFT JOIN monthly_capped v ON v.influencer_code = a.account_no
)

-- ============================================================
-- ACCOUNT-LEVEL DETAIL
-- ============================================================
SELECT
  a.account_no,
  a.tier,
  a.mapped_isr                                        AS enrolled_mapped_isr,
  1                                                   AS monthly_goal,
  COALESCE(v.capped_visits, 0)                       AS visited_in_jul,
  COALESCE(v.jul_mapped_isr, 'NOT VISITED')          AS jul_visit_mapped_isr,
  CASE
    WHEN COALESCE(v.capped_visits, 0) >= 1 THEN 'VISITED'
    ELSE 'PENDING'
  END                                                 AS status
FROM active_accounts a
LEFT JOIN monthly_capped v ON v.influencer_code = a.account_no
ORDER BY
  CASE a.tier
    WHEN 'Titanium' THEN 1
    WHEN 'Gold'     THEN 2
    WHEN 'Silver'   THEN 3
    ELSE 4
  END,
  status DESC,   -- VISITED first, then PENDING
  a.account_no;

-- ============================================================
-- Uncomment below to see SUMMARY totals instead of detail
-- ============================================================
-- SELECT * FROM summary;
