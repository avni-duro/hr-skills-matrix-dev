/**
 * DMI Points Calculation Service
 * Implements exact business logic per specifications
 * 
 * 8-Stage Calculation:
 * 1. Source monthly approved sheets from influencer_claim_details
 * 2. Active DMI account rule: SUM(approved_qty) >= 10 per month
 * 3. Existing DMI classification: Has prior active month in previous 2 FY
 * 4. New DMI classification: No prior active month in last 2 FY
 * 5. Existing DMI points with tier resolution and multiplier
 * 6. New DMI points: newDmiCount * 10
 * 7. Tier upgrade points: count * 25 (Bronze, Silver, Gold only)
 * 8. Final total: existingDmiPoints + newDmiPoints + tierUpgradedDmiPoints
 */

/**
 * Map calendar month to FY year
 * Apr-Dec => same FY start year
 * Jan-Mar => FY start year - 1
 */
export function getFYFromMonthYear(month, year) {
  if (month >= 4) {
    return year; // Apr-Dec => FY starts in same year
  } else {
    return year - 1; // Jan-Mar => FY started in previous year
  }
}

/**
 * Get the previous 2 FY window for history lookup
 */
export function getPrevious2FYWindow(month, year) {
  const currentFY = getFYFromMonthYear(month, year);
  const fy2YearsAgo = currentFY - 2;
  return { startFY: fy2YearsAgo, endFY: currentFY - 1 };
}

/**
 * Build active accounts map for selected month
 * Active = SUM(approved_qty for that account in that month) >= 10
 * 
 * Returns Map: account_number -> { qty, sheetCount }
 */
export function buildActiveAccountsMap(claimsData) {
  const activeMap = new Map();
  
  claimsData.forEach(claim => {
    const key = claim.account_number;
    if (!activeMap.has(key)) {
      activeMap.set(key, { qty: 0, sheetCount: 0 });
    }
    const entry = activeMap.get(key);
    const qty = claim.approved_qty || 0;
    entry.qty += qty;
    entry.sheetCount += qty; // Total approved sheets for average calculation
  });

  // Filter to only active accounts (qty >= 10)
  const active = new Map();
  activeMap.forEach((entry, key) => {
    if (entry.qty >= 10) {
      active.set(key, entry);
    }
  });

  return active;
}

/**
 * Build prior history map for active accounts
 * Check if each active account had any month with qty >= 10 in prior period
 * Returns Set of accounts that were active in prior period
 */
export function buildPriorHistoryMap(activeAccounts, priorClaims) {
  if (!priorClaims || priorClaims.length === 0 || !activeAccounts || activeAccounts.size === 0) {
    console.log('buildPriorHistoryMap: Early return - no prior claims or no active accounts', {
      priorClaimsLength: priorClaims?.length || 0,
      activeAccountsSize: activeAccounts?.size || 0,
    });
    return new Set();
  }

  console.log('buildPriorHistoryMap: Starting with', {
    activeAccountsCount: activeAccounts.size,
    activeAccountList: Array.from(activeAccounts.keys()),
    priorClaimsCount: priorClaims.length,
  });

  // For each active account, check if it has prior activity (qty >= 10 in any month)
  const accountsWithPriorActivity = new Set();
  
  // activeAccounts is a Map, so iterate over keys
  for (const account of activeAccounts.keys()) {
    // Get all claims for this account from prior period
    const accountClaims = priorClaims.filter(claim => {
      const claimAccount = String(claim.account_number).trim();
      return claimAccount === String(account).trim();
    });

    console.log(`Account ${account}:`, {
      claimsFound: accountClaims.length,
      claims: accountClaims.map(c => ({ qty: c.approved_qty, date: c.status_date })),
    });

    if (accountClaims.length === 0) {
      // No prior claims = New DMI
      continue;
    }

    // Check if this account had any month with qty >= 10
    const monthlyMap = new Map(); // monthKey -> totalQty
    
    accountClaims.forEach(claim => {
      let dateStr = claim.status_date;
      if (!dateStr) return;

      // Extract YYYY-MM from date string
      let monthKey;
      if (typeof dateStr === 'string') {
        monthKey = dateStr.substring(0, 7); // "2024-07"
      } else {
        const date = new Date(dateStr);
        monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }

      const qty = claim.approved_qty || 0;
      monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + qty);
    });

    console.log(`Account ${account} monthly totals:`, Object.fromEntries(monthlyMap));

    // Check if any month had qty >= 10
    let hasActiveMonth = false;
    monthlyMap.forEach(qty => {
      if (qty >= 10) {
        hasActiveMonth = true;
      }
    });

    console.log(`Account ${account} has prior activity: ${hasActiveMonth}`);

    if (hasActiveMonth) {
      accountsWithPriorActivity.add(account);
    }
  }

  console.log('buildPriorHistoryMap: Final result', {
    accountsWithPrior: Array.from(accountsWithPriorActivity),
  });

  return accountsWithPriorActivity;
}

