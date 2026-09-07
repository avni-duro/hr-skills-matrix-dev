/**
 * DMI Points Calculation - SQL Queries for Supabase/PostgreSQL
 * 
 * These queries support the staged calculation approach:
 * 1. Selected month claims
 * 2. Active accounts in selected month
 * 3. Prior active account history in previous 2 FY
 * 4-10. Processed in JavaScript service
 */

-- ============================================================================
-- STAGE 1: Get Selected Month Claims
-- Input: employee_id, month, year
-- ============================================================================
SELECT
  icd.mapped_isr_code,
  icd.account_number,
  icd.approved_qty,
  icd.status_date,
  icd.id
FROM influencer_claim_details icd
WHERE icd.mapped_isr_code = $1
  AND EXTRACT(MONTH FROM icd.status_date) = $2
  AND EXTRACT(YEAR FROM icd.status_date) = $3
ORDER BY icd.status_date;


-- ============================================================================
-- STAGE 2: Get Prior 2 FY Claims for History Window
-- Input: employee_id, current_month, current_year
-- Maps calendar to FY:
--   Apr-Dec => same FY start year
--   Jan-Mar => FY start year - 1
-- ============================================================================
-- Helper: Get FY start date for history window
WITH fy_window AS (
  SELECT
    CASE
      WHEN $2 >= 4 THEN date_trunc('year', make_date($3, 4, 1))::date
      ELSE date_trunc('year', make_date($3 - 1, 4, 1))::date
    END - interval '2 years' AS history_start_date,
    CASE
      WHEN $2 >= 4 THEN date_trunc('year', make_date($3, 4, 1))::date
      ELSE date_trunc('year', make_date($3 - 1, 4, 1))::date
    END - interval '1 day' AS current_fy_day_before
)
SELECT
  icd.mapped_isr_code,
  icd.account_number,
  icd.approved_qty,
  icd.status_date,
  icd.id
FROM influencer_claim_details icd, fy_window
WHERE icd.mapped_isr_code = $1
  AND icd.status_date >= fy_window.history_start_date
  AND icd.status_date < fy_window.current_fy_day_before
ORDER BY icd.status_date;


-- ============================================================================
-- STAGE 3: Get m_enrollment_details for Tier Resolution
-- Input: account_numbers (array of strings)
-- ============================================================================
SELECT
  med.account_no,
  med.tier,
  med.created_at,
  med.mapped_isr
FROM m_enrollment_details med
WHERE med.account_no = ANY($1)
ORDER BY med.account_no, med.created_at DESC;


-- ============================================================================
-- STAGE 4: Get influencer_enrollment_details for Tier Fallback
-- Input: account_numbers (array of strings)
-- Note: Matching influencer_id to account_number
-- ============================================================================
SELECT
  ied.influencer_id,
  ied.influencer_tier,
  ied.enrollment_date
FROM influencer_enrollment_details ied
WHERE ied.influencer_id = ANY($1)
ORDER BY ied.influencer_id, ied.enrollment_date DESC;


-- ============================================================================
-- STAGE 5: Get DMI Points Master
-- Returns points_per_dmi for each tier
-- ============================================================================
SELECT
  dpm.tier,
  dpm.points_per_dmi
FROM dmi_raw_points_master dpm
ORDER BY dpm.tier;


-- ============================================================================
-- STAGE 6: Get Tier Upgrade Data
-- Input: employee_id, month, year
-- ============================================================================
SELECT
  tur.mapped_isr,
  tur.change_type,
  tur.previous_tier,
  tur.new_tier,
  tur.tier_change_date,
  tur.id
FROM tier_upgrade_performance_report tur
WHERE tur.mapped_isr = $1
  AND EXTRACT(MONTH FROM tur.tier_change_date) = $2
  AND EXTRACT(YEAR FROM tur.tier_change_date) = $3
  AND tur.change_type = 'Tier Upgrade'
  AND tur.previous_tier IN ('Bronze', 'Silver', 'Gold')
