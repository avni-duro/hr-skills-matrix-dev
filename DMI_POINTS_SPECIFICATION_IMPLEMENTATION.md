# DMI Points Calculation - Updated Implementation (2026-07-17)

## ✅ Exact Specifications Implemented

Your 8-stage calculation has been fully implemented with the exact logic you specified:

### Stage 1: Source Monthly Approved Sheets
- **Source**: `influencer_claim_details`
- **Columns Used**: `mapped_isr_code`, `account_number`, `approved_qty`, `status_date`
- **Filtering**: Selected month and employee

### Stage 2: Active DMI Account Rule
- **Definition**: For each account in selected month, if `SUM(approved_qty) >= 10`, account is active
- **Implementation**: `buildActiveAccountsMap()` function
- **Result**: Map of active accounts with total sheets

### Stage 3: Existing DMI Classification
- **Rule**: If active account has ANY earlier active month in previous 2 FY window where `SUM(approved_qty) >= 10`, classify as Existing DMI
- **Implementation**: `buildPriorHistoryMap()` function
- **2 FY Window**: Calculated from FY mapping rules

### Stage 4: New DMI Classification
- **Rule**: If active account has NO prior active month in last 2 FY window, classify as New DMI
- **Result**: Separate arrays for Existing and New accounts

### Stage 5: Existing DMI Points Calculation

#### Tier Resolution:
1. **Primary Source**: `m_enrollment_details(account_no, tier, created_at, mapped_isr)`
2. **Fallback Source**: `influencer_enrollment_details(influencer_id, influencer_tier, enrollment_date)`
3. **Exclusion Rule**: Accounts with ONLY fallback tier (no primary) are EXCLUDED from Active DMI raw points

#### Raw Points Calculation:
```
totalRawPoints = SUM(active_count_by_tier × points_per_dmi)
```
- Uses `dmi_raw_points_master(tier, points_per_dmi)`
- Counts only accounts with resolved tier

#### Average Sheets Calculation:
```
averageSheetsPerDmi = total_approved_sheets_of_unique_active_accounts / existingDmiCount

Where:
- total_approved_sheets = SUM(approved_qty) for each account with resolved tier
- existingDmiCount = count of active accounts with resolved tier
```

#### Multiplier Application:
```
if averageSheetsPerDmi < 15      => multiplier = 0.15 (15%)
if 15 <= averageSheetsPerDmi < 40 => multiplier = 0.50 (50%)
if averageSheetsPerDmi >= 40      => multiplier = 1.00 (100%)
```

#### Final Existing DMI Points:
```
existingDmiPoints = ROUND(totalRawPoints × multiplier)
```

### Stage 6: New DMI Points Calculation
```
newDmiPoints = newDmiCount × 10
```

### Stage 7: Tier Upgrade Points Calculation
- **Source**: `tier_upgrade_performance_report(mapped_isr, change_type, previous_tier, tier_change_date)`
- **Filters**:
  - `change_type = 'Tier Upgrade'`
  - `previous_tier IN ('Bronze', 'Silver', 'Gold')`
  - Month matches selected month
- **Calculation**:
```
tierUpgradedDmiCount = count of qualifying records
tierUpgradedDmiPoints = tierUpgradedDmiCount × 25
```

### Stage 8: Final DMI Points
```
totalDmiPoints = existingDmiPoints + newDmiPoints + tierUpgradedDmiPoints
```

---

## 📋 Updated Files

### 1. `src/utils/dmiPointsCalculation.js` - **UPDATED**

**Key Functions**:
- `buildActiveAccountsMap(claimsData)` - Identifies active accounts (qty >= 10)
- `buildPriorHistoryMap(priorClaims)` - Checks prior activity in 2 FY window
- `getMultiplier(averageSheetsPerDmi)` - Returns 0.15, 0.50, or 1.00
- `resolveTier(account, mEnrollmentData, influencerEnrollmentData)` - Tier resolution with fallback
- `calculateDMIPoints({...})` - Main 8-stage calculation

**Changes Made**:
✅ Corrected average sheets calculation - now properly sums sheets for accounts with resolved tier
✅ Fixed tier resolution - now takes data arrays instead of single values
✅ Proper handling of fallback tier exclusion
✅ Exact multiplier ranges: < 15, 15-39, >= 40
✅ Month-level history checking for prior activity

### 2. `src/services/dmiPointsService.js` - **UPDATED**

