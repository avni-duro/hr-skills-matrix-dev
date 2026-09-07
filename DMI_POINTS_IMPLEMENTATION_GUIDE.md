# DMI Points Calculation - Implementation Guide

## Overview

This guide explains how to integrate the DMI Points calculation into the Duro Academy admin panel performance dashboard. The implementation consists of three main components:

1. **Calculation Logic** (`dmiPointsCalculation.js`) - Core business logic
2. **Backend Service** (`dmiPointsService.js`) - Data fetching from Supabase
3. **Schemas** (`dmiPointsSchemas.js`) - Response structures and documentation

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│             Performance Dashboard Component                  │
│                  (PerformanceDashboard.jsx)                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
         ┌─────────────────────────────────┐
         │  getDMIPointsSummary()          │
         │  (dmiPointsService.js)          │
         └──────────────────┬──────────────┘
                           │
        ┌──────────────────┬──────────────────┐
        ▼                  ▼                  ▼
   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
   │  Fetch Data │  │ Fetch Data  │  │  Fetch      │
   │  Period 1   │  │  Period 2   │  │  Data...    │
   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
          │                │               │
          └────────────────┼───────────────┘
                           ▼
         ┌─────────────────────────────────┐
         │  calculateDMIPoints()           │
         │  (dmiPointsCalculation.js)      │
         └──────────────────┬──────────────┘
                           │
                           ▼
         ┌─────────────────────────────────┐
         │  Return Aggregated Results      │
         │  (DMISummaryResponse)           │
         └─────────────────────────────────┘
```

## File Locations

```
src/
  utils/
    dmiPointsCalculation.js      # Core calculation logic
  services/
    dmiPointsService.js          # Supabase data fetching + orchestration
    dmiPointsSchemas.js          # Response schemas and documentation
supabase/
  migrations/
    dmi_points_queries.sql       # SQL queries for reference
```

## Database Tables Required

Ensure these tables exist in Supabase:

1. **influencer_claim_details**
   - `id` (primary key)
   - `mapped_isr_code` (employee identifier)
   - `account_number` (influencer account)
   - `approved_qty` (number of items approved)
   - `status_date` (date of claim)

2. **m_enrollment_details**
   - `account_no` (account identifier)
   - `tier` (Bronze, Silver, Gold, etc.)
   - `created_at` (enrollment date)
   - `mapped_isr` (employee who enrolled)

3. **influencer_enrollment_details**
   - `influencer_id` (account identifier)
   - `influencer_tier` (tier classification)
   - `enrollment_date` (enrollment date)

4. **dmi_raw_points_master**
   - `tier` (Bronze, Silver, Gold, etc.)
   - `points_per_dmi` (points awarded per DMI)

5. **tier_upgrade_performance_report**
   - `mapped_isr` (employee identifier)
   - `change_type` (e.g., 'Tier Upgrade')
   - `previous_tier` (tier before upgrade)
   - `new_tier` (tier after upgrade)
   - `tier_change_date` (date of upgrade)

## Integration into Performance Dashboard

### 1. Import the Service

```javascript
// In PerformanceDashboard.jsx or AsmPerformanceDashboard.jsx
import { getDMIPointsSummary } from '../services/dmiPointsService';
```

### 2. Call During Data Fetch

Replace existing DMI calculation with:

```javascript
// Example: Calculate DMI for selected month
async function fetchDMIData(employeeId, month, year) {
  try {
    const dmiSummary = await getDMIPointsSummary(
      employeeId,
      'monthly',  // or 'quarterly', 'annual'
      year,
      month       // only needed for 'monthly' mode
    );
    
    return dmiSummary;
  } catch (error) {
    console.error('DMI calculation failed:', error);
    return null;
  }
}
```

### 3. Use Results in Dashboard

```javascript
const dmiResult = await fetchDMIData(employeeId, month, year);