ORDER BY tur.tier_change_date;


-- ============================================================================
-- COMPREHENSIVE AGGREGATE QUERY (Optional for single API call)
-- Returns all needed data in one shot
-- Input: employee_id, month, year
-- ============================================================================

WITH fy_calc AS (
  SELECT
    CASE
      WHEN $2 >= 4 THEN $3
      ELSE $3 - 1
    END AS current_fy,
    CASE
      WHEN $2 >= 4 THEN date_trunc('year', make_date($3, 4, 1))::date
      ELSE date_trunc('year', make_date($3 - 1, 4, 1))::date
    END AS current_fy_start,
    CASE
      WHEN $2 >= 4 THEN date_trunc('year', make_date($3, 4, 1))::date - interval '1 day'
      ELSE date_trunc('year', make_date($3 - 1, 4, 1))::date - interval '1 day'
    END AS current_fy_end_before
),
selected_month_claims AS (
  SELECT
    icd.account_number,
    icd.approved_qty,
    icd.status_date,
    icd.id
  FROM influencer_claim_details icd
  WHERE icd.mapped_isr_code = $1
    AND EXTRACT(MONTH FROM icd.status_date) = $2
    AND EXTRACT(YEAR FROM icd.status_date) = $3
),
active_accounts AS (
  SELECT
    account_number,
    SUM(approved_qty) as total_qty
  FROM selected_month_claims
  GROUP BY account_number
  HAVING SUM(approved_qty) >= 10
),
prior_history_claims AS (
  SELECT
    icd.account_number,
    icd.approved_qty,
    DATE_TRUNC('month', icd.status_date) as claim_month
  FROM influencer_claim_details icd, fy_calc
  WHERE icd.mapped_isr_code = $1
    AND icd.status_date >= (fy_calc.current_fy_start - interval '2 years')
    AND icd.status_date < fy_calc.current_fy_start
),
prior_active_months AS (
  SELECT DISTINCT
    account_number
  FROM (
    SELECT
      account_number,
      claim_month,
      SUM(approved_qty) as monthly_qty
    FROM prior_history_claims
    GROUP BY account_number, claim_month
    HAVING SUM(approved_qty) >= 10
  ) x
),
account_classification AS (
  SELECT
    aa.account_number,
    CASE
      WHEN pam.account_number IS NOT NULL THEN 'EXISTING_DMI'
      ELSE 'NEW_DMI'
    END as classification,
    aa.total_qty
  FROM active_accounts aa
  LEFT JOIN prior_active_months pam ON aa.account_number = pam.account_number
)
SELECT
  'account_classification' as result_type,
  jsonb_agg(
    jsonb_build_object(
      'account_number', account_number,
      'classification', classification,
      'total_qty', total_qty
    )
  ) as data
FROM account_classification

UNION ALL

SELECT
  'tier_data' as result_type,
  jsonb_agg(
    jsonb_build_object(
      'account_no', med.account_no,
      'tier', med.tier,
      'source', 'primary'
    )
  )
FROM m_enrollment_details med
WHERE med.account_no IN (SELECT account_number FROM active_accounts)

UNION ALL

SELECT
  'tier_upgrade_data' as result_type,
  jsonb_agg(
    jsonb_build_object(
      'mapped_isr', tur.mapped_isr,
      'change_type', tur.change_type,
      'previous_tier', tur.previous_tier,
      'new_tier', tur.new_tier,
      'tier_change_date', tur.tier_change_date
    )
  )
FROM tier_upgrade_performance_report tur
WHERE tur.mapped_isr = $1
  AND EXTRACT(MONTH FROM tur.tier_change_date) = $2
  AND EXTRACT(YEAR FROM tur.tier_change_date) = $3
  AND tur.change_type = 'Tier Upgrade'
  AND tur.previous_tier IN ('Bronze', 'Silver', 'Gold');
