/**
 * DMI Points Backend Service
 * Orchestrates data fetching from Supabase and applies calculation logic
 */

import supabase from '../supabaseClient';
import {
  calculateDMIPoints,
  getFYFromMonthYear,
  getPrevious2FYWindow,
} from './dmiPointsCalculation';

/**
 * Fetch all required data for DMI calculation
 * Returns organized data ready for calculation
 */
async function fetchDMICalculationData(employeeId, month, year) {
  const errors = [];

  try {
    // Get month/year for FY calculation
    const currentFY = getFYFromMonthYear(month, year);
    const prevFYWindow = getPrevious2FYWindow(month, year);

    // Calculate date ranges for queries
    const fyStartDate = month >= 4 
      ? `${year}-04-01` 
      : `${year - 1}-04-01`;

    // ========== PARALLEL FETCH 1: Selected Month Claims ==========
    // Get claims for selected month using date range filtering on status_date
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthEnd = new Date(year, month, 0); // Last day of month
    const monthEndStr = `${year}-${String(month).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`;

    console.log('Fetching selected month claims:', { monthStart, monthEndStr, employeeId });

    const { data: selectedMonthClaims, error: claimsError } = await supabase
      .from('influencer_claim_details')
      .select('mapped_isr_code, account_number, approved_qty, status_date, id')
      .eq('mapped_isr_code', employeeId)
      .gte('status_date', monthStart)
      .lte('status_date', monthEndStr);

    if (claimsError) {
      errors.push(`Selected month claims fetch error: ${claimsError.message}`);
    }

    console.log('Selected month claims fetched:', selectedMonthClaims?.length || 0);

    // Get active accounts from selected month (qty >= 10)
    // This is needed to filter prior history by account numbers
    const activeAccountsInMonth = new Set();
    if (selectedMonthClaims && selectedMonthClaims.length > 0) {
      const accountTotals = new Map();
      selectedMonthClaims.forEach(claim => {
        const account = claim.account_number;
        accountTotals.set(account, (accountTotals.get(account) || 0) + (claim.approved_qty || 0));
      });
      accountTotals.forEach((qty, account) => {
        if (qty >= 10) {
          activeAccountsInMonth.add(account);
        }
      });
    }

    console.log('Active accounts in selected month:', {
      count: activeAccountsInMonth.size,
      accounts: Array.from(activeAccountsInMonth),
    });

    // ========== PARALLEL FETCH 2: Prior History Claims ==========
    // IMPORTANT: Check April 1, 2025 to previous month (previous month end)
    // Query for the active accounts' prior history WITHOUT ISR code filter
    // Check if each active account was active under ANY ISR in prior period
    const priorHistoryStart = '2025-04-01';
    
    // Calculate previous month end date
    const prevMonth = new Date(year, month - 1, 0); // Last day of previous month
    const prevMonthEndStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-${String(prevMonth.getDate()).padStart(2, '0')}`;
    
    console.log('Fetching prior history:', { priorHistoryStart, prevMonthEndStr, accountsToCheck: Array.from(activeAccountsInMonth) });
    
    let priorHistoryClaims = [];
    if (activeAccountsInMonth.size > 0) {
      const { data: priorData, error: historyError } = await supabase
        .from('influencer_claim_details')
        .select('account_number, approved_qty, status_date, mapped_isr_code')
        .in('account_number', Array.from(activeAccountsInMonth))
        .gte('status_date', priorHistoryStart)
        .lte('status_date', prevMonthEndStr);

      if (historyError) {
        errors.push(`Prior history claims fetch error: ${historyError.message}`);
      }
      priorHistoryClaims = priorData || [];
      
      console.log('Prior history claims fetched:', {
        count: priorHistoryClaims.length,
        samples: priorHistoryClaims.slice(0, 5),
      });
    }
    }

    // ========== PARALLEL FETCH 3: m_enrollment_details ==========
    // Get unique account numbers first
    const accountNumbers = [
      ...(selectedMonthClaims || []).map(c => c.account_number),
      ...(priorHistoryClaims || []).map(c => c.account_number),
    ];
    const uniqueAccounts = [...new Set(accountNumbers)];

    const { data: mEnrollmentData, error: mEnrollError } = await supabase
      .from('m_enrollment_details')
      .select('account_no, tier, created_at, mapped_isr')
      .in('account_no', uniqueAccounts);

    if (mEnrollError) {
      errors.push(`m_enrollment_details fetch error: ${mEnrollError.message}`);
    }

    // ========== PARALLEL FETCH 4: influencer_enrollment_details ==========
    const { data: influencerEnrollmentData, error: inflEnrollError } = await supabase
      .from('influencer_enrollment_details')
      .select('influencer_id, influencer_tier, enrollment_date')
      .in('influencer_id', uniqueAccounts);

    if (inflEnrollError) {
      errors.push(`influencer_enrollment_details fetch error: ${inflEnrollError.message}`);
    }

    // ========== PARALLEL FETCH 5: DMI Points Master ==========
    const { data: dmiPointsMaster, error: masterError } = await supabase
      .from('dmi_raw_points_master')
      .select('tier, points_per_dmi');

    if (masterError) {
      errors.push(`DMI Points Master fetch error: ${masterError.message}`);
    }

    // ========== PARALLEL FETCH 6: Tier Upgrade Data (Current Month Only) ==========
    // Fetch all tier upgrades for employee in selected month/year
    const tierUpgradeStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const tierUpgradeEnd = new Date(year, month, 0); // Last day of month
    const tierUpgradeEndStr = `${year}-${String(month).padStart(2, '0')}-${String(tierUpgradeEnd.getDate()).padStart(2, '0')}`;

    const { data: tierUpgradeData, error: tierUpgradeError } = await supabase
      .from('tier_upgrade_performance_report')
      .select('mapped_isr, change_type, previous_tier, new_tier, tier_change_date, id')
      .eq('mapped_isr', employeeId)
      .gte('tier_change_date', tierUpgradeStart)
      .lte('tier_change_date', tierUpgradeEndStr);

    if (tierUpgradeError) {
      errors.push(`Tier upgrade data fetch error: ${tierUpgradeError.message}`);
    }

    if (errors.length > 0) {
      console.error('DMI Calculation Data Fetch Errors:', errors);
    }

    return {
      selectedMonthClaims: selectedMonthClaims || [],
      priorHistoryClaims: priorHistoryClaims || [],
      mEnrollmentData: mEnrollmentData || [],
      influencerEnrollmentData: influencerEnrollmentData || [],
      dmiPointsMaster: dmiPointsMaster || [],
      tierUpgradeData: tierUpgradeData || [],
      errors,
    };
  } catch (error) {
    console.error('DMI Calculation Data Fetch Exception:', error);
    throw error;
  }
}

/**
 * Main DMI Points Calculation API
 * 
 * @param {string} employeeId - Mapped ISR Code / employee identifier
 * @param {number} month - Calendar month (1-12)
 * @param {number} year - Calendar year (YYYY)
 * @returns {Promise<Object>} DMI calculation result
 */
export async function calculateEmployeeDMIPoints(employeeId, month, year) {
  if (!employeeId || !month || !year) {
    throw new Error('Missing required parameters: employeeId, month, year');
  }

  if (month < 1 || month > 12) {
    throw new Error('Invalid month: must be 1-12');
  }

  try {
    // Fetch all required data
    const data = await fetchDMICalculationData(employeeId, month, year);

    // Perform calculation
    const result = calculateDMIPoints({
      employeeId,
      month,
      year,
      selectedMonthClaims: data.selectedMonthClaims,
      priorHistoryClaims: data.priorHistoryClaims,
      mEnrollmentData: data.mEnrollmentData,
      influencerEnrollmentData: data.influencerEnrollmentData,
      dmiPointsMaster: data.dmiPointsMaster,
      tierUpgradeData: data.tierUpgradeData,
    });

    // Add fetch errors to result if any
    if (data.errors.length > 0) {
      result.warnings = data.errors;
    }

    return result;
  } catch (error) {
    console.error('DMI Points Calculation Error:', error);
    throw error;
  }
}

/**
 * Batch DMI Points Calculation for multiple employees/periods
 * 
 * @param {Array<{employeeId, month, year}>} params - Array of calculation parameters
 * @returns {Promise<Array>} Array of calculation results
 */
export async function calculateBatchDMIPoints(params) {
  const results = [];

  for (const param of params) {
    try {
      const result = await calculateEmployeeDMIPoints(
        param.employeeId,
        param.month,
        param.year
      );
      results.push({
        status: 'success',
        data: result,
      });
    } catch (error) {
      results.push({
        status: 'error',
        employeeId: param.employeeId,
        period: `${param.month}/${param.year}`,
        error: error.message,
      });
    }
  }

  return results;
}

/**
 * Get DMI Points for Employee (Annual or Quarterly)
 * Calculates DMI for selected period(s)
 * 
 * @param {string} employeeId
 * @param {string} periodType - 'monthly', 'quarterly', or 'annual'
 * @param {number} year
 * @param {number} month - required for monthly mode
 * @param {number} quarter - required for quarterly mode
 * @returns {Promise<Object>} Aggregated DMI results
 */
export async function getDMIPointsSummary(
  employeeId,
  periodType = 'monthly',
  year,
  month = null,
  quarter = null
) {
  let periods = [];

  switch (periodType) {
    case 'monthly':
      if (!month) throw new Error('Month required for monthly period');
      periods = [{ month, year }];
      break;

    case 'quarterly':
      if (!quarter) throw new Error('Quarter required for quarterly period');
      const quarterMonths = {
        1: [1, 2, 3],    // Q4 (Jan-Mar)
        2: [4, 5, 6],    // Q1 (Apr-Jun)
        3: [7, 8, 9],    // Q2 (Jul-Sep)
        4: [10, 11, 12], // Q3 (Oct-Dec)
      };
      const months = quarterMonths[quarter];
      periods = months.map(m => ({
        month: m,
        year: quarter === 1 ? year : year, // Q4 is in Jan-Mar of FY+1
      }));
      break;

    case 'annual':
      // FY: Apr of year to Mar of year+1
      periods = [
        { month: 4, year },
        { month: 5, year },
        { month: 6, year },
        { month: 7, year },
        { month: 8, year },
        { month: 9, year },
        { month: 10, year },
        { month: 11, year },
        { month: 12, year },
        { month: 1, year: year + 1 },
        { month: 2, year: year + 1 },
        { month: 3, year: year + 1 },
      ];
      break;

    default:
      throw new Error('Invalid periodType: must be monthly, quarterly, or annual');
  }

  // Calculate for all periods
  const results = await calculateBatchDMIPoints(
    periods.map(p => ({ employeeId, month: p.month, year: p.year }))
  );

  // Aggregate results
  let totalActiveDmi = 0;
  let totalNewDmi = 0;
  let totalExistingDmiPoints = 0;
  let totalNewDmiPoints = 0;
  let totalTierUpgradedDmi = 0;
  let totalTierUpgradedPoints = 0;
  let totalDmiPoints = 0;
  const breakdown = [];

  results.forEach(r => {
    if (r.status === 'success') {
      const d = r.data;
      totalActiveDmi += d.active_dmi_count || 0;
      totalNewDmi += d.new_dmi_count || 0;
      totalExistingDmiPoints += d.existing_dmi_points || 0;
      totalNewDmiPoints += d.new_dmi_points || 0;
      totalTierUpgradedDmi += d.tier_upgraded_dmi_count || 0;
      totalTierUpgradedPoints += d.tier_upgraded_dmi_points || 0;
      totalDmiPoints += d.total_dmi_points || 0;

      breakdown.push({
        month: d.period_month,
        year: d.period_year,
        active_dmi_count: d.active_dmi_count,
        new_dmi_count: d.new_dmi_count,
        existing_dmi_points: d.existing_dmi_points,
        new_dmi_points: d.new_dmi_points,
        tier_upgraded_dmi_count: d.tier_upgraded_dmi_count,
        tier_upgraded_dmi_points: d.tier_upgraded_dmi_points,
        total_dmi_points: d.total_dmi_points,
      });
    }
  });

  return {
    employee_id: employeeId,
    period_type: periodType,
    period_year: year,
    total_active_dmi: totalActiveDmi,
    total_new_dmi: totalNewDmi,
    total_existing_dmi_points: totalExistingDmiPoints,
    total_new_dmi_points: totalNewDmiPoints,
    total_tier_upgraded_dmi: totalTierUpgradedDmi,
    total_tier_upgraded_dmi_points: totalTierUpgradedPoints,
    total_dmi_points: totalDmiPoints,
    monthly_breakdown: breakdown,
  };
}