// Update state with results
setDMIData({
  activeDmiCount: dmiResult.total_active_dmi,
  newDmiCount: dmiResult.total_new_dmi,
  existingDmiPoints: dmiResult.total_existing_dmi_points,
  newDmiPoints: dmiResult.total_new_dmi_points,
  tierUpgradedDmiPoints: dmiResult.total_tier_upgraded_dmi_points,
  totalDmiPoints: dmiResult.total_dmi_points,
});
```

## API Reference

### Single Month Calculation

```javascript
import { calculateEmployeeDMIPoints } from '../services/dmiPointsService';

const result = await calculateEmployeeDMIPoints(
  employeeId,  // string
  month,       // number (1-12)
  year         // number (YYYY)
);

// Result: DMICalculationResponse
// {
//   employee_id: string,
//   active_dmi_count: number,
//   existing_dmi_count: number,
//   new_dmi_count: number,
//   existing_dmi_raw_points: number,
//   average_sheets_per_dmi: number,
//   existing_dmi_points: number,
//   new_dmi_points: number,
//   tier_upgraded_dmi_count: number,
//   tier_upgraded_dmi_points: number,
//   total_dmi_points: number,
//   breakdown: { ... }
// }
```

### Summary (Monthly, Quarterly, or Annual)

```javascript
import { getDMIPointsSummary } from '../services/dmiPointsService';

// Monthly
const monthly = await getDMIPointsSummary(
  employeeId,
  'monthly',
  year,
  month  // required
);

// Quarterly
const quarterly = await getDMIPointsSummary(
  employeeId,
  'quarterly',
  year,
  null,      // month not needed
  quarter    // 1, 2, 3, or 4
);

// Annual (Full FY: Apr-Mar)
const annual = await getDMIPointsSummary(
  employeeId,
  'annual',
  year
);

// Result: DMISummaryResponse
// {
//   employee_id: string,
//   period_type: 'monthly' | 'quarterly' | 'annual',
//   period_year: number,
//   total_active_dmi: number,
//   total_new_dmi: number,
//   total_existing_dmi_points: number,
//   total_new_dmi_points: number,
//   total_tier_upgraded_dmi: number,
//   total_tier_upgraded_dmi_points: number,
//   total_dmi_points: number,
//   monthly_breakdown: [
//     {
//       month: number,
//       year: number,
//       active_dmi_count: number,
//       new_dmi_count: number,
//       existing_dmi_points: number,
//       new_dmi_points: number,
//       tier_upgraded_dmi_count: number,
//       tier_upgraded_dmi_points: number,
//       total_dmi_points: number,
//     },
//     ...
//   ]
// }
```

### Batch Calculation

```javascript
import { calculateBatchDMIPoints } from '../services/dmiPointsService';

const params = [
  { employeeId: 'EMP001', month: 7, year: 2024 },
  { employeeId: 'EMP002', month: 7, year: 2024 },
  { employeeId: 'EMP001', month: 8, year: 2024 },
];

const results = await calculateBatchDMIPoints(params);

// Results: Array of { status: 'success' | 'error', data?: ... }
```

## Business Logic Details

### 1. Active DMI Determination

An account is **active** in a month if:
```
SUM(approved_qty for that account in that month) >= 10
```

### 2. Existing vs New Classification

For each active account:
- **Existing DMI**: Has prior activity in last 2 FY (any month where qty >= 10)
- **New DMI**: First time active, no prior 2-FY history

### 3. Tier Resolution

For each active account, tier is determined by:
1. Primary source: `m_enrollment_details.tier`
2. Fallback source: `influencer_enrollment_details.influencer_tier`

**Important**: If an account has ONLY fallback tier (no primary), it's **excluded** from Existing DMI points.

### 4. Existing DMI Points Calculation

```
totalRawPoints = SUM(active_dmi_count_for_tier × points_per_dmi for each tier)

averageSheetsPerDmi = totalApprovedSheets / existingDmiCount

multiplier = {
  < 15:  0.15
  15-39: 0.50
  >= 40: 1.00
}