/**
 * Get multiplier based on average sheets per DMI
 * < 15: 15% (0.15)
 * 15 to <40: 50% (0.50)
 * >= 40: 100% (1.00)
 */
export function getMultiplier(averageSheetsPerDmi) {
  if (averageSheetsPerDmi < 15) return 0.15;
  if (averageSheetsPerDmi >= 15 && averageSheetsPerDmi < 40) return 0.50;
  if (averageSheetsPerDmi >= 40) return 1.00;
  return 0.15;
}

/**
 * Resolve tier for an account
 * Primary source: m_enrollment_details
 * Fallback source: influencer_enrollment_details
 * 
 * Returns: { tier, source: 'primary' | 'fallback' | 'none' }
 */
export function resolveTier(account, mEnrollmentData, influencerEnrollmentData) {
  // Normalize account number to string for comparison
  const accountStr = String(account).trim();

  // Primary source: m_enrollment_details
  const mTier = mEnrollmentData.find(m => String(m.account_no).trim() === accountStr);
  if (mTier && mTier.tier) {
    return {
      tier: mTier.tier,
      source: 'primary',
    };
  }

  // Fallback: influencer_enrollment_details
  const inflTier = influencerEnrollmentData.find(i => String(i.influencer_id).trim() === accountStr);
  if (inflTier && inflTier.influencer_tier) {
    return {
      tier: inflTier.influencer_tier,
      source: 'fallback',
    };
  }

  return { tier: null, source: 'none' };
}

/**
 * Main DMI Points Calculation
 * Implements exact 8-stage logic per specifications
 * 
 * Input parameters:
 * - employeeId: string (mapped_isr_code)
 * - month: number (1-12)
 * - year: number (YYYY)
 * - selectedMonthClaims: array of influencer_claim_details for selected month
 * - priorHistoryClaims: array of influencer_claim_details for prior 2 FY
 * - mEnrollmentData: array of m_enrollment_details
 * - influencerEnrollmentData: array of influencer_enrollment_details
 * - dmiPointsMaster: array of dmi_raw_points_master
 * - tierUpgradeData: array of tier_upgrade_performance_report
 */
