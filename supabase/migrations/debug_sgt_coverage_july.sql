-- ============================================================
-- SGT Coverage Breakdown - July 2026
-- Shows: account_no, tier, monthly_goal, visited_in_jul,
--        mapped_isr_code (from influencer_visit_reports in Jul)
-- Change 'D10599' below to the ASM/DGO employee code to check
-- ============================================================

WITH

-- Step 1: Latest enrollment per account (to get current tier)
latest_enrollment AS (
  SELECT DISTINCT ON (account_no)
    account_no,
    tier,
    is_active,
    mapped_isr
  FROM m_enrollment_details
  WHERE mapped_isr ILIKE 'D10599%'   -- <-- change to your employee code
  ORDER BY account_no, created_at DESC
),

-- Step 2: Filter to only active S/G/T accounts
active_accounts AS (
  SELECT
    account_no,
    tier,
    mapped_isr
  FROM latest_enrollment
  WHERE tier IN ('Silver', 'Gold', 'Titanium')
    AND (
      LOWER(TRIM(is_active)) = 'true'
      OR LOWER(TRIM(is_active)) = 't'
      OR LOWER(TRIM(is_active)) = '1'
      OR LOWER(TRIM(is_active)) = 'yes'
      OR LOWER(TRIM(is_active)) = 'y'
    )
),

-- Step 3: Achieved visits in July (deduplicated by day per influencer)
july_visits AS (
  SELECT DISTINCT
    influencer_code,
    DATE_TRUNC('day', visit_date::date) AS visit_day,
    influencer_tier,
    mapped_isr_code
  FROM influencer_visit_reports
  WHERE influencer_tier IN ('Silver', 'Gold', 'Titanium')
    AND mapped_isr_code ILIKE 'D10599%'   -- <-- change to your employee code
    AND visit_date >= '2026-07-01'
    AND visit_date < '2026-08-01'
    AND influencer_code IN (SELECT account_no FROM active_accounts)
),

-- Step 4: Cap at 1 visit per influencer per month
monthly_capped AS (
  SELECT
    influencer_code,
    influencer_tier,
    mapped_isr_code,
    COUNT(*) AS raw_visit_days,
    LEAST(COUNT(*), 1) AS capped_visits
  FROM july_visits
  GROUP BY influencer_code, influencer_tier, mapped_isr_code
)

-- Step 5: Final result - all active accounts with Jul visit count + mapped_isr
SELECT
  a.account_no,
  a.tier,
  a.mapped_isr                               AS enrolled_mapped_isr,
  1                                          AS monthly_goal,
  COALESCE(v.capped_visits, 0)              AS visited_in_jul,
  COALESCE(v.mapped_isr_code, 'NOT VISITED') AS mapped_isr_code_in_jul,
  CASE
    WHEN COALESCE(v.capped_visits, 0) >= 1 THEN 'VISITED'
    ELSE 'PENDING'
  END                                        AS status
FROM active_accounts a
LEFT JOIN monthly_capped v ON v.influencer_code = a.account_no
ORDER BY
  CASE a.tier
    WHEN 'Titanium' THEN 1
    WHEN 'Gold'     THEN 2
    WHEN 'Silver'   THEN 3
    ELSE 4
  END,
  a.account_no;