existingDmiPoints = ROUND(totalRawPoints × multiplier)
```

### 5. New DMI Points Calculation

```
newDmiPoints = newDmiCount × 10
```

### 6. Tier Upgrade Points Calculation

```
// Count rows where:
// - change_type = 'Tier Upgrade'
// - previous_tier IN ('Bronze', 'Silver', 'Gold')

tierUpgradedDmiPoints = tierUpgradedDmiCount × 25
```

### 7. Final Total

```
totalDmiPoints = existingDmiPoints + newDmiPoints + tierUpgradedDmiPoints
```

## Period Mapping

### Calendar to FY Mapping

```
Apr-Dec (months 4-12)  => FY starts in same year
Jan-Mar (months 1-3)   => FY started in previous year

Example:
July 2024 (month 7) => FY 2024
March 2024 (month 3) => FY 2023
```

### Quarter Factors (for reference/future use)

```
Q1 (Apr-Jun, months 4-6):   0.9
Q2 (Jul-Sep, months 7-9):   1.0
Q3 (Oct-Dec, months 10-12): 1.0
Q4 (Jan-Mar, months 1-3):   1.1
```

## Error Handling

The service includes error handling at multiple levels:

```javascript
try {
  const result = await getDMIPointsSummary(employeeId, 'monthly', year, month);
  
  // Check for warnings (partial data fetch failures)
  if (result.warnings && result.warnings.length > 0) {
    console.warn('Partial data fetch warnings:', result.warnings);
  }
} catch (error) {
  // Handle complete failure
  console.error('DMI calculation failed:', error);
}
```

## Testing

### Unit Test Example

```javascript
import { calculateDMIPoints, getMultiplier } from '../utils/dmiPointsCalculation';

test('multiplier calculation', () => {
  expect(getMultiplier(10)).toBe(0.15);
  expect(getMultiplier(20)).toBe(0.50);
  expect(getMultiplier(50)).toBe(1.00);
});

test('DMI calculation with sample data', () => {
  const result = calculateDMIPoints({
    employeeId: 'TEST001',
    month: 7,
    year: 2024,
    selectedMonthClaims: [
      { account_number: 'ACC001', approved_qty: 50, status_date: '2024-07-15' },
    ],
    priorHistoryClaims: [
      { account_number: 'ACC001', approved_qty: 20, status_date: '2024-05-10' },
    ],
    // ... other required data
  });

  expect(result.total_dmi_points).toBeGreaterThan(0);
});
```

## Performance Considerations

1. **Parallel Data Fetching**: Service fetches all required data in parallel for optimal performance
2. **Batch Operations**: Use `calculateBatchDMIPoints()` for multiple employees/periods
3. **Caching**: Consider caching results for the same employee/period combination
4. **Chunking**: Service automatically chunks large account lists for API requests

## Migration from Old Logic

If replacing existing DMI calculation:

1. **Backup existing code** before changes
2. **Run parallel calculations** during transition period
3. **Compare results** with previous implementation
4. **Test with sample employees** before full rollout
5. **Update dashboard UI** to use new response fields

## Support and Debugging

### Enable Debug Logging

```javascript
// In dmiPointsService.js, add console.logs
export async function fetchDMICalculationData(employeeId, month, year) {
  console.log('[DMI] Fetching data for:', { employeeId, month, year });
  // ...
  console.log('[DMI] Data fetched successfully');
}
```

### Verify Data Quality

```javascript
const data = await fetchDMICalculationData(employeeId, month, year);
console.log('Selected month claims:', data.selectedMonthClaims.length);
console.log('Prior history claims:', data.priorHistoryClaims.length);
console.log('M enrollment records:', data.mEnrollmentData.length);
console.log('Data fetch errors:', data.errors);
```

## Next Steps

1. Verify all database tables exist with correct schema
2. Update column names if they differ from specification
3. Test with sample employee and month
4. Integrate into dashboard component
5. Update UI to display new DMI breakdown fields
6. Deploy to production with monitoring

---

**Last Updated**: 2026-07-17
**Version**: 1.0
**Status**: Ready for implementation
