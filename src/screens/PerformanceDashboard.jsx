import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabaseClient'
import { cachedFetch, TTL } from '../utils/cacheDB'
import { AuthContext } from '../contexts/AuthContext'
import './PerformanceDashboard.css'

const QUARTER_MONTHS = {
  Q1: [4, 5, 6],
  Q2: [7, 8, 9],
  Q3: [10, 11, 12],
  Q4: [1, 2, 3],
}

const MONTH_LABELS = {
  1: 'Jan',
  2: 'Feb',
  3: 'Mar',
  4: 'Apr',
  5: 'May',
  6: 'Jun',
  7: 'Jul',
  8: 'Aug',
  9: 'Sep',
  10: 'Oct',
  11: 'Nov',
  12: 'Dec',
}

function getQuarterFactor(month) {
  if ([4, 5, 6].includes(month)) return 0.9
  if ([1, 2, 3].includes(month)) return 1.1
  return 1
}

function getCurrentFYStart() {
  const now = new Date()
  return now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1
}

function getCurrentQuarterKey() {
  const month = new Date().getMonth() + 1
  if (month >= 4 && month <= 6) return 'Q1'
  if (month >= 7 && month <= 9) return 'Q2'
  if (month >= 10 && month <= 12) return 'Q3'
  return 'Q4'
}