**Changes Made**:
✅ Updated tier upgrade data fetch to use date range filtering (tier_change_date)
✅ Calculates date range based on month/year
✅ Correctly fetches only upgrades for the selected month

### 3. Output Format - **UNCHANGED** (Already Matches)

```javascript
{
  employee_id,
  period_month,
  period_year,
  active_dmi_count,              // Total active accounts
  existing_dmi_count,            // Active accounts with resolved tier
  new_dmi_count,                 // New DMI accounts
  existing_dmi_raw_points,       // BEFORE multiplier
  average_sheets_per_dmi,        // For multiplier calculation
  multiplier_applied,            // 0.15, 0.50, or 1.00
  existing_dmi_points,           // AFTER multiplier (finalRawPoints)
  new_dmi_points,                // count × 10
  tier_upgraded_dmi_count,       // Count of tier upgrades
  tier_upgraded_dmi_points,      // count × 25 (dmiUpdatePoints)
  total_dmi_points,              // Final total
  breakdown: { ... }             // Detailed information
}
```

---

## 🔍 Calculation Example

### Sample Data:
- Employee: EMP001
- Month: July (7), Year: 2024
- FY: 2024 (Apr-Dec = same year, Jan-Mar = previous year)

### Scenario:
1. **Selected Month Claims** (July 2024):
   - ACC001: 50 sheets → Active (50 >= 10) ✓
   - ACC002: 8 sheets → Not active (8 < 10) ✗
   - ACC003: 20 sheets → Active (20 >= 10) ✓

2. **Prior History** (Apr 2022 - Mar 2024):
   - ACC001: Previously active in Jun 2024 (30 sheets) → Existing DMI ✓
   - ACC003: No prior activity → New DMI ✓

3. **Tier Resolution**:
   - ACC001: Has primary tier (Gold) → Include
   - ACC003: Only has fallback tier → Exclude
   - After exclusion: Existing DMI count = 1

4. **Raw Points Calculation**:
   - Gold tier has 100 points_per_dmi
   - totalRawPoints = 1 account × 100 points = 100

5. **Average Sheets**:
   - Total sheets for resolved accounts = 50 (only ACC001)
   - existingDmiCount = 1
   - averageSheetsPerDmi = 50 / 1 = 50

6. **Multiplier**:
   - 50 >= 40 → multiplier = 1.00 (100%)
   - existingDmiPoints = ROUND(100 × 1.00) = 100

7. **New DMI Points**:
   - newDmiCount = 1 (ACC003)
   - newDmiPoints = 1 × 10 = 10

8. **Tier Upgrades** (July 2024):
   - 2 qualifying upgrades from Bronze/Silver/Gold
   - tierUpgradedDmiPoints = 2 × 25 = 50

9. **Total**:
   - totalDmiPoints = 100 + 10 + 50 = **160 points**

---

## 📊 Testing Checklist

- [ ] Verify active account filtering (qty >= 10)
- [ ] Check prior history detection (2 FY window)
- [ ] Test existing vs new classification
- [ ] Confirm tier resolution (primary > fallback)
- [ ] Validate fallback tier exclusion
- [ ] Check average sheets calculation
- [ ] Verify multiplier ranges (15%, 50%, 100%)
- [ ] Confirm new DMI formula (count × 10)
- [ ] Check tier upgrade filtering (Bronze/Silver/Gold only)
- [ ] Validate tier upgrade formula (count × 25)
- [ ] Test final total calculation

---

## 🚀 Integration Notes

The implementation is ready for integration into:
- `src/screens/PerformanceDashboard.jsx`
- `src/screens/AsmPerformanceDashboard.jsx`

**Usage**:
```javascript
import { getDMIPointsSummary } from '../services/dmiPointsService';

const result = await getDMIPointsSummary(employeeId, 'monthly', year, month);

// Access results
const {
  active_dmi_count,
  existing_dmi_count,
  new_dmi_count,
  existing_dmi_points,
  new_dmi_points,
  tier_upgraded_dmi_points,
  total_dmi_points,
} = result;
```

---

## ✨ Key Improvements

1. **Accuracy**: Exact implementation of all 8 stages
2. **Clarity**: Well-documented code with clear variable names
3. **Correctness**: Proper handling of edge cases (fallback tier exclusion, month-level history)
4. **Performance**: Parallel data fetching, efficient calculations
5. **Maintainability**: Clean separation of concerns between stages

---

**Status**: ✅ Ready for Testing and Integration
**Last Updated**: 2026-07-17
**Version**: 2.0 (Specification-Aligned)
