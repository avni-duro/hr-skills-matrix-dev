/**
 * DMI Points Calculation - API Response Schemas
 * 
 * This file defines the structure of responses from the DMI Points Service
 */

/**
 * Individual Monthly DMI Calculation Response
 * 
 * Returned by: calculateEmployeeDMIPoints(employeeId, month, year)
 */
export const DMICalculationResponse = {
  // Period identifiers
  employee_id: 'string', // Mapped ISR Code
  period_month: 'number', // 1-12
  period_year: 'number', // YYYY

  // Active DMI Metrics
  active_dmi_count: 'number', // Total active accounts in selected month (SUM approved_qty >= 10)
  existing_dmi_count: 'number', // Active accounts with tier resolution (after fallback exclusion)
  new_dmi_count: 'number', // New accounts with no prior 2-FY history

  // Existing DMI Points Breakdown
  existing_dmi_raw_points: 'number', // SUM(active_dmi_count_for_tier * points_per_dmi)
  average_sheets_per_dmi: 'number', // total approved sheets / existing_dmi_count
  existing_dmi_points: 'number', // ROUND(existing_dmi_raw_points * multiplier)

  // New DMI Points
  new_dmi_points: 'number', // new_dmi_count * 10

  // Tier Upgrade Points
  tier_upgraded_dmi_count: 'number', // Count of tier upgrade records (excluding non-qualifying tiers)
  tier_upgraded_dmi_points: 'number', // tier_upgraded_dmi_count * 25

  // Total
  total_dmi_points: 'number', // existing_dmi_points + new_dmi_points + tier_upgraded_dmi_points

  // Detailed Breakdown
  breakdown: {
    existing_dmi_accounts: ['array of account numbers'],
    new_dmi_accounts: ['array of account numbers'],
    tier_grouping: {
      'Bronze': 'number',
      'Silver': 'number',
      'Gold': 'number',
      // ... other tiers
    },
    multiplier_applied: 'number', // 0.15, 0.50, or 1.00
  },

  // Optional: warnings if any data fetch errors occurred
  warnings: ['array of error messages'],
};

/**
 * Batch DMI Calculation Response
 * 
 * Returned by: calculateBatchDMIPoints(params)
 * 
 * Each element is either:
 */
export const BatchDMIResponse = [
  {
    status: 'success',
    data: 'DMICalculationResponse', // See above
  },
  {
    status: 'error',
    employeeId: 'string',
    period: 'string', // "month/year"
    error: 'string', // error message
  },
];

/**
 * DMI Points Summary Response (Annual/Quarterly/Monthly Aggregation)
 * 
 * Returned by: getDMIPointsSummary(employeeId, periodType, year, month?, quarter?)
 */
export const DMISummaryResponse = {
  employee_id: 'string',
  period_type: 'string', // 'monthly', 'quarterly', or 'annual'
  period_year: 'number', // YYYY

  // Aggregated Totals
  total_active_dmi: 'number', // Sum of active_dmi_count across all periods
  total_new_dmi: 'number', // Sum of new_dmi_count
  total_existing_dmi_points: 'number', // Sum of existing_dmi_points
  total_new_dmi_points: 'number', // Sum of new_dmi_points
  total_tier_upgraded_dmi: 'number', // Sum of tier_upgraded_dmi_count
  total_tier_upgraded_dmi_points: 'number', // Sum of tier_upgraded_dmi_points
  total_dmi_points: 'number', // Grand total points

  // Monthly breakdown array
  monthly_breakdown: [
    {
      month: 'number', // 1-12
      year: 'number', // YYYY
      active_dmi_count: 'number',
      new_dmi_count: 'number',
      existing_dmi_points: 'number',
      new_dmi_points: 'number',
      tier_upgraded_dmi_count: 'number',
      tier_upgraded_dmi_points: 'number',
      total_dmi_points: 'number',
    },
  ],
};

/**
 * Usage Examples
 */

// Example 1: Calculate DMI for single month
/*
import { calculateEmployeeDMIPoints } from './services/dmiPointsService';

const result = await calculateEmployeeDMIPoints('EMP001', 7, 2024);
console.log(result);
// Output:
// {
//   employee_id: 'EMP001',
//   period_month: 7,
//   period_year: 2024,
//   active_dmi_count: 45,
//   existing_dmi_count: 40,
//   new_dmi_count: 5,
//   existing_dmi_raw_points: 800,
//   average_sheets_per_dmi: 35.5,
//   existing_dmi_points: 800,      // 800 * 1.0 (multiplier)
//   new_dmi_points: 50,            // 5 * 10
//   tier_upgraded_dmi_count: 3,
//   tier_upgraded_dmi_points: 75,  // 3 * 25
//   total_dmi_points: 925,         // 800 + 50 + 75
//   breakdown: { ... }
// }
*/

// Example 2: Get annual summary
/*
const summary = await getDMIPointsSummary('EMP001', 'annual', 2024);
console.log(summary);
// Output:
// {
//   employee_id: 'EMP001',
//   period_type: 'annual',
//   period_year: 2024,
//   total_active_dmi: 480,
//   total_new_dmi: 45,
//   total_existing_dmi_points: 8000,
//   total_new_dmi_points: 450,
//   total_tier_upgraded_dmi: 12,
//   total_tier_upgraded_dmi_points: 300,
//   total_dmi_points: 8750,
//   monthly_breakdown: [ ... ]
// }
*/

// Example 3: Batch calculation
/*
const batchResults = await calculateBatchDMIPoints([
  { employeeId: 'EMP001', month: 7, year: 2024 },
  { employeeId: 'EMP002', month: 7, year: 2024 },
  { employeeId: 'EMP003', month: 7, year: 2024 },
]);
*/

/**
 * Key Calculation Notes
 */

// Multiplier calculation based on average_sheets_per_dmi:
// - < 15: multiplier = 0.15 (15% of raw points)
// - 15-39: multiplier = 0.50 (50% of raw points)
// - >= 40: multiplier = 1.00 (100% of raw points)

// FY Mapping (for history window and quarter factor):
// Apr-Dec (months 4-12) => FY starts in same year
// Jan-Mar (months 1-3) => FY started in previous year

// Quarter Factors:
// Q1 (Apr-Jun, months 4-6) = 0.9
// Q2 (Jul-Sep, months 7-9) = 1.0
// Q3 (Oct-Dec, months 10-12) = 1.0
// Q4 (Jan-Mar, months 1-3) = 1.1

// Active DMI Definition:
// An account is active in a month if SUM(approved_qty for that account) >= 10

// Existing vs New Classification:
// - Existing DMI: Active account with prior activity in last 2 FY
// - New DMI: Active account with NO prior activity in last 2 FY
// - Prior activity = any month where SUM(approved_qty) >= 10

// Tier Resolution Priority:
// 1. Primary: m_enrollment_details.tier
// 2. Fallback: influencer_enrollment_details.influencer_tier
// 3. Important: If account ONLY has fallback tier (no primary), 
//    it's EXCLUDED from Existing DMI points calculation

// Tier Upgrade Eligibility:
// - change_type must be 'Tier Upgrade'
// - previous_tier must be one of: 'Bronze', 'Silver', 'Gold'
// - Other tier transitions (e.g., Platinum upgrades) are not counted