async function fetchPaged(getQuery) {
  const PAGE = 1000
  let from = 0
  let all = []
  while (true) {
    const { data, error } = await getQuery(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

function toNumber(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function parseDateSafe(v) {
  if (!v) return null
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v
  const s = String(v).trim()
  if (!s) return null

  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) {
    const dd = Number(dmy[1])
    const mm = Number(dmy[2])
    const yyyy = Number(dmy[3])
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      const dt = new Date(yyyy, mm - 1, dd)
      return Number.isNaN(dt.getTime()) ? null : dt
    }
  }

  const dt = new Date(s)
  return Number.isNaN(dt.getTime()) ? null : dt
}

function monthYearKey(month, year) {
  return `${year}-${month}`
}

function monthYearIndex(month, year) {
  return (year * 12) + month
}

function buildDateWindow(pairs) {
  if (!pairs || pairs.length === 0) return { startDate: null, endDateExclusive: null }
  const sorted = [...pairs].sort((a, b) => (a.year - b.year) || (a.month - b.month))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const startDate = `${first.year}-${String(first.month).padStart(2, '0')}-01`

  const nextMonth = last.month === 12 ? 1 : last.month + 1
  const nextMonthYear = last.month === 12 ? last.year + 1 : last.year
  const endDateExclusive = `${nextMonthYear}-${String(nextMonth).padStart(2, '0')}-01`

  return { startDate, endDateExclusive }
}

function buildTwoFyMonthKeySet(fyStart) {
  const keys = new Set()
  const start = new Date(fyStart - 1, 3, 1) // Apr of previous FY
  const endExclusive = new Date(fyStart + 1, 3, 1) // Apr after current FY
  const cur = new Date(start)

  while (cur < endExclusive) {
    keys.add(monthYearKey(cur.getMonth() + 1, cur.getFullYear()))
    cur.setMonth(cur.getMonth() + 1)
  }
  return keys
}

function normalizeStatus(v) {
  return String(v || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function getMonthYearFromValue(value) {
  if (!value) return null
  const text = String(value).trim()
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const year = Number(isoMatch[1])
    const month = Number(isoMatch[2])
    if (!Number.isNaN(year) && !Number.isNaN(month)) return { month, year }
  }
  const d = new Date(text)
  if (Number.isNaN(d.getTime())) return null
  return { month: d.getMonth() + 1, year: d.getFullYear() }
}

function normalizeAccount(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const compact = raw.replace(/\s+/g, '')
  if (/^\d+$/.test(compact)) {
    const noLeadingZeros = compact.replace(/^0+/, '')
    return noLeadingZeros || '0'
  }
  return compact.toUpperCase()
}

function normalizeTierLabel(tierValue) {
  const raw = String(tierValue || '').trim()
  const normalized = raw.toLowerCase()
  if (normalized === 'base' || normalized === 'base tier') return 'Base Tier'
  return raw
}

function buildSelectionLabel(selectedQuarters, selectedMonths) {
  const quarterLabel = selectedQuarters.includes('All') ? 'AllQuarters' : selectedQuarters.join('-')
  const monthLabel = selectedMonths.includes('All') ? 'AllMonths' : selectedMonths.map(m => MONTH_LABELS[Number(m)] || m).join('-')
  return `${quarterLabel}_${monthLabel}`
}

export default function PerformanceDashboard() {
  const mountedRef = useRef(true)
  const auth = useContext(AuthContext)
  const { user: authUser, role } = auth || {}

  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [usersError, setUsersError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [adminUserBranchId, setAdminUserBranchId] = useState(null)
  const [adminAllowedBranchIds, setAdminAllowedBranchIds] = useState([])

  const [selectedUserId, setSelectedUserId] = useState('')

  const currentFYStart = getCurrentFYStart()
  const fyOptions = [
    { label: `FY ${currentFYStart}-${String(currentFYStart + 1).slice(-2)}`, start: currentFYStart },
    { label: `FY ${currentFYStart - 1}-${String(currentFYStart).slice(-2)}`, start: currentFYStart - 1 },
  ]

  const [selectedFYStart, setSelectedFYStart] = useState(currentFYStart)
  const [selectedQuarters, setSelectedQuarters] = useState([getCurrentQuarterKey()])
  const [selectedMonths, setSelectedMonths] = useState(['All'])
  const [selectedBranch, setSelectedBranch] = useState('All Branches')

  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(null)
  const [detailData, setDetailData] = useState(null)
  const [fromCache, setFromCache] = useState(false)
  const [allUsersExporting, setAllUsersExporting] = useState(false)
  const [allUsersExportProgress, setAllUsersExportProgress] = useState({ done: 0, total: 0 })

  const selectedUser = useMemo(
    () => users.find(u => u.id === selectedUserId) || null,
    [users, selectedUserId]
  )

  const availableMonths = useMemo(() => {
    if (selectedQuarters.includes('All')) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    return [...new Set(selectedQuarters.flatMap(q => QUARTER_MONTHS[q] || []))].sort((a, b) => a - b)
  }, [selectedQuarters])

  const monthYearPairs = useMemo(() => {
    const months = selectedMonths.includes('All') ? availableMonths : selectedMonths.map(Number)
    return months.map(month => ({
      month,
      year: month >= 4 ? selectedFYStart : selectedFYStart + 1,
    }))
  }, [selectedFYStart, availableMonths, selectedMonths])

  const branchOptions = useMemo(() => {
    let filteredUsers = users
    
    // If user is admin, only show branches they have access to
    if (role === 'admin') {
      const allowedBranchSet = new Set(adminAllowedBranchIds.length > 0 ? adminAllowedBranchIds : (adminUserBranchId ? [adminUserBranchId] : []))
      filteredUsers = users.filter(u => allowedBranchSet.has(u.branch_id))
    }
    
    const values = [...new Set(filteredUsers.map(u => String(u.branch_name || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
    
    // Keep "All Branches" for both super_admin and admin (admin is still restricted by allowed branches)
    return ['All Branches', ...values]
  }, [users, role, adminUserBranchId, adminAllowedBranchIds])

  const adminAllowedBranchSet = useMemo(() => new Set(adminAllowedBranchIds), [adminAllowedBranchIds])

  const filteredUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return users.filter(u => {
      const name = (u.full_name || '').toLowerCase()
      const email = (u.email || '').toLowerCase()
      const emp = (u.employee_id || '').toLowerCase()
      const branch = (u.branch_name || '').trim()
      const matchesSearch = !q || name.includes(q) || email.includes(q) || emp.includes(q)
      
      // Admin can choose a specific branch or All Branches, but always within allowed branches.
      if (role === 'admin') {
        const branchAllowed = adminAllowedBranchSet.size > 0
          ? adminAllowedBranchSet.has(u.branch_id)
          : adminUserBranchId === u.branch_id
        const matchesBranch = selectedBranch === 'All Branches' || !selectedBranch || branch === selectedBranch
        return matchesSearch && branchAllowed && matchesBranch
      }
      
      // If user is super_admin, apply the selectedBranch filter
      const matchesBranch = selectedBranch === 'All Branches' || branch === selectedBranch
      return matchesSearch && matchesBranch
    })
  }, [users, searchTerm, selectedBranch, role, adminUserBranchId, adminAllowedBranchSet])

  const loadUsers = useCallback(async () => {
    try {
      setUsersLoading(true)
      setUsersError(null)
      const { data } = await cachedFetch(
        'perf_dashboard_assigned_users_dgo_v2',
        async () => {
          const [assignedRes, branchesRes] = await Promise.all([
            supabase
              .from('user_performance_dashboard')
              .select('users:user_id(id, full_name, email, employee_id, department_id, branch_id, status, leaving_date, reporting_manager)')
              .contains('access_type', ['DGO'])
              .order('assigned_at', { ascending: false }),
            supabase
              .from('branches')
              .select('id, branch_name'),
          ])

          if (assignedRes.error) throw assignedRes.error
          if (branchesRes.error) throw branchesRes.error

          const branchMap = new Map((branchesRes.data || []).map(b => [b.id, b.branch_name]))

          const assignedUsers = (assignedRes.data || [])
            .map(row => row.users ? {
              ...row.users,
              branch_id: row.users.branch_id,
              branch_name: branchMap.get(row.users.branch_id) || '',
              status: row.users.status,
              leaving_date: row.users.leaving_date,
              reporting_manager: row.users.reporting_manager,
            } : null)
            .filter(Boolean)

          const uniqueUsers = Array.from(
            new Map(assignedUsers.map(user => [user.id, user])).values()
          )

          return uniqueUsers.sort((a, b) =>
            String(a.full_name || '').localeCompare(String(b.full_name || ''))
          )
        },
        TTL.SHORT
      )
      if (!mountedRef.current) return
      setUsers(Array.isArray(data) ? data : [])
      if (data && data.length > 0) {
        const selectedStillExists = data.some(u => u.id === selectedUserId)
        if (!selectedUserId || !selectedStillExists) {
          setSelectedUserId(data[0].id)
        }
      } else {
        setSelectedUserId('')
      }
    } catch (err) {
      if (mountedRef.current) setUsersError(err.message)
    } finally {
      if (mountedRef.current) setUsersLoading(false)
    }
  }, [selectedUserId])

  const computePerformance = useCallback(async (employeeId, pairs, fyStart) => {
    const sortedPairs = [...pairs].sort((a, b) => (a.year - b.year) || (a.month - b.month))
    const selectedPairKeySet = new Set(sortedPairs.map(p => monthYearKey(p.month, p.year)))
    const employeeAliases = Array.from(new Set([String(employeeId), `D${String(employeeId).slice(-5)}`]))
    const applyAliasFilter = (query, column) => {
      if (employeeAliases.length === 1) return query.ilike(column, `${employeeAliases[0]}%`)
      const orClause = employeeAliases.map(code => `${column}.ilike.${code}%`).join(',')
      return query.or(orClause)
    }
    const { startDate, endDateExclusive } = buildDateWindow(sortedPairs)
    const twoFyStart = `${fyStart - 1}-04-01`
    const twoFyEnd = `${fyStart + 1}-04-01`

    // ── PHASE 1a: core financial data (4 queries in parallel) ────────────────
    const [
      claimDateClaims,
      allStatusDateClaims,
      goalRowData,
      pointsMasterData,
    ] = await Promise.all([
      // 1. claim_date claims (for claimed sheets count)
      (startDate && endDateExclusive)
        ? fetchPaged((from, to) =>
            applyAliasFilter(
              supabase
              .from('influencer_claim_details')
              .select('claimed_qty_sheets, claim_date')
              .gte('claim_date', startDate)
              .lt('claim_date', endDateExclusive)
              .range(from, to),
              'mapped_isr_code'
            )
          )
        : Promise.resolve([]),

      // 2. status_date claims – full 2-FY window (covers sheet points + DMI history)
      fetchPaged((from, to) =>
        applyAliasFilter(
          supabase
          .from('influencer_claim_details')
          .select('account_number, approved_qty, product_code, status_date')
          .gte('status_date', twoFyStart)
          .lt('status_date', twoFyEnd)
          .range(from, to),
          'mapped_isr_code'
        )
      ),

      // 3. monthly sheet goal
      supabase
        .from('goals_master')
        .select('monthly_sheet_goal')
        .eq('employee_code', employeeId)
        .maybeSingle()
        .then(({ data }) => data),

      // 4. sheet point master (small lookup, no filter needed)
      supabase
        .from('sheet_point_master')
        .select('brand_name, points_per_sheet')
        .then(({ data }) => data || []),
    ])

    // ── PHASE 1b: visit / activity data (6 queries in parallel) ──────────────
    const [
      enrollmentRowsSGT,
      warRows,
      attendanceRows,
      existingDmiVisitRows,
      newDmiVisitRows,
      tierUpgradeRows,
    ] = await Promise.all([
      // 6. SGT enrollment rows (Silver/Gold/Titanium, active, within 2-FY for relevance)
      // NOTE: mapped_isr is included so we can verify ownership after global-latest check
      fetchPaged((from, to) => {
        let query = supabase
          .from('m_enrollment_details')
          .select('account_no, tier, is_active, created_at, mapped_isr')
          .in('tier', ['Silver', 'Gold', 'Titanium'])
          .gte('created_at', twoFyStart)
          .order('created_at', { ascending: false, nullsFirst: false })
          .range(from, to)
        return applyAliasFilter(query, 'mapped_isr')
      }),

      // 7. WAR tasks
      // Use alias-aware ISR filtering; task_date can be text in some uploads,
      // so month filtering is applied via pairMatch in-memory below.
      fetchPaged((from, to) => {
        let query = supabase
          .from('telecalling_influencer_wartask')
          .select('task_date, status_as_on_today, status_change_date')
          .range(from, to)
        return applyAliasFilter(query, 'mapped_isr_code')
      }),

      // 8. attendance
      (startDate && endDateExclusive)
        ? fetchPaged((from, to) =>
            supabase
              .from('monthly_attendance_report')
              .select('attendance_date, attendance_status')
              .eq('employee_code', employeeId)
              .gte('attendance_date', startDate)
              .lt('attendance_date', endDateExclusive)
              .range(from, to)
          )
        : Promise.resolve([]),

      // 9. existing DMI visits
      (startDate && endDateExclusive)
        ? fetchPaged((from, to) =>
            supabase
              .from('influencer_visit_reports')
              .select('influencer_code, visit_date')
              .eq('emp_login', employeeId)
              .gte('visit_date', startDate)
              .lt('visit_date', endDateExclusive)
              .range(from, to)
          )
        : Promise.resolve([]),

      // 10. new DMI visits (new enrollments)
      (startDate && endDateExclusive)
        ? fetchPaged((from, to) =>
            supabase
              .from('influencer_enrollment_details')
              .select('influencer_id, enrollment_date')
              .eq('enrolled_by_dso_code', employeeId)
              .gte('enrollment_date', startDate)
              .lt('enrollment_date', endDateExclusive)
              .range(from, to)
          )
        : Promise.resolve([]),

      // 11. tier upgrade events – fetch all, filter by employee + date in-memory
      // (tier_change_date is TEXT, so can't use database date filters effectively)
      fetchPaged((from, to) => {
        let query = supabase
          .from('tier_upgrade_performance_report')
          .select('mapped_isr, change_type, previous_tier, new_tier, tier_change_date')
          .range(from, to)
        return applyAliasFilter(query, 'mapped_isr')
      }),
    ])

    // ── PHASE 1c: lead / SGT visit data (3 queries in parallel) ─────────────
    const [
      leadDetailRows,
      leadTaskRows,
      sgtVisits,
    ] = await Promise.all([
      // 12. lead details (new site visits)
      (startDate && endDateExclusive)
        ? fetchPaged((from, to) =>
            supabase
              .from('lead_details_reports')
              .select('lead_created_by, created_date, lead_code')
              .ilike('lead_created_by', `${employeeId}%`)
              .gte('created_date', startDate)
              .lt('created_date', endDateExclusive)
              .range(from, to)
          )
        : Promise.resolve([]),

      // 13. lead tasks (existing site visits)
      (startDate && endDateExclusive)
        ? fetchPaged((from, to) =>
            supabase
              .from('lead_task_reports')
              .select('id, task_created_on, lead_id')
              .eq('task_created_by_dso_code', employeeId)
              .gte('task_created_on', startDate)
              .lt('task_created_on', endDateExclusive)
              .range(from, to)
          )
        : Promise.resolve([]),

      // 14. SGT visit reports
      (startDate && endDateExclusive)
        ? fetchPaged((from, to) => {
            let query = supabase
              .from('influencer_visit_reports')
              .select('influencer_code, visit_date, influencer_tier')
              .in('influencer_tier', ['Silver', 'Gold', 'Titanium'])
              .gte('visit_date', startDate)
              .lt('visit_date', endDateExclusive)
              .range(from, to)
            return applyAliasFilter(query, 'mapped_isr_code')
          })
        : Promise.resolve([]),
    ])

    // ── PHASE 1 IN-MEMORY PROCESSING ─────────────────────────────────────────
    // twoFyStart / twoFyEnd already declared above
    const twoFyMonthKeySet = buildTwoFyMonthKeySet(fyStart)

    const goalRow = goalRowData
    const pointsMaster = pointsMasterData

    const pairMatch = (dateStr) => {
      const parsed = getMonthYearFromValue(dateStr)
      if (!parsed) return false
      return selectedPairKeySet.has(monthYearKey(parsed.month, parsed.year))
    }

    // Derive both claim views from the single broad fetch
    const filteredClaimDateClaims = claimDateClaims.filter(c => pairMatch(c.claim_date))
    const filteredStatusDateClaims = allStatusDateClaims.filter(c => pairMatch(c.status_date))
    // allStatusDateClaims already covers the full 2-FY window → used as dmiHistoryClaims below

    // Sheet points setup
    const monthlyGoal = toNumber(goalRow?.monthly_sheet_goal)
    const sheetGoal = sortedPairs.reduce((sum, pair) => sum + (monthlyGoal * getQuarterFactor(pair.month)), 0)
    const dmiGoal = sortedPairs.reduce((sum, pair) => {
      const spg = monthlyGoal * getQuarterFactor(pair.month)
      const a = spg / 55
      const b = Math.round(a)
      const c = b > 8 ? b : 8
      return sum + (c * 40)
    }, 0)

    const totalClaimedSheets = filteredClaimDateClaims.reduce((sum, c) => sum + toNumber(c.claimed_qty_sheets), 0)
    const totalApprovedSheets = filteredStatusDateClaims.reduce((sum, c) => sum + toNumber(c.approved_qty), 0)

    const productQtyMap = {}
    filteredStatusDateClaims.forEach(c => {
      if (!c.product_code) return
      productQtyMap[c.product_code] = (productQtyMap[c.product_code] || 0) + toNumber(c.approved_qty)
    })
    const uniqueProductCodes = Object.keys(productQtyMap)
    const uniqueClaimAccounts = [...new Set(
      filteredStatusDateClaims.map(c => normalizeAccount(c.account_number)).filter(Boolean)
    )]

    // SGT enrollment → activeSgtAccounts (needed later for visit filtering)
    const isActiveTrue = (value) => {
      const normalized = String(value ?? '').trim().toLowerCase()
      return ['true', 't', '1', 'yes', 'y'].includes(normalized)
    }

    // Step 1: candidate account_nos from ISR-filtered enrollments
    const candidateSgtAccountNos = [...new Set(
      enrollmentRowsSGT.map(r => String(r.account_no || '').trim()).filter(Boolean)
    )]

    // Step 2: For candidate accounts, fetch ALL enrollments (any ISR) to find globally-latest
    const verifyEnrollmentsSGT = candidateSgtAccountNos.length > 0
      ? await fetchPaged((from, to) =>
          supabase
            .from('m_enrollment_details')
            .select('account_no, tier, is_active, created_at, mapped_isr')
            .in('account_no', candidateSgtAccountNos)
            .in('tier', ['Silver', 'Gold', 'Titanium'])
            .order('created_at', { ascending: false, nullsFirst: false })
            .order('account_no', { ascending: true })
            .range(from, to)
        )
      : []

    // Step 3: Build uniqueTierByAccount using GLOBALLY-latest enrollment per account
    // Only keep accounts where the globally-latest enrollment's ISR matches this employee
    const globallyLatestSgtMap = {}
    verifyEnrollmentsSGT.forEach(r => {
      const account = String(r.account_no || '').trim()
      if (!account || globallyLatestSgtMap[account]) return  // first = latest (sorted DESC)
      globallyLatestSgtMap[account] = r
    })
    const isrAliasesLower = employeeAliases.map(a => a.toLowerCase())
    const uniqueTierByAccount = {}
    Object.entries(globallyLatestSgtMap).forEach(([account, r]) => {
      if (!isActiveTrue(r.is_active)) return
      const isr = String(r.mapped_isr || '').trim().toLowerCase()
      // Account must be currently mapped to this employee (globally-latest ownership check)
      if (!isrAliasesLower.some(alias => isr.startsWith(alias))) return
      uniqueTierByAccount[account] = r.tier
    })
    const activeSgtAccounts = new Set(Object.keys(uniqueTierByAccount))

    // Lead tasks → ids needed for dedup meta fetch
    const filteredLeadTasks = leadTaskRows.filter(v => pairMatch(v.task_created_on))
    const leadIdsForDateCheck = [...new Set(
      filteredLeadTasks.map(v => v.lead_id).filter(id => id != null && id !== '')
    )]

    // ── PHASE 2: conditionally dependent fetches, all in parallel ─────────────
    const [brandMasterData, fallbackRows, leadCreatedMetaMap, mEnrollmentRows] = await Promise.all([
      // A. brand category mapping (depends on uniqueProductCodes)
      uniqueProductCodes.length
        ? supabase
            .from('brand_category_master')
            .select('brand_name, brand_category')
            .in('brand_name', uniqueProductCodes)
            .then(({ data }) => data || [])
        : Promise.resolve([]),

      // B. fallback tier from influencer_enrollment_details (chunked, parallelised)
      (async () => {
        if (uniqueClaimAccounts.length === 0) return []
        const CHUNK = 200
        const chunks = []
        for (let i = 0; i < uniqueClaimAccounts.length; i += CHUNK) {
          chunks.push(uniqueClaimAccounts.slice(i, i + CHUNK))
        }
        const results = await Promise.all(chunks.map(chunk =>
          fetchPaged((from, to) =>
            supabase
              .from('influencer_enrollment_details')
              .select('influencer_id, influencer_tier, enrollment_date')
              .in('influencer_id', chunk)
              .range(from, to)
          )
        ))
        return results.flat()
      })(),

      // C. lead created meta for existing-site-visit deduplication (depends on leadIdsForDateCheck)
      (async () => {
        const map = new Map()
        if (leadIdsForDateCheck.length === 0) return map
        const CHUNK = 200
        const chunks = []
        for (let i = 0; i < leadIdsForDateCheck.length; i += CHUNK) {
          chunks.push(leadIdsForDateCheck.slice(i, i + CHUNK))
        }
        const results = await Promise.all(chunks.map(chunk =>
          supabase
            .from('lead_details_reports')
            .select('lead_code, created_date')
            .in('lead_code', chunk)
            .then(({ data }) => data || [])
        ))
        results.flat().forEach(row => {
          if (!row?.lead_code) return
          if (!map.has(row.lead_code)) map.set(row.lead_code, { dates: new Set(), hasNullDate: false })
          const meta = map.get(row.lead_code)
          if (!row.created_date) { meta.hasNullDate = true; return }
          meta.dates.add(String(row.created_date).slice(0, 10))
        })
        return map
      })(),

      // D. per-month m_enrollment_details (chunked, depends on uniqueClaimAccounts - now available)
      (async () => {
        if (uniqueClaimAccounts.length === 0) return []
        const CHUNK = 200
        const chunks = []
        for (let i = 0; i < uniqueClaimAccounts.length; i += CHUNK) {
          chunks.push(uniqueClaimAccounts.slice(i, i + CHUNK))
        }
        const results = await Promise.all(chunks.map(chunk =>
          fetchPaged((from, to) =>
            supabase
              .from('m_enrollment_details')
              .select('account_no, tier, created_at')
              .in('account_no', chunk)
              .range(from, to)
          )
        ))
        return results.flat()
      })(),
    ])

    const brandMaster = brandMasterData

    // ── PHASE 2 IN-MEMORY PROCESSING ─────────────────────────────────────────
    // Brand breakdown for sheet points
    const productToCategoryMap = {}
    ;(brandMaster || []).forEach(b => {
      productToCategoryMap[b.brand_name] = b.brand_category
    })
    const categoryQtyMap = {}
    Object.entries(productQtyMap).forEach(([productCode, qty]) => {
      const category = productToCategoryMap[productCode] || 'Other'
      categoryQtyMap[category] = (categoryQtyMap[category] || 0) + qty
    })
    const categoryPointsMap = {}
    ;(pointsMaster || []).forEach(p => {
      categoryPointsMap[p.brand_name] = toNumber(p.points_per_sheet)
    })
    let sheetPoints = 0
    const allCategories = [...new Set([
      ...(pointsMaster || []).map(p => p.brand_name).filter(Boolean),
      ...Object.keys(categoryQtyMap),
    ])]
    const brandBreakdown = allCategories.map((category) => {
      const qty = toNumber(categoryQtyMap[category])
      const pps = categoryPointsMap[category] || 0
      const totalPoints = qty * pps
      sheetPoints += totalPoints
      return { brandCategory: category, qty, pointsPerSheet: pps, totalPoints }
    })
    const brandOrder = ['Duro Deco', 'Duro VAP', 'Duro', 'Tower']
    brandBreakdown.sort((a, b) => {
      const ia = brandOrder.indexOf(a.brandCategory)
      const ib = brandOrder.indexOf(b.brandCategory)
      if (ia !== -1 && ib !== -1) return ia - ib
      if (ia !== -1) return -1
      if (ib !== -1) return 1
      return a.brandCategory.localeCompare(b.brandCategory)
    })
    const sheetData = {
      achieved: totalApprovedSheets,
      claimed: totalClaimedSheets,
      approvedSummary: totalApprovedSheets,
      points: sheetPoints,
      goal: sheetGoal,
      baseMonthlyGoal: monthlyGoal,
      brandBreakdown,
    }

    // DMI classification uses selected-month claims + account-level history (mobile parity).
    const selectedMonthlyTotals = {}
    filteredStatusDateClaims.forEach(c => {
      const parsed = getMonthYearFromValue(c.status_date)
      if (!parsed) return
      const mk = monthYearKey(parsed.month, parsed.year)
      if (!selectedPairKeySet.has(mk)) return
      const account = normalizeAccount(c.account_number)
      if (!account) return
      const key = `${account}_${mk}`
      selectedMonthlyTotals[key] = (selectedMonthlyTotals[key] || 0) + toNumber(c.approved_qty)
    })

    const activeAccountMonthRows = Object.entries(selectedMonthlyTotals)
      .filter(([, qty]) => toNumber(qty) >= 10)
      .map(([key, qty]) => {
        // Key format: "ACCOUNT_YEAR-MONTH" (e.g. "12345_2025-6")
        // Split on last underscore to handle account numbers that may contain underscores
        const lastUnderscore = key.lastIndexOf('_')
        const account = key.substring(0, lastUnderscore)
        const mk = key.substring(lastUnderscore + 1) // "2025-6"
        const [yearText, monthText] = mk.split('-')
        return {
          account,
          year: Number(yearText),
          month: Number(monthText),
          totalSheets: toNumber(qty),
        }
      })

    const activeAccountsForHistory = [...new Set(activeAccountMonthRows.map(row => row.account))]
    const approvedSheetsByAccountMonth = new Map()

    if (activeAccountsForHistory.length > 0) {
      const CHUNK = 200
      for (let i = 0; i < activeAccountsForHistory.length; i += CHUNK) {
        const chunk = activeAccountsForHistory.slice(i, i + CHUNK)
        const historyRows = await fetchPaged((from, to) =>
          supabase
            .from('influencer_claim_details')
            .select('account_number, approved_qty, status_date, claim_date')
            .in('account_number', chunk)
            .order('status_date', { ascending: false })
            .order('account_number', { ascending: true })
            .range(from, to)
        )

        historyRows.forEach(row => {
          const account = normalizeAccount(row.account_number)
          if (!account) return
          const parsed = getMonthYearFromValue(row.status_date || row.claim_date)
          if (!parsed) return
          const mk = monthYearKey(parsed.month, parsed.year)
          if (!twoFyMonthKeySet.has(mk)) return
          if (!approvedSheetsByAccountMonth.has(account)) approvedSheetsByAccountMonth.set(account, new Map())
          const monthMap = approvedSheetsByAccountMonth.get(account)
          monthMap.set(mk, (monthMap.get(mk) || 0) + toNumber(row.approved_qty))
        })
      }
    }

    // DMI new vs active classification
    const selectedActiveCandidates = []
    const newDmiSet = new Set()
    const activeDmiSet = new Set()
    let approvedSheetsForAverage = 0
    let newDmiCount = 0

    activeAccountMonthRows.forEach(({ account, month, year, totalSheets }) => {
      const selectedIdx = monthYearIndex(month, year)
      approvedSheetsForAverage += totalSheets

      const monthMap = approvedSheetsByAccountMonth.get(account) || new Map()
      let hasPriorActive = false
      monthMap.forEach((qty, mk) => {
        if (hasPriorActive || toNumber(qty) < 10) return
        const [mkYear, mkMonth] = mk.split('-').map(Number)
        const idx = monthYearIndex(mkMonth, mkYear)
        if (idx < selectedIdx) hasPriorActive = true
      })

      if (hasPriorActive) {
        activeDmiSet.add(account)
        selectedActiveCandidates.push({ account, month, year })
      } else {
        newDmiSet.add(account)
        newDmiCount += 1
      }
    })

    // Build tier map from per-month m_enrollment_details
    const enrollmentTierByAccountMonth = new Map()
    mEnrollmentRows.forEach(r => {
      const account = normalizeAccount(r.account_no)
      const tier = normalizeTierLabel(r.tier)
      const parsed = getMonthYearFromValue(r.created_at)
      if (!account || !tier || !parsed) return
      const mk = monthYearKey(parsed.month, parsed.year)
      const key = `${account}_${mk}`
      const d = parseDateSafe(r.created_at)
      const ts = d ? d.getTime() : 0
      const prev = enrollmentTierByAccountMonth.get(key)
      if (!prev || ts > prev.ts) {
        enrollmentTierByAccountMonth.set(key, { tier, ts })
      }
    })

    // Build fallback tier map from influencer_enrollment_details
    const influencerEnrollmentTierById = new Map()
    fallbackRows.forEach(r => {
      const account = normalizeAccount(r.influencer_id)
      const tier = normalizeTierLabel(r.influencer_tier)
      if (!account || !tier) return
      const d = parseDateSafe(r.enrollment_date)
      const ts = d ? d.getTime() : -1
      const prev = influencerEnrollmentTierById.get(account)
      if (!prev || ts > prev.ts) {
        influencerEnrollmentTierById.set(account, { tier, ts })
      }
    })

    // Resolve tier for each active DMI with explicit source tracking
    const resolvedActiveByEntry = selectedActiveCandidates.map(entry => {
      const mk = monthYearKey(entry.month, entry.year)
      
      // Try primary source first: m_enrollment_details (per-month)
      const primaryTierData = enrollmentTierByAccountMonth.get(`${entry.account}_${mk}`)
      if (primaryTierData) {
        return {
          account: entry.account,
          month: entry.month,
          year: entry.year,
          tier: primaryTierData.tier,
          tierSource: 'm_enrollment_details',
        }
      }
      
      // Fallback source: influencer_enrollment_details (not per-month)
      const fallbackTierData = influencerEnrollmentTierById.get(entry.account)
      if (fallbackTierData) {
        return {
          account: entry.account,
          month: entry.month,
          year: entry.year,
          tier: fallbackTierData.tier,
          tierSource: 'influencer_enrollment_details',
        }
      }
      
      // No tier found
      return {
        account: entry.account,
        month: entry.month,
        year: entry.year,
        tier: 'Unknown',
        tierSource: 'none',
      }
    })

    // Keep fallback tier source in scope when monthly enrollment tier is unavailable.
    const selectedActiveEntries = resolvedActiveByEntry

    const activePrimaryAccounts = [...new Set(selectedActiveEntries.map(e => e.account))]
    const allKnownTiers = ['Titanium', 'Gold', 'Silver', 'Bronze', 'Base Tier', 'Base']
    const uniqueTiers = [...new Set([
      ...allKnownTiers,
      ...selectedActiveEntries.map(e => normalizeTierLabel(e.tier)).filter(Boolean),
    ])]

    // ── PHASE 3: tier points lookup (depends on uniqueTiers) ──────────────────
    const { data: tierPoints } = uniqueTiers.length
      ? await supabase
          .from('dmi_raw_points_master')
          .select('tier, points_per_dmi')
          .in('tier', uniqueTiers)
      : { data: [] }

    // ── FINAL COMPUTATION (all in-memory from here) ───────────────────────────
    const tierPointsMap = {}
    ;(tierPoints || []).forEach(tp => {
      const key = normalizeTierLabel(tp.tier)
      tierPointsMap[key] = toNumber(tp.points_per_dmi)
    })
    const tierCountMap = {}
    selectedActiveEntries.forEach(entry => {
      const tier = normalizeTierLabel(entry.tier) || 'Unknown'
      if (!tierCountMap[tier]) tierCountMap[tier] = 0
      tierCountMap[tier] += 1
    })
    let totalRawPoints = 0
    Object.entries(tierCountMap).forEach(([tier, count]) => {
      totalRawPoints += toNumber(count) * toNumber(tierPointsMap[tier])
    })
    const activeDmiCount = selectedActiveEntries.length  // sum across all selected months (not unique accounts)
    // Use qualified (>=10) account-month sheets to align with mobile DMI multiplier logic.
    const approvedDmisForAverage = activeDmiCount + newDmiCount
    const averageSheetsPerDmi = approvedDmisForAverage > 0 ? parseFloat((approvedSheetsForAverage / approvedDmisForAverage).toFixed(1)) : 0
    let rawPointsMultiplier = 1
    if (averageSheetsPerDmi < 15) rawPointsMultiplier = 0.15
    else if (averageSheetsPerDmi < 40) rawPointsMultiplier = 0.5
    const finalRawPoints = Math.round(totalRawPoints * rawPointsMultiplier)
    const newEnrolledPoints = newDmiCount * 10

    const tierMap = {
      'Base Tier': 1,
      Bronze: 2,
      Silver: 3,
      Gold: 4,
      Titanium: 5,
    }
    const normalizeTierForUpgrade = (value) => normalizeTierLabel(value)
    const normalizeChangeType = (value) => String(value || '').trim().toLowerCase()
    
    // Helper: Parse tier_change_date (supports "28 Apr 2026", "2026-04-28", "April 28, 2026")
    const parseTierChangeDate = (dateStr) => {
      if (!dateStr) return null
      try {
        // Try common formats: "28 Apr 2026", "2026-04-28", "28-04-2026", etc.
        const date = new Date(dateStr)
        return isNaN(date.getTime()) ? null : date
      } catch (e) {
        return null
      }
    }
    
    // Filter tier upgrades by selected fiscal year only
    const fyStart_dt = new Date(`${fyStart}-04-01`)
    const fyEnd_dt = new Date(`${fyStart + 1}-04-01`)
    console.log('🔍 Tier Upgrade Debug:', { fyStart, fyStart_dt, fyEnd_dt })
    console.log('📋 All tier upgrade rows received:', tierUpgradeRows.length, tierUpgradeRows)
    const tierUpgradeRowsInFY = tierUpgradeRows.filter(r => {
      const changeDate = parseTierChangeDate(r.tier_change_date)
      if (!changeDate) return false
      return changeDate >= fyStart_dt && changeDate < fyEnd_dt
    })
    console.log('📅 Tier upgrades in FY window:', tierUpgradeRowsInFY.length, tierUpgradeRowsInFY)
    const qualifyingUpgrades = tierUpgradeRowsInFY.filter(r => {
      // NOTE: Tier upgrades should include ALL upgrades for the entire fiscal year,
      // regardless of the currently selected month filter. Users should see all achievements.
      if (normalizeChangeType(r.change_type) !== 'tier upgrade') return false

      const previousTier = normalizeTierForUpgrade(r.previous_tier)
      const newTier = normalizeTierForUpgrade(r.new_tier)
      const previousTierValue = tierMap[previousTier]
      const newTierValue = tierMap[newTier]
      if (previousTierValue == null || newTierValue == null) return false

      // Apply month/quarter filter to tier upgrades
      const matchesSelectedMonths = pairMatch(r.tier_change_date)
      console.log('🔍 Month filter for upgrade:', { date: r.tier_change_date, matches: matchesSelectedMonths })
      
      return ['Silver', 'Gold', 'Titanium'].includes(newTier) && newTierValue > previousTierValue && matchesSelectedMonths
    })
    console.log('✅ Qualifying upgrades:', qualifyingUpgrades.length, qualifyingUpgrades)
    const tierUpgradedDmiCount = qualifyingUpgrades.length
    const dmiUpdatePoints = qualifyingUpgrades.reduce((sum, row) => {
      const previousTierValue = tierMap[normalizeTierForUpgrade(row.previous_tier)]
      const newTierValue = tierMap[normalizeTierForUpgrade(row.new_tier)]
      const points = (newTierValue - previousTierValue) * 25
      console.log('💰 Single upgrade:', { previous: row.previous_tier, new: row.new_tier, previousValue: previousTierValue, newValue: newTierValue, points })
      return sum + points
    }, 0)
    console.log('💰 Total DMI Update Points:', dmiUpdatePoints)
    Object.keys(tierPointsMap).forEach((tier) => {
      if (tierCountMap[tier] == null) tierCountMap[tier] = 0
    })
    const tierOrder = ['Titanium', 'Gold', 'Silver', 'Bronze', 'Base Tier']
    const tierBreakdown = Object.entries(tierCountMap)
      .map(([tier, count]) => ({
        tier,
        activeDmiCount: count,
        pointsPerDmi: toNumber(tierPointsMap[tier]),
      }))
      .sort((a, b) => {
        const ia = tierOrder.indexOf(a.tier)
        const ib = tierOrder.indexOf(b.tier)
        if (ia !== -1 && ib !== -1) return ia - ib
        if (ia !== -1) return -1
        if (ib !== -1) return 1
        return a.tier.localeCompare(b.tier)
      })
    const dmiData = {
      achievedPoints: finalRawPoints + newEnrolledPoints + dmiUpdatePoints,
      finalRawPoints,
      newEnrolledPoints,
      dmiUpdatePoints,
      claimedDmiCount: new Set(
        filteredStatusDateClaims.map(e => normalizeAccount(e.account_number)).filter(Boolean)
      ).size,
      activeDmiCount,
      newDmiCount,
      tierUpgradedDmiCount,
      averageSheetsPerDmi,
      rawPointsMultiplier,
      tierBreakdown,
    }

    // S/G/T Coverage
    let monthlyVisitGoal = 0
    const tierMonthlyGoalMap = { Silver: 0, Gold: 0, Titanium: 0 }
    Object.values(uniqueTierByAccount).forEach(tier => {
      if (tier === 'Silver') {
        monthlyVisitGoal += 1
        tierMonthlyGoalMap.Silver += 1
      } else if (tier === 'Gold' || tier === 'Titanium') {
        monthlyVisitGoal += 2
        tierMonthlyGoalMap[tier] += 2
      }
    })
    const sgtGoal = monthlyVisitGoal * sortedPairs.length
    const uniqueDayVisitMap = new Map()
    sgtVisits
      .filter(v => pairMatch(v.visit_date) && activeSgtAccounts.has(String(v.influencer_code || '').trim()))
      .forEach(v => {
        if (!v.influencer_code || !v.visit_date) return
        const d = parseDateSafe(v.visit_date)
        if (!d) return
        const key = `${v.influencer_code}_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`
        if (!uniqueDayVisitMap.has(key)) uniqueDayVisitMap.set(key, v)
      })
    const monthlyVisitCounts = {}
    Array.from(uniqueDayVisitMap.values()).forEach(v => {
      const d = parseDateSafe(v.visit_date)
      if (!d) return
      const mk = `${v.influencer_code}_${d.getMonth() + 1}_${d.getFullYear()}`
      if (!monthlyVisitCounts[mk]) monthlyVisitCounts[mk] = { count: 0, tier: v.influencer_tier }
      monthlyVisitCounts[mk].count += 1
    })
    let sgtAchieved = 0
    const tierAchievedMap = { Silver: 0, Gold: 0, Titanium: 0 }
    Object.values(monthlyVisitCounts).forEach(({ count, tier }) => {
      const cap = tier === 'Silver' ? 1 : 2
      const capped = Math.min(count, cap)
      sgtAchieved += capped
      if (tierAchievedMap[tier] !== undefined) tierAchievedMap[tier] += capped
    })
    const sgtData = {
      visitGoal: sgtGoal,
      achievedVisits: sgtAchieved,
      sgtTierBreakdown: ['Silver', 'Gold', 'Titanium'].map(tier => ({
        tier,
        achievedVisits: tierAchievedMap[tier] || 0,
        goalVisits: (tierMonthlyGoalMap[tier] || 0) * sortedPairs.length,
      })),
    }

    // WAR task completion
    const warFiltered = warRows.filter(r => pairMatch(r.task_date))
    const isClosureWithinAllowedWindow = (taskDateStr, statusDateStr) => {
      const taskDate = parseDateSafe(taskDateStr)
      const statusDate = parseDateSafe(statusDateStr)
      if (!taskDate || !statusDate) return false
      const taskMonthStart = new Date(taskDate.getFullYear(), taskDate.getMonth(), 1, 0, 0, 0, 0)
      const nextMonth7End = new Date(taskDate.getFullYear(), taskDate.getMonth() + 1, 7, 23, 59, 59, 999)
      return statusDate >= taskMonthStart && statusDate <= nextMonth7End
    }
    const warTaskData = {
      assigned: warFiltered.length,
      completed: warFiltered.filter(r =>
        normalizeStatus(r.status_as_on_today) === 'closure' &&
        isClosureWithinAllowedWindow(r.task_date, r.status_change_date)
      ).length,
    }

    // DMI + Site Visits
    const filteredAttendance = attendanceRows.filter(r => pairMatch(r.attendance_date))
    const workingDays = filteredAttendance.filter(r => {
      const s = String(r.attendance_status || '').trim()
      return s === 'P | P' || s === '- | -'
    }).length
    const dmiSiteGoal = Math.max(workingDays - 1, 0) * 10
    const existingDmiVisitSet = new Set()
    existingDmiVisitRows.filter(v => pairMatch(v.visit_date)).forEach(v => {
      if (!v.influencer_code || !v.visit_date) return
      const d = parseDateSafe(v.visit_date)
      if (!d) return
      existingDmiVisitSet.add(`${v.influencer_code}_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`)
    })
    const newDmiVisitSet = new Set()
    newDmiVisitRows.filter(v => pairMatch(v.enrollment_date)).forEach(v => {
      if (!v.influencer_id || !v.enrollment_date) return
      const d = parseDateSafe(v.enrollment_date)
      if (!d) return
      newDmiVisitSet.add(`${v.influencer_id}_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`)
    })
    const newSiteSet = new Set()
    leadDetailRows.filter(v => pairMatch(v.created_date)).forEach(v => {
      if (!v.lead_code || !v.created_date) return
      const d = parseDateSafe(v.created_date)
      if (!d) return
      newSiteSet.add(`${v.lead_code}_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`)
    })
    // Existing Site Visits: Count all lead tasks unique per lead per day from lead_task_reports
    const existingSiteSet = new Set()
    filteredLeadTasks.forEach((v, idx) => {
      const d = parseDateSafe(v.task_created_on)
      if (!d) return
      if (v.lead_id) {
        existingSiteSet.add(`${v.lead_id}_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`)
      } else {
        const rowToken = v.id || `row_${idx}`
        existingSiteSet.add(`nulllead_${rowToken}_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`)
      }
    })
    const existingDmiVisits = existingDmiVisitSet.size
    const newDmiVisits = newDmiVisitSet.size
    const dmiVisits = existingDmiVisits + newDmiVisits
    const newSiteVisits = newSiteSet.size
    const existingSiteVisits = existingSiteSet.size
    const siteVisits = newSiteVisits + existingSiteVisits
    const dmiSiteData = {
      visitGoal: dmiSiteGoal,
      achievedVisits: dmiVisits + siteVisits,
      dmiVisits,
      newDmiVisits,
      existingDmiVisits,
      siteVisits,
      newSiteVisits,
      existingSiteVisits,
    }
    // Behavior
    const behaviorGoal = Math.round(
      sortedPairs.reduce((sum, pair) => {
        const adjustedMonthlySheetGoal = monthlyGoal * getQuarterFactor(pair.month)
        const quarterlyEquivalentGoal = adjustedMonthlySheetGoal * 3
        const monthlyBehaviorGoal = quarterlyEquivalentGoal > 1800 ? adjustedMonthlySheetGoal * 0.2 : 120
        return sum + monthlyBehaviorGoal
      }, 0)
    )

    const sgtAchievedCapped = sgtData.visitGoal > 0 ? Math.min(sgtData.achievedVisits, sgtData.visitGoal) : 0
    const sgtPct = sgtData.visitGoal === 0 && sgtData.achievedVisits === 0
      ? 100
      : sgtData.visitGoal > 0
        ? Math.min((sgtAchievedCapped / sgtData.visitGoal) * 100, 100)
        : 0

    const dmiSiteAchievedCapped = dmiSiteData.visitGoal > 0 ? Math.min(dmiSiteData.achievedVisits, dmiSiteData.visitGoal) : 0
    const dmiSitePct = dmiSiteData.visitGoal === 0 && dmiSiteData.achievedVisits === 0
      ? 100
      : dmiSiteData.visitGoal > 0
        ? Math.min((dmiSiteAchievedCapped / dmiSiteData.visitGoal) * 100, 100)
        : 0

    const warCompletedCapped = warTaskData.assigned > 0 ? Math.min(warTaskData.completed, warTaskData.assigned) : 0
    const warPct = warTaskData.assigned === 0 && warTaskData.completed === 0
      ? 100
      : warTaskData.assigned > 0
        ? Math.min((warCompletedCapped / warTaskData.assigned) * 100, 100)
        : 0

    const behaviorCompletion = Math.min((sgtPct * 40 / 100) + (dmiSitePct * 35 / 100) + (warPct * 25 / 100), 100)
    const behaviorPoints = behaviorGoal > 0 ? Math.min(Math.round((behaviorCompletion / 100) * behaviorGoal), behaviorGoal) : 0

    const behaviorData = {
      achievedPoints: behaviorPoints,
      goal: behaviorGoal,
      completionPercentage: Number(behaviorCompletion.toFixed(1)),
      breakdown: [
        {
          label: 'S/G/T Coverage',
          weightage: 40,
          value: Math.round(sgtPct),
          visitGoal: sgtData.visitGoal,
          achievedVisits: sgtAchievedCapped,
          actualAchievedVisits: sgtData.achievedVisits,
          sgtTierBreakdown: sgtData.sgtTierBreakdown,
        },
        {
          label: 'DMI+Site Visits',
          weightage: 35,
          value: Math.round(dmiSitePct),
          visitGoal: dmiSiteData.visitGoal,
          achievedVisits: dmiSiteAchievedCapped,
          actualAchievedVisits: dmiSiteData.achievedVisits,
          dmiVisits: dmiSiteData.dmiVisits,
          newDmiVisits: dmiSiteData.newDmiVisits,
          existingDmiVisits: dmiSiteData.existingDmiVisits,
          siteVisits: dmiSiteData.siteVisits,
          newSiteVisits: dmiSiteData.newSiteVisits,
          existingSiteVisits: dmiSiteData.existingSiteVisits,
        },
        {
          label: 'War Task Completion',
          weightage: 25,
          value: Math.round(warPct),
          assigned: warTaskData.assigned,
          completed: warCompletedCapped,
          actualCompleted: warTaskData.completed,
        },
      ],
    }

    const totalAchieved = toNumber(sheetData.points) + toNumber(dmiData.achievedPoints) + toNumber(behaviorData.achievedPoints)
    const totalGoal = toNumber(sheetData.goal) + toNumber(dmiGoal) + toNumber(behaviorData.goal)
    const totalPct = totalGoal > 0 ? Number(((totalAchieved / totalGoal) * 100).toFixed(1)) : 0

    return {
      employeeId,
      generatedAt: new Date().toISOString(),
      sheetData,
      dmiGoal,
      dmiData,
      behaviorData,
      totals: {
        achievedPoints: totalAchieved,
        goalPoints: totalGoal,
        percentage: totalPct,
      },
    }
  }, [])

  const loadDetail = useCallback(async (forceRefresh = false) => {
    if (!selectedUser?.employee_id) {
      setDetailData(null)
      return
    }

    try {
      setDetailLoading(true)
      setDetailError(null)

      const quarterKey = selectedQuarters.includes('All')
        ? 'all'
        : [...selectedQuarters].sort().join('-')
      const monthKey = selectedMonths.includes('All')
        ? 'all'
        : [...selectedMonths].sort((a, b) => Number(a) - Number(b)).join('-')

      const cacheKey = `perf_detail_v7_${selectedUser.employee_id}_${selectedFYStart}_${quarterKey}_${monthKey}`

      const { data, fromCache } = await cachedFetch(
        cacheKey,
        () => computePerformance(selectedUser.employee_id, monthYearPairs, selectedFYStart),
        TTL.SHORT,
        forceRefresh
      )

      if (!mountedRef.current) return
      setDetailData(data)
      setFromCache(Boolean(fromCache))
    } catch (err) {
      if (mountedRef.current) setDetailError(err.message)
    } finally {
      if (mountedRef.current) setDetailLoading(false)
    }
  }, [selectedUser, selectedFYStart, selectedQuarters, selectedMonths, monthYearPairs, computePerformance])

  const downloadCurrentReport = useCallback(() => {
    if (!detailData || !selectedUser) return

    const selectionLabel = buildSelectionLabel(selectedQuarters, selectedMonths)
    const fyLabel = `FY_${selectedFYStart}-${String(selectedFYStart + 1).slice(-2)}`
    const safeName = String(selectedUser.full_name || selectedUser.employee_id || 'User').replace(/[^a-z0-9]+/gi, '_')
    const fileName = `Performance_Report_${safeName}_${fyLabel}_${selectionLabel}.xlsx`

    const summaryRows = [
      {
        Employee: selectedUser.employee_id || '',
        Employee_Name: selectedUser.full_name || '',
        Email: selectedUser.email || '',
        FY: fyLabel,
        Selection: selectionLabel,
        Total_Goal_Poi: detailData.totals.goalPoints,
        Total_Achieved_Poin: detailData.totals.achievedPoints,
        Overall_Achievement_Percentage: detailData.totals.percentage,
      },
    ]

    const sheetRows = [
      {
        Metric: 'Sheets',
        Claimed: detailData.sheetData.claimed,
        Achieved: detailData.sheetData.approvedSummary,
        Goal: detailData.sheetData.goal,
        Points: detailData.sheetData.points,
      },
      ...detailData.sheetData.brandBreakdown.map(row => ({
        Metric: row.brandCategory,
        Claimed: row.qty,
        Achieved: row.qty,
        Goal: row.pointsPerSheet,
        Points: row.totalPoints,
      })),
    ]

    const dmiRows = [
      {
        Metric: 'DMI Points',
        Claimed_DMIs: detailData.dmiData.claimedDmiCount,
        Active_DMIs: detailData.dmiData.activeDmiCount,
        Goal: detailData.dmiGoal,
        Achieved_Points: detailData.dmiData.achievedPoints,
        Raw_Points: detailData.dmiData.finalRawPoints,
        New_DMI_Points: detailData.dmiData.newEnrolledPoints,
        Tier_Upgrade_Points: detailData.dmiData.dmiUpdatePoints,
      },
      ...detailData.dmiData.tierBreakdown.map(row => ({
        Metric: row.tier,
        Claimed_DMIs: '',
        Active_DMIs: row.activeDmiCount,
        Goal: '',
        Achieved_Points: row.activeDmiCount * row.pointsPerDmi,
        Raw_Points: '',
        New_DMI_Points: '',
        Tier_Upgrade_Points: '',
      })),
    ]

    const behaviorRows = detailData.behaviorData.breakdown.map(row => ({
      Metric: row.label,
      Weightage: `${row.weightage}%`,
      Value: `${row.value}%`,
      Achieved: row.achievedVisits ?? row.completed ?? 0,
      Goal: row.visitGoal ?? row.assigned ?? 0,
    }))

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Summary')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sheetRows), 'Sheet Points')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(dmiRows), 'DMI Points')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(behaviorRows), 'Behavior')
    XLSX.writeFile(workbook, fileName)
  }, [detailData, selectedUser, selectedFYStart, selectedQuarters, selectedMonths])

  const downloadAllUsersReport = useCallback(async () => {
    if (!monthYearPairs.length || allUsersExporting) return

    const selectionLabel = buildSelectionLabel(selectedQuarters, selectedMonths)
    const fyLabel = `FY_${selectedFYStart}-${String(selectedFYStart + 1).slice(-2)}`
    const fileName = `Performance_Report_All_Users_${fyLabel}_${selectionLabel}.xlsx`

    const exportUsers = filteredUsers.filter(user => user?.employee_id)
    if (exportUsers.length === 0) return

    const rows = []
    const failedUsers = []
    const BATCH_SIZE = 2 // Ultra-conservative: 2 concurrent requests (was 3)
    const BATCH_DELAY = 1500 // 1.5 seconds between batches (was 1000ms)
    let done = 0

    setAllUsersExporting(true)
    setAllUsersExportProgress({ done: 0, total: exportUsers.length })

    try {
      for (let i = 0; i < exportUsers.length; i += BATCH_SIZE) {
        const batch = exportUsers.slice(i, i + BATCH_SIZE)
        
        const batchResults = await Promise.all(batch.map(async (user) => {
          let retries = 3 // Increased from 2 to 3 attempts
          let lastError = null
          let waitTime = 800 // Start with 800ms exponential backoff (was 500ms)

          while (retries > 0) {
            try {
              const { data } = await cachedFetch(
                `perf_export_${user.employee_id}_${selectedFYStart}_${selectionLabel}`,
                () => computePerformance(user.employee_id, monthYearPairs, selectedFYStart),
                TTL.MEDIUM
              )

              if (!data) {
                return { ok: false, user }
              }

              return {
                ok: true,
                user,
                row: {
                  Employee: user.employee_id || '',
                  Employee_Name: user.full_name || '',
                  Status: user.status ? (user.status === 'active' ? 'Active' : 'Inactive') : 'Unknown',
                  Reporting_Manager: user.reporting_manager || '',
                  Branch_Name: user.branch_name || '',
                  Achieved_Sheet: data.sheetData?.approvedSummary || 0,
                  Sheet_Goal: data.sheetData?.goal || 0,
                  Sheet_Points: data.sheetData?.points || 0,
                  Achieved_DMI: data.dmiData?.achievedPoints || 0,
                  DMI_Goal: data.dmiGoal || 0,
                  Achieved_Behavior: data.behaviorData?.achievedPoints || 0,
                  Behavior_Goal: data.behaviorData?.goal || 0,
                  Total_Goal: data.totals?.goalPoints || 0,
                  Total_Achieved: data.totals?.achievedPoints || 0,
                  Achievement_Percentage: data.totals?.percentage || 0,
                },
              }
            } catch (error) {
              lastError = error
              retries -= 1
              if (retries > 0) {
                // Exponential backoff: 500ms → 1000ms → 2000ms
                await new Promise(resolve => setTimeout(resolve, waitTime))
                waitTime *= 2
              }
            }
          }

          console.error('All users export failed for', user.employee_id, lastError)
          return { ok: false, user }
        }))

        batchResults.forEach(result => {
          if (result?.ok && result.row) rows.push(result.row)
          else if (result?.user?.employee_id) failedUsers.push(result.user.employee_id)
        })

        done += batch.length
        setAllUsersExportProgress({ done, total: exportUsers.length })

        // Add delay between batches to prevent connection pool exhaustion
        if (i + BATCH_SIZE < exportUsers.length) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))
        }
      }

      if (rows.length === 0) {
        alert('No report data could be generated for selected users. Please refresh and try again.')
        return
      }

      const workbook = XLSX.utils.book_new()
      const worksheet = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Performance Report')
      
      if (failedUsers.length > 0) {
        const failedSheet = XLSX.utils.json_to_sheet(failedUsers.map(id => ({ Employee_ID: id, Status: 'Export Failed' })))
        XLSX.utils.book_append_sheet(workbook, failedSheet, 'Failed')
        alert(`⚠️ Export completed with ${failedUsers.length} failures. Check "Failed" sheet for details.`)
      }
      
      XLSX.writeFile(workbook, fileName)
    } finally {
      setAllUsersExporting(false)
      setAllUsersExportProgress({ done: 0, total: 0 })
    }
  }, [filteredUsers, monthYearPairs, computePerformance, selectedFYStart, selectedQuarters, selectedMonths, allUsersExporting])

  useEffect(() => {
    mountedRef.current = true
    loadUsers()
    return () => { mountedRef.current = false }
  }, [loadUsers])

  useEffect(() => {
    loadDetail(false)
  }, [loadDetail])

  // Fetch admin user's branch and branch access if role is admin
  useEffect(() => {
    if (role === 'admin' && authUser?.id) {
      Promise.all([
        supabase
          .from('users')
          .select('branch_id')
          .eq('id', authUser.id)
          .single(),
        cachedFetch(
          `perf_dashboard_branch_access_${authUser.id}`,
          async () => {
            const { data, error } = await supabase
              .from('performance_dashboard_branch_access')
              .select('branch_id')
              .eq('user_id', authUser.id)
            if (error) throw error
            return data || []
          },
          TTL.SHORT
        )
      ]).then(([userBranchResult, accessResult]) => {
        if (!mountedRef.current) return
        const branchId = userBranchResult?.data?.branch_id || null
        const accessRows = Array.isArray(accessResult?.data) ? accessResult.data : []
        const allowedBranchIds = accessRows.map(row => row.branch_id).filter(Boolean)

        setAdminUserBranchId(branchId)
        setAdminAllowedBranchIds(allowedBranchIds.length > 0 ? allowedBranchIds : (branchId ? [branchId] : []))
      })
    } else {
      setAdminUserBranchId(null)
      setAdminAllowedBranchIds([])
    }
  }, [role, authUser?.id])

  const toggleQuarter = (q) => {
    if (q === 'All') {
      setSelectedQuarters(['All'])
      setSelectedMonths(['All'])
      return
    }
    let next = selectedQuarters.filter(x => x !== 'All')
    if (next.includes(q)) next = next.filter(x => x !== q)
    else next.push(q)

    if (next.length === 0 || next.length === 4) {
      setSelectedQuarters(['All'])
      setSelectedMonths(['All'])
      return
    }
    setSelectedQuarters(next)
    setSelectedMonths(['All'])
  }

  const toggleMonth = (m) => {
    if (m === 'All') {
      setSelectedMonths(['All'])
      return
    }
    let next = selectedMonths.filter(x => x !== 'All')
    if (next.includes(m)) next = next.filter(x => x !== m)
    else next.push(m)

    if (next.length === 0 || next.length === availableMonths.length) {
      setSelectedMonths(['All'])
      return
    }
    setSelectedMonths(next)
  }

  return (
    <main className="apdr-main">
      <section className="apdr-header">
        <div>
          <h2>DURO Lakshya Dashboard Report</h2>
          <p>View all users and open detailed performance metrics for each user</p>
        </div>
        <button className="apdr-btn apdr-btn-secondary" onClick={loadUsers} disabled={usersLoading}>
          <i className={`fa-solid fa-rotate-right ${usersLoading ? 'fa-spin' : ''}`}></i>
          Refresh Users
        </button>
      </section>

      <section className="apdr-filter-row">
        <div className="apdr-filter-group">
          <label>Financial Year</label>
          <select value={selectedFYStart} onChange={(e) => setSelectedFYStart(Number(e.target.value))}>
            {fyOptions.map(opt => <option key={opt.start} value={opt.start}>{opt.label}</option>)}
          </select>
        </div>

        <div className="apdr-filter-group">
          <label>Quarter / Month</label>
          <div className="apdr-inline-filters">
            <select
              className="apdr-quarter-select"
              value={selectedQuarters.includes('All') ? 'All' : selectedQuarters[0] || 'All'}
              onChange={(e) => {
                const value = e.target.value
                if (value === 'All') {
                  setSelectedQuarters(['All'])
                  setSelectedMonths(['All'])
                  return
                }

                setSelectedQuarters([value])
                setSelectedMonths(['All'])
              }}
            >
              <option value="All">All Quarters</option>
              <option value="Q1">Q1</option>
              <option value="Q2">Q2</option>
              <option value="Q3">Q3</option>
              <option value="Q4">Q4</option>
            </select>

            <select
              className="apdr-month-select"
              value={selectedMonths.includes('All') ? 'All' : String(selectedMonths[0] || 'All')}
              onChange={(e) => {
                const value = e.target.value
                if (value === 'All') {
                  setSelectedMonths(['All'])
                  return
                }
                setSelectedMonths([value])
              }}
            >
              <option value="All">All Months</option>
              {availableMonths.map(m => (
                <option key={m} value={String(m)}>{MONTH_LABELS[m]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="apdr-filter-group apdr-filter-action">
          <label>Branch</label>
          <select 
            value={selectedBranch} 
            onChange={(e) => setSelectedBranch(e.target.value)}
          >
            {branchOptions.map(branch => (
              <option key={branch} value={branch}>{branch}</option>
            ))}
          </select>
        </div>

        <div className="apdr-filter-group apdr-filter-action">
          <label>Report</label>
          <button className="apdr-btn apdr-btn-secondary" onClick={downloadAllUsersReport} disabled={allUsersExporting}>
            <i className={`fa-solid ${allUsersExporting ? 'fa-spinner fa-spin' : 'fa-file-arrow-down'}`}></i>
            {allUsersExporting
              ? `Downloading (${allUsersExportProgress.done}/${allUsersExportProgress.total})`
              : 'Download All Users'}
          </button>
        </div>
      </section>

      <div className="apdr-layout">
        <section className="apdr-card apdr-list-card">
          <div className="apdr-list-header">
            <h3>Users</h3>
            <span>{filteredUsers.length}</span>
          </div>

          <div className="apdr-search">
            <i className="fa-solid fa-search"></i>
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, email, employee ID"
            />
          </div>

          {usersLoading ? (
            <div className="apdr-loading"><i className="fa-solid fa-spinner fa-spin"></i><span>Loading users...</span></div>
          ) : usersError ? (
            <div className="apdr-error">{usersError}</div>
          ) : filteredUsers.length === 0 ? (
            <div className="apdr-empty">No users found.</div>
          ) : (
            <div className="apdr-user-list">
              {filteredUsers.map(u => {
                const isInactive = String(u.status || '').trim().toLowerCase() !== 'active'
                return (
                  <button
                    key={u.id}
                    className={`apdr-user-row ${selectedUserId === u.id ? 'selected' : ''} ${isInactive ? 'inactive-user' : ''}`}
                    onClick={() => setSelectedUserId(u.id)}
                  >
                    <div className="apdr-user-name">
                      {u.full_name || 'Unknown User'}
                      {isInactive && <span className="apdr-inactive-badge">Inactive</span>}
                    </div>
                    <div className="apdr-user-sub">{u.employee_id || '-'} | {u.email || '-'}</div>
                    {isInactive && u.leaving_date && (
                      <div className="apdr-user-leaving">
                        <i className="fa-solid fa-calendar-xmark"></i>
                        Last Working Day: {new Date(u.leaving_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <section className="apdr-card apdr-detail-card">
          {!selectedUser ? (
            <div className="apdr-empty">Select a user to view performance details.</div>
          ) : detailLoading ? (
            <div className="apdr-loading"><i className="fa-solid fa-spinner fa-spin"></i><span>Loading user performance...</span></div>
          ) : detailError ? (
            <div className="apdr-error">{detailError}</div>
          ) : !detailData ? (
            <div className="apdr-empty">No data available for this user.</div>
          ) : (
            <>
              <div className="apdr-detail-header">
                <div>
                  <h3>{selectedUser.full_name || 'User'}</h3>
                  <p>{selectedUser.employee_id || '-'} | {selectedUser.email || '-'}</p>
                </div>
                <div className="apdr-detail-actions">
                  <span className={`apdr-cache-pill ${fromCache ? 'cached' : 'fresh'}`}>{fromCache ? 'Cached' : 'Live'}</span>
                  <button className="apdr-btn apdr-btn-secondary" onClick={() => loadDetail(true)}>
                    <i className="fa-solid fa-rotate-right"></i>
                    Refresh Detail
                  </button>
                  <button className="apdr-btn apdr-btn-primary" onClick={downloadCurrentReport}>
                    <i className="fa-solid fa-download"></i>
                    Download Report
                  </button>
                </div>
              </div>

              <div className="apdr-total-card">
                <div>
                  <p>Total Achieved</p>
                  <h2>{detailData.totals.achievedPoints.toLocaleString()}</h2>
                </div>
                <div>
                  <p>Total Goal</p>
                  <h4>{detailData.totals.goalPoints.toLocaleString()}</h4>
                </div>
                <div>
                  <p>Overall %</p>
                  <h4>{detailData.totals.percentage}%</h4>
                </div>
              </div>

              <div className="apdr-pillars">
                <div className="apdr-pillar">
                  <h4>Sheet Points</h4>
                  <div className="apdr-grid3">
                    <div><label>Claimed Sheets</label><strong>{detailData.sheetData.claimed.toLocaleString()}</strong></div>
                    <div><label>Approved Sheets</label><strong>{detailData.sheetData.approvedSummary.toLocaleString()}</strong></div>
                    <div><label>Goal</label><strong>{detailData.sheetData.goal.toLocaleString()}</strong></div>
                    <div><label>Points</label><strong>{detailData.sheetData.points.toLocaleString()}</strong></div>
                    <div><label>Achievement</label><strong>{detailData.sheetData.goal > 0 ? ((detailData.sheetData.points / detailData.sheetData.goal) * 100).toFixed(1) : '0.0'}%</strong></div>
                  </div>

                  <div className="apdr-subtable-wrap">
                    <h5>Brand Breakdown</h5>
                    {detailData.sheetData.brandBreakdown.length === 0 ? (
                      <p className="apdr-muted">No brand data.</p>
                    ) : (
                      <table className="apdr-subtable">
                        <thead><tr><th>Brand</th><th>Sheets</th><th>Multiplier</th><th>Points</th></tr></thead>
                        <tbody>
                          {detailData.sheetData.brandBreakdown.map((row, idx) => (
                            <tr key={idx}>
                              <td>{row.brandCategory}</td>
                              <td>{toNumber(row.qty).toLocaleString()}</td>
                              <td>{toNumber(row.pointsPerSheet).toLocaleString()}</td>
                              <td>{toNumber(row.totalPoints).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                <div className="apdr-pillar">
                  <h4>DMI Points</h4>
                  <div className="apdr-grid3">
                    <div><label>Claimed DMIs</label><strong>{detailData.dmiData.claimedDmiCount.toLocaleString()}</strong></div>
                    <div><label>Active DMIs</label><strong>{detailData.dmiData.activeDmiCount.toLocaleString()}</strong></div>
                    <div><label>Goal</label><strong>{detailData.dmiGoal.toLocaleString()}</strong></div>
                    <div><label>Achieved Points</label><strong>{detailData.dmiData.achievedPoints.toLocaleString()}</strong></div>
                    <div><label>New DMI Points</label><strong>{detailData.dmiData.newEnrolledPoints.toLocaleString()}</strong></div>
                    <div><label>Tier Upgrade Points</label><strong>{detailData.dmiData.dmiUpdatePoints.toLocaleString()}</strong></div>
                  </div>

                  <div className="apdr-subtable-wrap">
                    <h5>Tier Breakdown</h5>
                    <table className="apdr-subtable">
                      <thead><tr><th>Tier</th><th>Active Count</th><th>Multiplier</th><th>Points</th></tr></thead>
                      <tbody>
                        {detailData.dmiData.tierBreakdown.map((row, idx) => (
                          <tr key={idx}>
                            <td>{row.tier}</td>
                            <td>{toNumber(row.activeDmiCount).toLocaleString()}</td>
                            <td>{toNumber(row.pointsPerDmi).toLocaleString()}</td>
                            <td>{(toNumber(row.activeDmiCount) * toNumber(row.pointsPerDmi)).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="apdr-pillar">
                  <h4>Behavior Points</h4>
                  <div className="apdr-grid3">
                    <div><label>Achieved Points</label><strong>{detailData.behaviorData.achievedPoints.toLocaleString()}</strong></div>
                    <div><label>Goal</label><strong>{detailData.behaviorData.goal.toLocaleString()}</strong></div>
                    <div><label>Completion</label><strong>{detailData.behaviorData.completionPercentage.toFixed(1)}%</strong></div>
                  </div>

                  <div className="apdr-subtable-wrap">
                    <h5>Behavior Breakdown</h5>
                    <table className="apdr-subtable">
                      <thead><tr><th>Metric</th><th>Weightage</th><th>Value</th><th>Achieved</th><th>Goal</th></tr></thead>
                      <tbody>
                        {detailData.behaviorData.breakdown.map((row, idx) => (
                          <tr key={idx}>
                            <td>{row.label}</td>
                            <td>{row.weightage}%</td>
                            <td>{toNumber(row.value).toLocaleString()}%</td>
                            <td>{toNumber(row.actualAchievedVisits ?? row.achievedVisits ?? row.completed).toLocaleString()}</td>
                            <td>{toNumber(row.visitGoal ?? row.assigned).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {detailData.behaviorData.breakdown
                      .filter(row => row.label === 'S/G/T Coverage' && Array.isArray(row.sgtTierBreakdown) && row.sgtTierBreakdown.length > 0)
                      .map((row, idx) => (
                        <div key={`sgt-split-${idx}`} className="apdr-subtable-wrap" style={{ marginTop: '0.75rem' }}>
                          <h5>S/G/T Tier-wise Breakdown</h5>
                          <table className="apdr-subtable">
                            <thead><tr><th>Tier</th><th>Achieved</th><th>Goal</th></tr></thead>
                            <tbody>
                              {row.sgtTierBreakdown.map((tierRow, tierIdx) => (
                                <tr key={tierIdx}>
                                  <td>{tierRow.tier}</td>
                                  <td>{toNumber(tierRow.achievedVisits).toLocaleString()}</td>
                                  <td>{toNumber(tierRow.goalVisits).toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}

                    {detailData.behaviorData.breakdown
                      .filter(row => row.label === 'DMI+Site Visits')
                      .map((row, idx) => (
                        <div key={`dmisite-split-${idx}`} className="apdr-subtable-wrap" style={{ marginTop: '0.75rem' }}>
                          <h5>DMI + Site Visits Bifurcation</h5>
                          <table className="apdr-subtable">
                            <thead><tr><th>Type</th><th>New</th><th>Existing</th><th>Total</th></tr></thead>
                            <tbody>
                              <tr>
                                <td>DMI Visits</td>
                                <td>{toNumber(row.newDmiVisits).toLocaleString()}</td>
                                <td>{toNumber(row.existingDmiVisits).toLocaleString()}</td>
                                <td>{toNumber(row.dmiVisits).toLocaleString()}</td>
                              </tr>
                              <tr>
                                <td>Site Visits</td>
                                <td>{toNumber(row.newSiteVisits).toLocaleString()}</td>
                                <td>{toNumber(row.existingSiteVisits).toLocaleString()}</td>
                                <td>{toNumber(row.siteVisits).toLocaleString()}</td>
                              </tr>
                              <tr>
                                <td><strong>Total Visits</strong></td>
                                <td>{(toNumber(row.newDmiVisits) + toNumber(row.newSiteVisits)).toLocaleString()}</td>
                                <td>{(toNumber(row.existingDmiVisits) + toNumber(row.existingSiteVisits)).toLocaleString()}</td>
                                <td><strong>{(toNumber(row.newDmiVisits) + toNumber(row.newSiteVisits) + toNumber(row.existingDmiVisits) + toNumber(row.existingSiteVisits)).toLocaleString()}</strong></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