export function calculateDMIPoints({
  employeeId,
  month,
  year,
  selectedMonthClaims,
  priorHistoryClaims,
  mEnrollmentData,
  influencerEnrollmentData,
  dmiPointsMaster,
  tierUpgradeData,
}) {
  // ========== STAGE 1-2: Active Accounts in Selected Month ==========
  // Active = SUM(approved_qty) >= 10
  const activeAccounts = buildActiveAccountsMap(selectedMonthClaims);

  // ========== STAGE 3: Build Prior History ==========
  // Check if each active account was active in prior period (any month with qty >= 10)
  // Regardless of which ISR it was under
  const accountsWithPriorActivity = buildPriorHistoryMap(activeAccounts, priorHistoryClaims);

  // ========== STAGE 4: Classification ==========
  // Existing DMI: active accounts with prior activity
  // New DMI: active accounts with NO prior activity
  const existingDmiAccounts = [];
  const newDmiAccounts = [];

  activeAccounts.forEach((entry, account) => {
    if (accountsWithPriorActivity.has(account)) {
      existingDmiAccounts.push(account);
    } else {
      newDmiAccounts.push(account);
    }
  });

  console.log('STAGE 4 - Classification Results:', {
    existingDmiAccounts,
    newDmiAccounts,
    existingCount: existingDmiAccounts.length,
    newCount: newDmiAccounts.length,
  });

  // ========== STAGE 5: Tier Resolution for Existing DMI ==========
  // Resolve tiers for all existing DMI accounts
  // Can use primary or fallback source - if no tier found, still counts as existing but gets no points
  const tierMap = new Map(); // account -> tier
  const accountTierSource = new Map(); // account -> source
  const accountsWithTier = new Set(); // accounts that have tier info

  existingDmiAccounts.forEach(account => {
    const resolved = resolveTier(account, mEnrollmentData, influencerEnrollmentData);

    if (resolved.tier) {
      tierMap.set(account, resolved.tier);
      accountTierSource.set(account, resolved.source);
      accountsWithTier.add(account);
    }
  });

  // Existing DMI count = all accounts with prior activity
  // Even if they don't have tier info, they count as existing
  const existingDmiCountAfterTierResolution = existingDmiAccounts.length;

  // ========== Group by Tier and Calculate Raw Points ==========
  // Only calculate points for accounts with resolved tier
  const tierGrouping = new Map(); // tier -> count

  tierMap.forEach((tier) => {
    tierGrouping.set(tier, (tierGrouping.get(tier) || 0) + 1);
  });

  // Calculate total raw points (only for accounts with tier)
  let totalRawPoints = 0;
  tierGrouping.forEach((count, tier) => {
    const masterEntry = dmiPointsMaster.find(m => m.tier === tier);
    if (masterEntry) {
      totalRawPoints += count * masterEntry.points_per_dmi;
    }
  });

  // ========== Calculate Average Sheets Per DMI ==========
  // Average = total sheets for accounts with tier / count of accounts with tier
  let totalSheetsForAvg = 0;
  let accountsWithTierCount = 0;

  tierMap.forEach((tier, account) => {
    const activeEntry = activeAccounts.get(account);
    if (activeEntry) {
      totalSheetsForAvg += activeEntry.sheetCount;
      accountsWithTierCount++;
    }
  });

  const averageSheetsPerDmi = accountsWithTierCount > 0
    ? totalSheetsForAvg / accountsWithTierCount
    : 0;

  // ========== Apply Multiplier to Raw Points ==========
  // < 15: 15%, 15-39: 50%, >= 40: 100%
  const multiplier = getMultiplier(averageSheetsPerDmi);
  const existingDmiPoints = Math.round(totalRawPoints * multiplier);

  // ========== STAGE 6: New DMI Points Calculation ==========
  const newDmiCount = newDmiAccounts.length;
  const newDmiPoints = newDmiCount * 10;

  // ========== STAGE 7: Tier Upgrade Points ==========
  // Only count rows where:
  // - change_type = 'Tier Upgrade'
  // - previous_tier IN ('Bronze', 'Silver', 'Gold')
  const qualifyingTierUpgrades = tierUpgradeData.filter(record => {
    return (
      record.change_type === 'Tier Upgrade' &&
      ['Bronze', 'Silver', 'Gold'].includes(record.previous_tier)
    );
  });

  const tierUpgradedDmiCount = qualifyingTierUpgrades.length;
  const tierUpgradedDmiPoints = tierUpgradedDmiCount * 25;

  // ========== STAGE 8: Final Total ==========
  const totalDmiPoints = existingDmiPoints + newDmiPoints + tierUpgradedDmiPoints;

  // Log final result
  console.log('DMI CALCULATION FINAL RESULT:', {
    active_dmi_count: activeAccounts.size,
    existing_dmi_count: existingDmiCountAfterTierResolution,
    new_dmi_count: newDmiCount,
    accounts_with_tier: Array.from(tierMap.keys()),
    tier_grouping: Object.fromEntries(tierGrouping),
    existing_dmi_raw_points: totalRawPoints,
    average_sheets_per_dmi: Math.round(averageSheetsPerDmi * 100) / 100,
    multiplier_applied: multiplier,
    existing_dmi_points: existingDmiPoints,
    new_dmi_points: newDmiPoints,
    tier_upgraded_dmi_count: tierUpgradedDmiCount,
    tier_upgraded_dmi_points: tierUpgradedDmiPoints,
    total_dmi_points: totalDmiPoints,
  });

  // ========== Return Result Object ==========
  return {
    // Identifiers
    employee_id: employeeId,
    period_month: month,
    period_year: year,

    // Active DMI Metrics
    active_dmi_count: activeAccounts.size,
    existing_dmi_count: existingDmiCountAfterTierResolution,
    new_dmi_count: newDmiCount,

    // Existing DMI Points Breakdown
    existing_dmi_raw_points: totalRawPoints,
    average_sheets_per_dmi: Math.round(averageSheetsPerDmi * 100) / 100,
    multiplier_applied: multiplier,
    existing_dmi_points: existingDmiPoints, // finalRawPoints

    // New DMI Points
    new_dmi_points: newDmiPoints,

    // Tier Upgrade Points
    tier_upgraded_dmi_count: tierUpgradedDmiCount,
    tier_upgraded_dmi_points: tierUpgradedDmiPoints, // dmiUpdatePoints

    // Total
    total_dmi_points: totalDmiPoints,

    // Detailed Breakdown
    breakdown: {
      existing_dmi_accounts: existingDmiAccounts,
      new_dmi_accounts: newDmiAccounts,
      tier_grouping: Object.fromEntries(tierGrouping),
      accounts_by_tier_source: {
        primary: Array.from(accountTierSource.entries())
          .filter(([_, source]) => source === 'primary')
          .map(([account]) => account),
        fallback_excluded: existingDmiAccounts.filter(
          account => !tierMap.has(account)
        ),
      },
      multiplier_calculation: {
        average_sheets: Math.round(averageSheetsPerDmi * 100) / 100,
        multiplier: multiplier,
        raw_points: totalRawPoints,
        final_points: existingDmiPoints,
      },
    },
  };
}
