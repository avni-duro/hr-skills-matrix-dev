import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabaseClient'
import { cachedFetch, TTL } from '../utils/cacheDB'
import { AuthContext } from '../contexts/AuthContext'
import './PerformanceDashboard.css'
import './AsmPerformanceDashboard.css'

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

const BRAND_ORDER = ['Duro Deco', 'Duro VAP', 'Duro', 'Tower']
const TIER_ORDER = ['Titanium', 'Gold', 'Silver', 'Bronze', 'Base Tier']

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

async function fetchPaged(getQuery, pageSize = 1000) {
  let from = 0
  let allRows = []

  while (true) {
    const { data, error } = await getQuery(from, from + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    allRows = allRows.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }

  return allRows
}

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function parseDateSafe(value) {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value

  const text = String(value).trim()
  if (!text) return null

  const direct = new Date(text)
  if (!Number.isNaN(direct.getTime())) return direct

  const dmy = text.match(/^([0-9]{1,2})\s+([A-Za-z]{3})\s+([0-9]{4})$/)
  if (!dmy) return null

  const monthMap = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  }

  const monthIndex = monthMap[dmy[2]]
  if (monthIndex == null) return null

  const parsed = new Date(Number(dmy[3]), monthIndex, Number(dmy[1]))
  return Number.isNaN(parsed.getTime()) ? null : parsed
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
  const nextYear = last.month === 12 ? last.year + 1 : last.year
  const endDateExclusive = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

  return { startDate, endDateExclusive }
}

function getMonthYearFromValue(value) {
  if (!value) return null
  const text = String(value).trim()
  const isoMatch = text.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})/)
  if (isoMatch) return { year: Number(isoMatch[1]), month: Number(isoMatch[2]) }
  const parsed = parseDateSafe(text)
  if (!parsed) return null
  return { year: parsed.getFullYear(), month: parsed.getMonth() + 1 }
}

function normalizeAccount(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const compact = raw.replace(/\s+/g, '')
  if (/^[0-9]+$/.test(compact)) return compact.replace(/^0+/, '') || '0'
  return compact.toUpperCase()
}

function normalizeTierLabel(value) {
  const raw = String(value || '').trim().replace(/^[^A-Za-z0-9]+/, '').trim()
  const normalized = raw.toLowerCase()
  if (normalized === 'base' || normalized === 'base tier') return 'Base Tier'
  return raw || 'Unknown'
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function buildSelectionLabel(selectedQuarters, selectedMonths) {
  const quarterLabel = selectedQuarters.includes('All') ? 'AllQuarters' : selectedQuarters.join('-')
  const monthLabel = selectedMonths.includes('All')
    ? 'AllMonths'
    : selectedMonths.map(month => MONTH_LABELS[Number(month)] || month).join('-')
  return `${quarterLabel}_${monthLabel}`
}

function buildCodeAliases(value) {
  const raw = String(value || '').trim()
  if (!raw) return []

  const upper = raw.toUpperCase()
  const set = new Set([raw, upper, raw.toLowerCase()])

  if (/^[0-9]+$/.test(upper)) {
    const noLeading = upper.replace(/^0+/, '') || '0'
    set.add(noLeading)
    set.add(`D${noLeading.padStart(5, '0')}`)
    set.add(`D${noLeading.padStart(6, '0')}`)
  }

  if (/^D[0-9]+$/.test(upper)) {
    const numeric = upper.slice(1)
    set.add(numeric)
    set.add(numeric.replace(/^0+/, '') || '0')
  }

  return [...set]
}

function calculateSheetGoal(monthlyGoal, monthYearPairs) {
  const base = toNumber(monthlyGoal)
  if (!base || !monthYearPairs || monthYearPairs.length === 0) return 0
  return monthYearPairs.reduce((sum, pair) => sum + (base * getQuarterFactor(Number(pair.month))), 0)
}

function toAchievementStatus(percentage) {
  if (percentage >= 100) return 'EXCELLENT'
  if (percentage >= 80) return 'ON TRACK'
  if (percentage >= 60) return 'IMPROVING'
  return 'NOT RATED'
}

function buildPrefixOrFilter(column, codes) {
  const uniqueCodes = [...new Set((codes || []).map(code => String(code || '').trim()).filter(Boolean))]
  if (uniqueCodes.length === 0) return ''
  return uniqueCodes.map(code => `${column}.ilike.${code}%`).join(',')
}

function buildDgoBehaviorData(sheetData, dmiGoal, sgtData, warTaskData, dmiSiteData, monthYearPairs) {
  if (!sheetData || dmiGoal == null) return null

  const baseMonthlyGoal = toNumber(sheetData.baseMonthlyGoal)
  const behaviorGoal = Math.round(monthYearPairs.reduce((sum, pair) => {
    const adjustedMonthlyGoal = baseMonthlyGoal * getQuarterFactor(pair.month)
    const quarterlyEquivalentGoal = adjustedMonthlyGoal * 3
    const monthlyBehaviorGoal = quarterlyEquivalentGoal > 1800 ? adjustedMonthlyGoal * 0.2 : 120
    return sum + monthlyBehaviorGoal
  }, 0))

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

  const completionPercentage = Math.min((sgtPct * 40 / 100) + (dmiSitePct * 35 / 100) + (warPct * 25 / 100), 100)
  const achievedPoints = behaviorGoal > 0 ? Math.min(Math.round((completionPercentage / 100) * behaviorGoal), behaviorGoal) : 0

  return {
    achievedPoints,
    goal: behaviorGoal,
    completionPercentage: Number(completionPercentage.toFixed(1)),
    breakdown: [
      {
        label: 'S/G/T Coverage',
        weightage: 40,
        value: Math.round(sgtPct),
        visitGoal: sgtData.visitGoal,
        achievedVisits: sgtData.achievedVisits,
        sgtTierBreakdown: sgtData.sgtTierBreakdown || [],
      },
      {
        label: 'DMI+Site Visits',
        weightage: 35,
        value: Math.round(dmiSitePct),
        visitGoal: dmiSiteData.visitGoal,
        achievedVisits: dmiSiteData.achievedVisits,
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
        completed: warTaskData.completed,
      },
    ],
  }
}

function buildAsmBehaviorData(sheetData, dmiGoal, sgtData, warTaskData, buddyWorkingData, teamPerformanceData, monthYearPairs) {
  if (!sheetData || dmiGoal == null) return null

  const baseMonthlyGoal = toNumber(sheetData.baseMonthlyGoal)
  const behaviorGoal = Math.round(monthYearPairs.reduce((sum, pair) => {
    const adjustedMonthlyGoal = baseMonthlyGoal * getQuarterFactor(pair.month)
    const quarterlyEquivalentGoal = adjustedMonthlyGoal * 3
    const monthlyBehaviorGoal = quarterlyEquivalentGoal > 1800 ? adjustedMonthlyGoal * 0.2 : 120
    return sum + monthlyBehaviorGoal
  }, 0))

  const toPct = (achieved, goalValue) => {
    const achievedNumber = toNumber(achieved)
    const goalNumber = toNumber(goalValue)
    if (goalNumber === 0 && achievedNumber === 0) return 100
    if (goalNumber <= 0) return 0
    return Math.min((Math.min(achievedNumber, goalNumber) / goalNumber) * 100, 100)
  }

  const sgtPct = toPct(sgtData.achievedVisits, sgtData.visitGoal)
  const warPct = toPct(warTaskData.completed, warTaskData.assigned)
  const buddyPct = Number.isFinite(Number(buddyWorkingData.percentage))
    ? Math.max(0, Math.min(100, Number(buddyWorkingData.percentage)))
    : toPct(buddyWorkingData.completed, buddyWorkingData.assigned)
  const teamPct = toPct(teamPerformanceData.achievedPoints, teamPerformanceData.goalPoints)

  const completionPercentage = Math.min(
    (sgtPct * 30 / 100) +
    (warPct * 30 / 100) +
    (buddyPct * 20 / 100) +
    (teamPct * 20 / 100),
    100
  )

  const achievedPoints = behaviorGoal > 0 ? Math.min(Math.round((completionPercentage / 100) * behaviorGoal), behaviorGoal) : 0

  return {
    achievedPoints,
    goal: behaviorGoal,
    completionPercentage: Number(completionPercentage.toFixed(1)),
    breakdown: [
      {
        label: 'S/G/T Coverage',
        weightage: 30,
        value: Math.round(sgtPct),
        visitGoal: sgtData.visitGoal,
        achievedVisits: Math.min(toNumber(sgtData.achievedVisits), toNumber(sgtData.visitGoal)),
        sgtTierBreakdown: sgtData.sgtTierBreakdown || [],
      },
      {
        label: 'War Task Completion',
        weightage: 30,
        value: Math.round(warPct),
        assigned: warTaskData.assigned,
        completed: Math.min(toNumber(warTaskData.completed), toNumber(warTaskData.assigned)),
      },
      {
        label: 'Buddy Working',
        weightage: 20,
        value: Math.round(buddyPct),
        assigned: buddyWorkingData.assigned,
        completed: Math.min(toNumber(buddyWorkingData.completed), toNumber(buddyWorkingData.assigned)),
      },
      {
        label: 'Team Performance',
        weightage: 20,
        value: Math.round(teamPct),
        goalPoints: teamPerformanceData.goalPoints,
        achievedPoints: Math.min(toNumber(teamPerformanceData.achievedPoints), Math.max(toNumber(teamPerformanceData.goalPoints), toNumber(teamPerformanceData.achievedPoints))),
      },
    ],
  }
}

function getInsight(totalPercentage, totalGoalPoints) {
  if (totalPercentage === 0 && totalGoalPoints === 0) {
    return {
      title: 'Loading Data',
      message: 'ASM territory performance is being calculated. Refresh if needed.',
    }
  }
  if (totalPercentage >= 150) {
    return {
      title: 'Outstanding Territory',
      message: `Territory is running at ${totalPercentage}% with exceptional combined performance.`,
    }
  }
  if (totalPercentage >= 115) {
    return {
      title: 'Excellent Work',
      message: `Territory achieved ${totalPercentage}% of target across sheet, DMI, and behavior metrics.`,
    }
  }
  if (totalPercentage >= 100) {
    return {
      title: 'Target Met',
      message: `Territory is at ${totalPercentage}%. Focus on consistency across DGOs to maintain momentum.`,
    }
  }
  if (totalPercentage >= 80) {
    return {
      title: 'Almost There',
      message: `Territory is at ${totalPercentage}%. Focus on WAR closure, team performance, and SGT coverage.`,
    }
  }
  return {
    title: 'Needs Attention',
    message: `Territory is at ${totalPercentage}%. Start with sheet points and DGO behavior gaps.`,
  }
}

export default function AsmPerformanceDashboard() {
  const mountedRef = useRef(true)
  const auth = useContext(AuthContext)
  const { user: authUser, role } = auth || {}

  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [usersError, setUsersError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedFYStart, setSelectedFYStart] = useState(getCurrentFYStart())
  const [selectedQuarters, setSelectedQuarters] = useState([getCurrentQuarterKey()])
  const [selectedMonths, setSelectedMonths] = useState(['All'])
  const [selectedBranch, setSelectedBranch] = useState('All Branches')
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState(null)
  const [detailData, setDetailData] = useState(null)
  const [fromCache, setFromCache] = useState(false)
  const [allUsersExporting, setAllUsersExporting] = useState(false)
  const [allUsersExportProgress, setAllUsersExportProgress] = useState({ done: 0, total: 0 })
  const [adminUserBranchId, setAdminUserBranchId] = useState(null)
  const [adminAllowedBranchIds, setAdminAllowedBranchIds] = useState([])
  const [selectedDgoModal, setSelectedDgoModal] = useState(null)
  const [teamFilter, setTeamFilter] = useState('Team')

  const currentFYStart = getCurrentFYStart()
  const fyOptions = [
    { label: `FY ${currentFYStart}-${String(currentFYStart + 1).slice(-2)}`, start: currentFYStart },
    { label: `FY ${currentFYStart - 1}-${String(currentFYStart).slice(-2)}`, start: currentFYStart - 1 },
  ]

  const selectedUser = useMemo(
    () => users.find(user => user.id === selectedUserId) || null,
    [users, selectedUserId]
  )

  const availableMonths = useMemo(() => {
    if (selectedQuarters.includes('All')) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    return [...new Set(selectedQuarters.flatMap(quarter => QUARTER_MONTHS[quarter] || []))].sort((a, b) => a - b)
  }, [selectedQuarters])

  const monthYearPairs = useMemo(() => {
    const months = selectedMonths.includes('All') ? availableMonths : selectedMonths.map(Number)
    return months.map(month => ({
      month,
      year: month >= 4 ? selectedFYStart : selectedFYStart + 1,
    }))
  }, [selectedFYStart, selectedMonths, availableMonths])

  const branchOptions = useMemo(() => {
    let filteredUsers = users
    
    // If user is admin, only show branches they have access to
    if (role === 'admin') {
      const allowedBranchSet = new Set(adminAllowedBranchIds.length > 0 ? adminAllowedBranchIds : (adminUserBranchId ? [adminUserBranchId] : []))
      filteredUsers = users.filter(user => allowedBranchSet.has(user.branch_id))
    }
    
    const values = [...new Set(filteredUsers.map(user => String(user.branch_name || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
    
    // Keep "All Branches" for both super_admin and admin (admin is still restricted by allowed branches)
    return ['All Branches', ...values]
  }, [users, role, adminUserBranchId, adminAllowedBranchIds])

  const adminAllowedBranchSet = useMemo(() => new Set(adminAllowedBranchIds), [adminAllowedBranchIds])

  const filteredUsers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    return users.filter(user => {
      const matchesSearch = !query ||
        String(user.full_name || '').toLowerCase().includes(query) ||
        String(user.email || '').toLowerCase().includes(query) ||
        String(user.employee_id || '').toLowerCase().includes(query)

      if (role === 'admin') {
        const branchAllowed = adminAllowedBranchSet.size > 0
          ? adminAllowedBranchSet.has(user.branch_id)
          : adminUserBranchId === user.branch_id
        const matchesBranch = selectedBranch === 'All Branches' || String(user.branch_name || '').trim() === selectedBranch
        return matchesSearch && branchAllowed && matchesBranch
      }

      const matchesBranch = selectedBranch === 'All Branches' || String(user.branch_name || '').trim() === selectedBranch
      return matchesSearch && matchesBranch
    })
  }, [users, searchTerm, role, adminAllowedBranchSet, adminUserBranchId, selectedBranch])

  const loadUsers = useCallback(async () => {
    try {
      setUsersLoading(true)
      setUsersError(null)

      const { data } = await cachedFetch(
        'perf_dashboard_assigned_users_asm',
        async () => {
          const [assignedRes, branchesRes] = await Promise.all([
            supabase
              .from('user_performance_dashboard')
              .select('users:user_id(id, full_name, email, employee_id, branch_id, department_id)')
              .contains('access_type', ['ASM'])
              .order('assigned_at', { ascending: false }),
            supabase
              .from('branches')
              .select('id, branch_name'),
          ])

          if (assignedRes.error) throw assignedRes.error
          if (branchesRes.error) throw branchesRes.error

          const branchMap = new Map((branchesRes.data || []).map(branch => [branch.id, branch.branch_name]))

          const assignedUsers = (assignedRes.data || [])
            .map(row => row.users ? {
              ...row.users,
              branch_name: branchMap.get(row.users.branch_id) || '',
            } : null)
            .filter(Boolean)

          return Array.from(new Map(assignedUsers.map(user => [user.id, user])).values())
            .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')))
        },
        TTL.SHORT
      )

      if (!mountedRef.current) return

      setUsers(Array.isArray(data) ? data : [])
      if (Array.isArray(data) && data.length > 0) {
        const selectedStillExists = data.some(user => user.id === selectedUserId)
        if (!selectedUserId || !selectedStillExists) setSelectedUserId(data[0].id)
      } else {
        setSelectedUserId('')
      }
    } catch (error) {
      if (mountedRef.current) setUsersError(error.message)
    } finally {
      if (mountedRef.current) setUsersLoading(false)
    }
  }, [selectedUserId])

  const computeAsmPerformance = useCallback(async (employeeId, pairs, fyStart, asmUser, exportMode = false, teamFilterMode = 'Team') => {
    const exactEmployeeId = String(employeeId || '').trim()
    if (!exactEmployeeId) return null

    const sortedPairs = [...pairs].sort((a, b) => (a.year - b.year) || (a.month - b.month))
    const selectedDateWindow = buildDateWindow(sortedPairs)
    // Fiscal year window for tier upgrades (all upgrades count across entire year, not just selected months)
    const twoFyStart = `${fyStart - 1}-04-01`
    const twoFyEnd = `${fyStart + 1}-04-01`
    const now = new Date()
    const nowMonth = now.getMonth() + 1
    const currentFY = nowMonth >= 4 ? now.getFullYear() : now.getFullYear() - 1
    const previousFY = currentFY - 1
    const historyDateWindow = {
      startDate: `${previousFY}-04-01`,
      endDateExclusive: `${currentFY + 1}-04-01`,
    }

    const fetchTotalMonthlyGoal = async (codes) => {
      const uniqueCodes = [...new Set((codes || []).map(code => String(code || '').trim()).filter(Boolean))]
      if (uniqueCodes.length === 0) return 0
      const { data, error } = await supabase
        .from('goals_master')
        .select('employee_code, monthly_sheet_goal')
        .in('employee_code', uniqueCodes)
      if (error || !data) return 0
      return data.reduce((sum, row) => sum + toNumber(row.monthly_sheet_goal), 0)
    }

    const managerAliases = buildCodeAliases(exactEmployeeId)

    const [dgoUsersExact, dgoUsersFallback] = await Promise.all([
      supabase
        .from('users')
        .select('id, full_name, employee_id')
        .eq('reporting_manager', exactEmployeeId)
        .order('full_name', { ascending: true }),
      supabase
        .from('users')
        .select('id, full_name, employee_id')
        .in('reporting_manager', managerAliases)
        .order('full_name', { ascending: true }),
    ])

    const exactTeam = Array.isArray(dgoUsersExact.data) ? dgoUsersExact.data : []
    const fallbackTeam = Array.isArray(dgoUsersFallback.data) ? dgoUsersFallback.data : []
    let dgoTeam = exactTeam.length > 0 ? exactTeam : fallbackTeam

    // Apply team filter: if "My" is selected, exclude team members
    if (teamFilterMode === 'My') {
      dgoTeam = []
    }

    const baseCodes = [exactEmployeeId, ...dgoTeam.map(dgo => String(dgo.employee_id || '').trim())].filter(Boolean)
    const rawTeamIds = [...new Set(baseCodes)]
    const allCodes = [...new Set(baseCodes.flatMap(buildCodeAliases))]
    const asmGoalCodes = [exactEmployeeId]
    const selectedMonthKeySet = new Set(sortedPairs.map(pair => `${pair.month}_${pair.year}`))

    const fetchSheetPoints = async ({ codes, monthYearPairs, sheetGoalCodeList, dmiGoalCodeList, claimCodeExact = null }) => {
      if (!monthYearPairs || monthYearPairs.length === 0) return null

      const exactIds = claimCodeExact ? [String(claimCodeExact).trim()] : [...new Set((codes || []).map(code => String(code || '').trim()).filter(Boolean))]
      if (exactIds.length === 0) return null

      const chunkSize = 50
      const idChunks = []
      for (let index = 0; index < exactIds.length; index += chunkSize) {
        idChunks.push(exactIds.slice(index, index + chunkSize))
      }

      const fetchClaims = async (dateColumn) => {
        const collected = []
        for (const chunk of idChunks) {
          let from = 0
          while (true) {
            let query = supabase
              .from('influencer_claim_details')
              .select('claimed_qty_sheets, approved_qty, product_code, claim_date, status_date, mapped_isr_code, account_number')
              .in('mapped_isr_code', chunk)
              .order(dateColumn, { ascending: false })
              .order('mapped_isr_code', { ascending: true })
              .order('account_number', { ascending: true })
              .order('product_code', { ascending: true })
              .range(from, from + 999)

            if (selectedDateWindow.startDate && selectedDateWindow.endDateExclusive) {
              query = query.gte(dateColumn, selectedDateWindow.startDate).lt(dateColumn, selectedDateWindow.endDateExclusive)
            }

            const { data, error } = await query
            if (error || !data || data.length === 0) break
            collected.push(...data)
            if (data.length < 1000) break
            from += 1000
          }
        }
        return collected
      }

      const [claimedRows, statusRows, totalMonthlyGoal, sheetGoalMonthlyBase, pointsMasterRes] = await Promise.all([
        fetchClaims('claim_date'),
        fetchClaims('status_date'),
        fetchTotalMonthlyGoal(dmiGoalCodeList),
        fetchTotalMonthlyGoal(sheetGoalCodeList),
        supabase.from('sheet_point_master').select('brand_name, points_per_sheet'),
      ])

      const sheetRowsForCalc = statusRows.length > 0 ? statusRows : claimedRows
      const totalClaimedSheets = sheetRowsForCalc.reduce((sum, row) => sum + toNumber(row.claimed_qty_sheets), 0)
      const totalApprovedSheets = sheetRowsForCalc.reduce((sum, row) => sum + toNumber(row.approved_qty), 0)

      const productQtyMap = {}
      sheetRowsForCalc.forEach(row => {
        if (!row.product_code) return
        productQtyMap[row.product_code] = (productQtyMap[row.product_code] || 0) + toNumber(row.approved_qty)
      })

      const uniqueProductCodes = Object.keys(productQtyMap)
      const { data: brandMaster } = uniqueProductCodes.length > 0
        ? await supabase.from('brand_category_master').select('brand_name, brand_category').in('brand_name', uniqueProductCodes)
        : { data: [] }

      const productToCategoryMap = {}
      ;(brandMaster || []).forEach(item => {
        productToCategoryMap[item.brand_name] = item.brand_category
      })

      const categoryQtyMap = {}
      Object.entries(productQtyMap).forEach(([productCode, qty]) => {
        const category = productToCategoryMap[productCode] || 'Other'
        categoryQtyMap[category] = (categoryQtyMap[category] || 0) + qty
      })

      const categoryPointsMap = {}
      ;(pointsMasterRes.data || []).forEach(item => {
        categoryPointsMap[item.brand_name] = toNumber(item.points_per_sheet)
      })

      let totalPoints = 0
      const allCategories = [...new Set([...(pointsMasterRes.data || []).map(item => item.brand_name).filter(Boolean), ...Object.keys(categoryQtyMap)])]
      const brandBreakdown = allCategories.map(category => {
        const qty = toNumber(categoryQtyMap[category])
        const pointsPerSheet = toNumber(categoryPointsMap[category])
        const totalCategoryPoints = qty * pointsPerSheet
        totalPoints += totalCategoryPoints
        return {
          brandCategory: category,
          qty,
          pointsPerSheet,
          totalPoints: totalCategoryPoints,
        }
      }).sort((a, b) => {
        const indexA = BRAND_ORDER.indexOf(a.brandCategory)
        const indexB = BRAND_ORDER.indexOf(b.brandCategory)
        if (indexA !== -1 && indexB !== -1) return indexA - indexB
        if (indexA !== -1) return -1
        if (indexB !== -1) return 1
        return a.brandCategory.localeCompare(b.brandCategory)
      })

      const filteredGoal = calculateSheetGoal(sheetGoalMonthlyBase, monthYearPairs)
      const computedDmiGoal = monthYearPairs.reduce((sum, pair) => {
        const adjusted = totalMonthlyGoal * getQuarterFactor(pair.month)
        const rounded = Math.round(adjusted / 55)
        const floorValue = rounded > 8 ? rounded : 8
        return sum + (floorValue * 40)
      }, 0)

      return {
        sheetData: {
          achieved: totalApprovedSheets,
          claimed: totalClaimedSheets,
          approvedSummary: totalApprovedSheets,
          points: totalPoints,
          goal: filteredGoal,
          baseMonthlyGoal: totalMonthlyGoal,
          brandBreakdown,
        },
        dmiGoal: computedDmiGoal,
      }
    }

    const fetchDmiPoints = async ({ codes, monthYearPairs, claimCodeExact = null, disableAliasFallback = false }) => {
      if (!codes || codes.length === 0 || monthYearPairs.length === 0) {
        return { achievedPoints: 0, finalRawPoints: 0, newEnrolledPoints: 0, dmiUpdatePoints: 0, claimedDmiCount: 0, activeDmiCount: 0, newDmiCount: 0, tierUpgradedDmiCount: 0, averageSheetsPerDmi: 0, tierBreakdown: [] }
      }

      const pageSize = 1000
      const codeChunkSize = 20
      const normalizedCodes = [...new Set((codes || []).map(code => String(code || '').trim()).filter(Boolean))]
      const codeChunks = []
      for (let index = 0; index < normalizedCodes.length; index += codeChunkSize) {
        codeChunks.push(normalizedCodes.slice(index, index + codeChunkSize))
      }

      const allDmiClaims = []
      const allDmiClaimsHistory = []

      const fetchChunk = async (codeChunk, exactCode = null, dateWindow = selectedDateWindow, target = allDmiClaims) => {
        if (!exactCode && (!Array.isArray(codeChunk) || codeChunk.length === 0)) return

        let from = 0
        while (true) {
          let query = supabase
            .from('influencer_claim_details')
            .select('account_number, approved_qty, status_date')
            .order('status_date', { ascending: false })
            .order('account_number', { ascending: true })
            .range(from, from + pageSize - 1)

          if (dateWindow.startDate && dateWindow.endDateExclusive) {
            query = query.gte('status_date', dateWindow.startDate).lt('status_date', dateWindow.endDateExclusive)
          }

          if (exactCode) query = query.eq('mapped_isr_code', exactCode)
          else query = query.in('mapped_isr_code', codeChunk)

          const { data, error } = await query
          if (error || !data || data.length === 0) break
          target.push(...data)
          if (data.length < pageSize) break
          from += pageSize
        }
      }

      // Step 1: Fetch current period claims by mapped_isr_code
      if (claimCodeExact) {
        await fetchChunk([], claimCodeExact, selectedDateWindow, allDmiClaims)
        if (!disableAliasFallback && allDmiClaims.length === 0) {
          for (const chunk of codeChunks) await fetchChunk(chunk, null, selectedDateWindow, allDmiClaims)
        }
      } else {
        for (const chunk of codeChunks) {
          await fetchChunk(chunk, null, selectedDateWindow, allDmiClaims)
        }
      }

      // Step 2: Fetch history by account_number (matches PerformanceDashboard logic).
      // Accounts can have prior activity under ANY ISR code, not just this one.
      // Fetching by ISR code would miss prior history from other ISRs causing accounts
      // to be misclassified as "New DMI" instead of "Active DMI".
      const currentPeriodAccounts = [...new Set(allDmiClaims.map(c => normalizeAccount(c.account_number)).filter(Boolean))]
      if (currentPeriodAccounts.length > 0) {
        const accountHistoryChunkSize = 200
        for (let i = 0; i < currentPeriodAccounts.length; i += accountHistoryChunkSize) {
          const chunk = currentPeriodAccounts.slice(i, i + accountHistoryChunkSize)
          let from = 0
          while (true) {
            let query = supabase
              .from('influencer_claim_details')
              .select('account_number, approved_qty, status_date')
              .in('account_number', chunk)
              .order('status_date', { ascending: false })
              .order('account_number', { ascending: true })
              .range(from, from + pageSize - 1)
            if (historyDateWindow.startDate && historyDateWindow.endDateExclusive) {
              query = query.gte('status_date', historyDateWindow.startDate).lt('status_date', historyDateWindow.endDateExclusive)
            }
            const { data, error } = await query
            if (error || !data || data.length === 0) break
            allDmiClaimsHistory.push(...data)
            if (data.length < pageSize) break
            from += pageSize
          }
        }
      }

      const dmiClaims = allDmiClaims.filter(claim => {
        const parsed = getMonthYearFromValue(claim.status_date)
        return parsed ? selectedMonthKeySet.has(`${parsed.month}_${parsed.year}`) : false
      })

      const uniqueClaimAccounts = [...new Set(dmiClaims.map(claim => normalizeAccount(claim.account_number)).filter(Boolean))]
      
      const enrollmentRows = []
      if (uniqueClaimAccounts.length > 0) {
        const chunkSize = 80
        for (let index = 0; index < uniqueClaimAccounts.length; index += chunkSize) {
          const chunk = uniqueClaimAccounts.slice(index, index + chunkSize)
          const rows = await fetchPaged((from, to) =>
            supabase
              .from('m_enrollment_details')
              .select('account_no, tier, created_at')
              .in('account_no', chunk)
              .gte('created_at', selectedDateWindow.startDate)
              .lt('created_at', selectedDateWindow.endDateExclusive)
              .order('created_at', { ascending: false })
              .order('account_no', { ascending: true })
              .order('tier', { ascending: true })
              .range(from, to)
          , 300)
          enrollmentRows.push(...rows)
        }
      }

      const enrollTierByAccountMonth = {}
      enrollmentRows.forEach(row => {
        const account = normalizeAccount(row.account_no)
        const parsed = getMonthYearFromValue(row.created_at)
        if (!account || !parsed) return
        const key = `${account}_${parsed.month}_${parsed.year}`
        const time = parseDateSafe(row.created_at)?.getTime() || 0
        if (!enrollTierByAccountMonth[key] || time > enrollTierByAccountMonth[key].createdAtMs) {
          enrollTierByAccountMonth[key] = { tier: row.tier, createdAtMs: time }
        }
      })

      const requiredFallbackAccounts = [...new Set(dmiClaims
        .map(claim => {
          const account = normalizeAccount(claim.account_number)
          const parsed = getMonthYearFromValue(claim.status_date)
          if (!account || !parsed) return ''
          const key = `${account}_${parsed.month}_${parsed.year}`
          return enrollTierByAccountMonth[key] ? '' : account
        })
        .filter(Boolean))]

      const influencerEnrollTier = {}
      if (requiredFallbackAccounts.length > 0) {
        const chunkSize = 100
        for (let index = 0; index < requiredFallbackAccounts.length; index += chunkSize) {
          const chunk = requiredFallbackAccounts.slice(index, index + chunkSize)
          const rows = await fetchPaged((from, to) =>
            supabase
              .from('influencer_enrollment_details')
              .select('influencer_id, influencer_tier, enrollment_date')
              .in('influencer_id', chunk)
              .order('enrollment_date', { ascending: false })
              .order('influencer_id', { ascending: true })
              .order('influencer_tier', { ascending: true })
              .range(from, to)
          , 300)
          rows.forEach(row => {
            const account = normalizeAccount(row.influencer_id)
            if (!account || !row.influencer_tier) return
            const time = parseDateSafe(row.enrollment_date)?.getTime() || 0
            if (!influencerEnrollTier[account] || time > influencerEnrollTier[account].enrollmentTimeMs) {
              influencerEnrollTier[account] = { tier: row.influencer_tier, enrollmentTimeMs: time }
            }
          })
        }
      }

      const claimsByMonth = {}
      dmiClaims.forEach(claim => {
        const parsed = getMonthYearFromValue(claim.status_date)
        if (!parsed) return
        const key = `${parsed.month}_${parsed.year}`
        if (!selectedMonthKeySet.has(key)) return
        if (!claimsByMonth[key]) claimsByMonth[key] = []
        claimsByMonth[key].push(claim)
      })

      const approvedSheetsByAccountMonth = {}
      allDmiClaimsHistory.forEach(claim => {
        const account = normalizeAccount(claim.account_number)
        const parsed = getMonthYearFromValue(claim.status_date)
        if (!account || !parsed) return
        const key = `${parsed.month}_${parsed.year}`
        if (!approvedSheetsByAccountMonth[account]) approvedSheetsByAccountMonth[account] = {}
        approvedSheetsByAccountMonth[account][key] = (approvedSheetsByAccountMonth[account][key] || 0) + toNumber(claim.approved_qty)
      })

      const historyMonthIndexes = new Set()
      for (let month = 4; month <= 12; month += 1) historyMonthIndexes.add(monthYearIndex(month, previousFY))
      for (let month = 1; month <= 3; month += 1) historyMonthIndexes.add(monthYearIndex(month, previousFY + 1))
      for (let month = 4; month <= 12; month += 1) historyMonthIndexes.add(monthYearIndex(month, currentFY))
      for (let month = 1; month <= 3; month += 1) historyMonthIndexes.add(monthYearIndex(month, currentFY + 1))

      const newDmiByMonth = {}
      const activeByMonth = {}
      let newDmiCount = 0

      Object.keys(claimsByMonth).forEach(key => {
        const [monthText, yearText] = key.split('_')
        const month = Number(monthText)
        const year = Number(yearText)
        const currentIndex = monthYearIndex(month, year)
        newDmiByMonth[key] = []
        activeByMonth[key] = []

        const accountSheets = {}
        claimsByMonth[key].forEach(claim => {
          const account = normalizeAccount(claim.account_number)
          if (!account) return
          accountSheets[account] = (accountSheets[account] || 0) + toNumber(claim.approved_qty)
        })

        Object.entries(accountSheets).forEach(([account, sheets]) => {
          if (sheets < 10) return
          const history = approvedSheetsByAccountMonth[account] || {}
          const hasPrior = Object.keys(history).some(historyKey => {
            const [historyMonth, historyYear] = historyKey.split('_').map(Number)
            const historyIndex = monthYearIndex(historyMonth, historyYear)
            return historyIndex < currentIndex && historyMonthIndexes.has(historyIndex) && toNumber(history[historyKey]) >= 10
          })

          if (hasPrior) activeByMonth[key].push(account)
          else {
            newDmiByMonth[key].push(account)
            newDmiCount += 1
          }
        })
      })

      const uniqueTiers = [...new Set(['Titanium', 'Gold', 'Silver', 'Bronze', 'Base Tier', ...Object.values(enrollTierByAccountMonth).map(item => normalizeTierLabel(item.tier)).filter(Boolean)])]
      const { data: tierPointsMaster } = uniqueTiers.length > 0
        ? await supabase.from('dmi_raw_points_master').select('tier, points_per_dmi').in('tier', uniqueTiers)
        : { data: [] }

      const tierPointsMap = {}
      ;(tierPointsMaster || []).forEach(row => {
        tierPointsMap[normalizeTierLabel(row.tier)] = toNumber(row.points_per_dmi)
      })

      const tierCountMap = {}
      const activeDmiEntries = []
      sortedPairs.forEach(pair => {
        const key = `${pair.month}_${pair.year}`
        const accountSheets = {}
        ;(claimsByMonth[key] || []).forEach(claim => {
          const account = normalizeAccount(claim.account_number)
          if (!account) return
          accountSheets[account] = (accountSheets[account] || 0) + toNumber(claim.approved_qty)
        })

        ;(activeByMonth[key] || []).forEach(account => {
          const lookupKey = `${account}_${key}`
          const tier = enrollTierByAccountMonth[lookupKey]?.tier || influencerEnrollTier[account]?.tier || 'Unknown'
          activeDmiEntries.push({ account, month: pair.month, year: pair.year, tier, totalSheets: accountSheets[account] || 0 })
          const normalizedTier = normalizeTierLabel(tier)
          tierCountMap[normalizedTier] = (tierCountMap[normalizedTier] || 0) + 1
        })
      })

      Object.keys(tierPointsMap).forEach(tier => {
        if (tierCountMap[tier] == null) tierCountMap[tier] = 0
      })

      const totalRawPoints = Object.entries(tierCountMap)
        .reduce((sum, [tier, count]) => sum + (toNumber(count) * toNumber(tierPointsMap[tier])), 0)

      const activeDmiCount = activeDmiEntries.length  // sum across all selected months (not unique accounts)
      const claimedDmiCount = [...new Set(dmiClaims.map(claim => normalizeAccount(claim.account_number)).filter(Boolean))].length
      const achievedSheetsInPeriod = dmiClaims.reduce((sum, claim) => sum + toNumber(claim.approved_qty), 0)
      const averageSheetsPerDmi = activeDmiCount + newDmiCount > 0
        ? Number((achievedSheetsInPeriod / (activeDmiCount + newDmiCount)).toFixed(1))
        : 0
      const rawMultiplier = averageSheetsPerDmi < 15 ? 0.15 : averageSheetsPerDmi < 40 ? 0.5 : 1
      const finalRawPoints = Math.round(totalRawPoints * rawMultiplier)

      const upgradeFilter = claimCodeExact
        ? ''
        : buildPrefixOrFilter('mapped_isr', codes)
      const allUpgradeRecords = claimCodeExact || upgradeFilter
        ? await fetchPaged((from, to) => {
            let query = supabase
              .from('tier_upgrade_performance_report')
              .select('mapped_isr, change_type, previous_tier, new_tier, tier_change_date')
              .order('tier_change_date', { ascending: false })
              .order('mapped_isr', { ascending: true })
              .order('previous_tier', { ascending: true })
              .range(from, to)
            if (claimCodeExact) query = query.ilike('mapped_isr', `${claimCodeExact}%`)
            else query = query.or(upgradeFilter)
            return query
          })
        : []

      // Filter tier upgrades by selected fiscal year only
      const fyStart_dt = new Date(`${fyStart}-04-01`)
      const fyEnd_dt = new Date(`${fyStart + 1}-04-01`)
      console.log('🔍 ASM Tier Upgrade Debug:', { fyStart, fyStart_dt, fyEnd_dt })
      console.log('📋 All tier upgrade rows received:', allUpgradeRecords.length)
      const parseTierChangeDate = (dateStr) => {
        if (!dateStr) return null
        try {
          const date = new Date(dateStr)
          return isNaN(date.getTime()) ? null : date
        } catch (e) {
          return null
        }
      }
      const tierUpgradeRecordsInFY = allUpgradeRecords.filter(r => {
        const changeDate = parseTierChangeDate(r.tier_change_date)
        if (!changeDate) return false
        return changeDate >= fyStart_dt && changeDate < fyEnd_dt
      })
      console.log('📅 Tier upgrades in FY window:', tierUpgradeRecordsInFY.length)

      // Helper to match tier upgrade date against selected months
      const matchesSelectedMonthsForTier = (dateStr) => {
        const parsed = getMonthYearFromValue(dateStr)
        if (!parsed) return false
        return selectedMonthKeySet.has(`${parsed.month}_${parsed.year}`)
      }

      const tierMapUpgrade = {
        'Base Tier': 1,
        'Bronze': 2,
        'Silver': 3,
        'Gold': 4,
        'Titanium': 5,
      }
      const normalizeTierForUpgrade = (value) => normalizeTierLabel(value)

      const qualifyingUpgrades = tierUpgradeRecordsInFY.filter(record => {
        // NOTE: Tier upgrades should include ALL upgrades for the entire fiscal year,
        // regardless of the currently selected month filter. Users should see all achievements.
        if (String(record.change_type || '').trim() !== 'Tier Upgrade') return false

        const previousTier = normalizeTierForUpgrade(record.previous_tier)
        const newTier = normalizeTierForUpgrade(record.new_tier)
        const previousTierValue = tierMapUpgrade[previousTier]
        const newTierValue = tierMapUpgrade[newTier]
        if (previousTierValue == null || newTierValue == null) return false

        // Apply month/quarter filter to tier upgrades
        const matchesSelectedMonths = matchesSelectedMonthsForTier(record.tier_change_date)
        console.log('🔍 ASM Month filter for upgrade:', { date: record.tier_change_date, matches: matchesSelectedMonths })

        return ['Silver', 'Gold', 'Titanium'].includes(newTier) && newTierValue > previousTierValue && matchesSelectedMonths
      })
      console.log('✅ ASM Qualifying upgrades:', qualifyingUpgrades.length, qualifyingUpgrades)

      const tierBreakdown = Object.entries(tierCountMap)
        .map(([tier, count]) => ({
          tier,
          activeDmiCount: count,
          pointsPerDmi: toNumber(tierPointsMap[tier]),
        }))
        .sort((a, b) => {
          const indexA = TIER_ORDER.indexOf(a.tier)
          const indexB = TIER_ORDER.indexOf(b.tier)
          if (indexA !== -1 && indexB !== -1) return indexA - indexB
          if (indexA !== -1) return -1
          if (indexB !== -1) return 1
          return a.tier.localeCompare(b.tier)
        })

      const newEnrolledPoints = newDmiCount * 10
      const dmiUpdatePoints = qualifyingUpgrades.reduce((sum, row) => {
        const previousTierValue = tierMapUpgrade[normalizeTierForUpgrade(row.previous_tier)]
        const newTierValue = tierMapUpgrade[normalizeTierForUpgrade(row.new_tier)]
        const points = (newTierValue - previousTierValue) * 25
        console.log('💰 ASM Single upgrade:', { previous: row.previous_tier, new: row.new_tier, previousValue: previousTierValue, newValue: newTierValue, points })
        return sum + points
      }, 0)
      console.log('💰 ASM Total DMI Update Points:', dmiUpdatePoints)

      return {
        achievedPoints: finalRawPoints + newEnrolledPoints + dmiUpdatePoints,
        finalRawPoints,
        newEnrolledPoints,
        dmiUpdatePoints,
        claimedDmiCount,
        activeDmiCount,
        newDmiCount,
        tierUpgradedDmiCount: qualifyingUpgrades.length,
        averageSheetsPerDmi,
        tierBreakdown,
      }
    }

    const fetchSgtCoverage = async ({ codes, monthYearPairs }) => {
      if (!codes || codes.length === 0 || !monthYearPairs || monthYearPairs.length === 0) {
        return { visitGoal: 0, achievedVisits: 0, sgtTierBreakdown: [] }
      }

      // Raw codes (e.g. ['D10599', 'D10361']) — no alias expansion needed; ilike handles prefixes
      const rawCodes = [...new Set((codes || []).map(c => String(c || '').trim()).filter(Boolean))]
      if (rawCodes.length === 0) return { visitGoal: 0, achievedVisits: 0, sgtTierBreakdown: [] }

      // ── STEP 1: Fetch all S/G/T enrollments for these ISR codes ──────────────
      // Use the END of the selected date window so we reflect the enrollment state
      // AS OF the selected month (excludes future re-assignments).
      const enrollmentCutoff = selectedDateWindow.endDateExclusive || null
      const isrOrFilter = buildPrefixOrFilter('mapped_isr', rawCodes)

      const candidateEnrollments = isrOrFilter
        ? await fetchPaged((from, to) => {
            let query = supabase
              .from('m_enrollment_details')
              .select('account_no, tier, is_active, created_at, mapped_isr')
              .in('tier', ['Silver', 'Gold', 'Titanium'])
              .order('created_at', { ascending: false, nullsFirst: false })
              .order('account_no', { ascending: true })
              .range(from, to)
            if (enrollmentCutoff) query = query.lt('created_at', enrollmentCutoff)
            return query.or(isrOrFilter)
          })
        : []

      // ── STEP 2: For candidate accounts, fetch ALL enrollment records (any ISR) ─
      // This lets us find the globally-latest enrollment per account as of cutoff,
      // so we can confirm the account still belongs to one of our ISR codes.
      const candidateAccountNos = [...new Set(candidateEnrollments.map(r => String(r.account_no || '').trim()).filter(Boolean))]
      const CHUNK = 100
      const verifyEnrollments = candidateAccountNos.length > 0
        ? (await Promise.all(
            Array.from({ length: Math.ceil(candidateAccountNos.length / CHUNK) }, (_, i) =>
              candidateAccountNos.slice(i * CHUNK, (i + 1) * CHUNK)
            ).map(chunk =>
              fetchPaged((from, to) => {
                let query = supabase
                  .from('m_enrollment_details')
                  .select('account_no, tier, is_active, created_at, mapped_isr')
                  .in('account_no', chunk)
                  .in('tier', ['Silver', 'Gold', 'Titanium'])
                  .order('created_at', { ascending: false, nullsFirst: false })
                  .order('account_no', { ascending: true })
                  .range(from, to)
                if (enrollmentCutoff) query = query.lt('created_at', enrollmentCutoff)
                return query
              })
            )
          )).flat()
        : []

      // ── STEP 3: Get globally-latest enrollment per account (as of cutoff) ────
      const latestPerAccount = {}
      verifyEnrollments.forEach(row => {
        const account = String(row.account_no || '').trim()
        if (!account || latestPerAccount[account]) return  // sorted DESC → first seen = latest
        latestPerAccount[account] = row
      })

      // ── STEP 4: Build active tier map — only accounts whose latest enrollment ─
      // is mapped to one of our ISR codes AND is active
      const isrPrefixesLower = rawCodes.map(c => c.toLowerCase())
      const activeTierMap = {}
      Object.entries(latestPerAccount).forEach(([account, row]) => {
        const isActive = ['true', 't', '1', 'yes', 'y'].includes(String(row.is_active ?? '').trim().toLowerCase())
        if (!isActive) return
        const isr = String(row.mapped_isr || '').trim().toLowerCase()
        if (!isrPrefixesLower.some(prefix => isr.startsWith(prefix))) return
        activeTierMap[account] = row.tier
      })

      // ── STEP 5: Compute goal (1 visit/month per active S/G/T account) ────────
      const tierMonthlyGoalMap = { Silver: 0, Gold: 0, Titanium: 0 }
      let monthlyVisitGoal = 0
      Object.values(activeTierMap).forEach(tier => {
        if (tierMonthlyGoalMap[tier] !== undefined) {
          tierMonthlyGoalMap[tier] += 1
          monthlyVisitGoal += 1
        }
      })

      // ── STEP 6: Fetch visits for these accounts in the selected date window ──
      const visitIsrOrFilter = buildPrefixOrFilter('mapped_isr_code', rawCodes)
      const allVisits = visitIsrOrFilter
        ? await fetchPaged((from, to) => {
            let query = supabase
              .from('influencer_visit_reports')
              .select('influencer_code, visit_date, influencer_tier')
              .in('influencer_tier', ['Silver', 'Gold', 'Titanium'])
              .order('visit_date', { ascending: false })
              .order('influencer_code', { ascending: true })
              .range(from, to)
            if (selectedDateWindow.startDate && selectedDateWindow.endDateExclusive) {
              query = query.gte('visit_date', selectedDateWindow.startDate).lt('visit_date', selectedDateWindow.endDateExclusive)
            }
            return query.or(visitIsrOrFilter)
          })
        : []

      const activeSgtAccounts = new Set(Object.keys(activeTierMap))
      const filteredVisits = allVisits.filter(visit => {
        if (!visit.visit_date || !activeSgtAccounts.has(String(visit.influencer_code || ''))) return false
        const parsed = getMonthYearFromValue(visit.visit_date)
        return parsed ? selectedMonthKeySet.has(`${parsed.month}_${parsed.year}`) : false
      })

      // Deduplicate by day, then cap at 1 visit per account per month
      const uniqueDayVisits = new Map()
      filteredVisits.forEach(visit => {
        const date = parseDateSafe(visit.visit_date)
        if (!date) return
        const key = `${visit.influencer_code}_${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
        if (!uniqueDayVisits.has(key)) uniqueDayVisits.set(key, visit)
      })

      const monthlyVisitCounts = {}
      Array.from(uniqueDayVisits.values()).forEach(visit => {
        const date = parseDateSafe(visit.visit_date)
        if (!date) return
        const account = String(visit.influencer_code || '')
        const tier = activeTierMap[account]
        if (!tier) return
        const key = `${account}_${date.getMonth() + 1}_${date.getFullYear()}`
        if (!monthlyVisitCounts[key]) monthlyVisitCounts[key] = { count: 0, tier }
        monthlyVisitCounts[key].count += 1
      })

      let totalAchievedVisits = 0
      const tierAchievedMap = { Silver: 0, Gold: 0, Titanium: 0 }
      Object.values(monthlyVisitCounts).forEach(({ count, tier }) => {
        const capped = Math.min(count, 1)
        totalAchievedVisits += capped
        if (tierAchievedMap[tier] !== undefined) tierAchievedMap[tier] += capped
      })

      return {
        visitGoal: monthlyVisitGoal * monthYearPairs.length,
        achievedVisits: totalAchievedVisits,
        sgtTierBreakdown: ['Silver', 'Gold', 'Titanium'].map(tier => ({
          tier,
          achievedVisits: tierAchievedMap[tier] || 0,
          goalVisits: (tierMonthlyGoalMap[tier] || 0) * monthYearPairs.length,
        })),
      }
    }

    const fetchWarTask = async ({ codes, monthYearPairs, strictEmployeeCode = null }) => {
      if (!codes || codes.length === 0 || !monthYearPairs || monthYearPairs.length === 0) return { assigned: 0, completed: 0 }

      const exactCode = String(strictEmployeeCode || '').trim()
      const normalizedCodes = [...new Set((codes || []).map(code => String(code || '').trim()).filter(Boolean))]
      const codeFilter = buildPrefixOrFilter('mapped_isr_code', normalizedCodes)
      const allTasks = await fetchPaged((from, to) => {
        let query = supabase
          .from('telecalling_influencer_wartask')
          .select('task_date, status_as_on_today, status_change_date')
          .order('task_date', { ascending: false })
          .order('status_change_date', { ascending: false })
          .order('status_as_on_today', { ascending: true })
          .range(from, to)
        if (exactCode) query = query.ilike('mapped_isr_code', `${exactCode}%`)
        else if (codeFilter) query = query.or(codeFilter)
        return query
      })

      const filtered = allTasks.filter(task => {
        const parsed = getMonthYearFromValue(task.task_date)
        return parsed ? selectedMonthKeySet.has(`${parsed.month}_${parsed.year}`) : false
      })

      const completed = filtered.filter(task => {
        if (normalizeStatus(task.status_as_on_today) !== 'closure') return false
        const taskDate = parseDateSafe(task.task_date)
        const changeDate = parseDateSafe(task.status_change_date)
        if (!taskDate || !changeDate) return false
        const rangeStart = new Date(taskDate.getFullYear(), taskDate.getMonth(), 1, 0, 0, 0, 0)
        const rangeEnd = new Date(taskDate.getFullYear(), taskDate.getMonth() + 1, 7, 23, 59, 59, 999)
        return changeDate >= rangeStart && changeDate <= rangeEnd
      }).length

      return { assigned: filtered.length, completed }
    }

    const fetchBuddyWorking = async () => ({ assigned: 0, completed: 0, percentage: 100 })

    const fetchDmiSiteVisits = async ({ codes, monthYearPairs, strictEmployeeCode = null }) => {
      if (!codes || codes.length === 0 || !monthYearPairs || monthYearPairs.length === 0) {
        return { visitGoal: 0, achievedVisits: 0, dmiVisits: 0, newDmiVisits: 0, existingDmiVisits: 0, siteVisits: 0, newSiteVisits: 0, existingSiteVisits: 0 }
      }

      const exactCode = String(strictEmployeeCode || '').trim()
      const normalizedCodes = [...new Set((codes || []).map(code => String(code || '').trim()).filter(Boolean))]
      const applyFilter = (query, column) => {
        if (exactCode) {
          if (column === 'employee_code' || column === 'task_created_by_dso_code' || column === 'emp_login' || column === 'enrolled_by_dso_code') {
            return query.eq(column, exactCode)
          }
          return query.ilike(column, `${exactCode}%`)
        }
        if (['employee_code', 'task_created_by_dso_code', 'emp_login', 'enrolled_by_dso_code'].includes(column)) {
          return normalizedCodes.length > 0 ? query.in(column, normalizedCodes) : query
        }
        const filter = buildPrefixOrFilter(column, normalizedCodes)
        return filter ? query.or(filter) : query
      }

      const attendanceRows = await fetchPaged((from, to) => {
        let query = supabase
          .from('monthly_attendance_report')
          .select('attendance_date, attendance_status')
          .order('attendance_date', { ascending: false })
          .order('attendance_status', { ascending: true })
          .range(from, to)
        query = applyFilter(query, 'employee_code')
        if (selectedDateWindow.startDate && selectedDateWindow.endDateExclusive) {
          query = query.gte('attendance_date', selectedDateWindow.startDate).lt('attendance_date', selectedDateWindow.endDateExclusive)
        }
        return query
      })

      const influencerVisitRows = await fetchPaged((from, to) => {
        let query = supabase
          .from('influencer_visit_reports')
          .select('influencer_code, visit_date')
          .order('visit_date', { ascending: false })
          .order('influencer_code', { ascending: true })
          .range(from, to)
        query = exactCode ? query.eq('emp_login', exactCode) : query.in('emp_login', normalizedCodes)
        if (selectedDateWindow.startDate && selectedDateWindow.endDateExclusive) {
          query = query.gte('visit_date', selectedDateWindow.startDate).lt('visit_date', selectedDateWindow.endDateExclusive)
        }
        return query
      })

      const enrollmentRows = await fetchPaged((from, to) => {
        let query = supabase
          .from('influencer_enrollment_details')
          .select('influencer_id, enrollment_date')
          .order('enrollment_date', { ascending: false })
          .order('influencer_id', { ascending: true })
          .range(from, to)
        query = applyFilter(query, 'enrolled_by_dso_code')
        if (selectedDateWindow.startDate && selectedDateWindow.endDateExclusive) {
          query = query.gte('enrollment_date', selectedDateWindow.startDate).lt('enrollment_date', selectedDateWindow.endDateExclusive)
        }
        return query
      })

      const leadDetailsRows = await fetchPaged((from, to) => {
        let query = supabase
          .from('lead_details_reports')
          .select('lead_created_by, created_date, lead_code')
          .order('created_date', { ascending: false })
          .order('lead_code', { ascending: true })
          .range(from, to)
        query = applyFilter(query, 'lead_created_by')
        if (selectedDateWindow.startDate && selectedDateWindow.endDateExclusive) {
          query = query.gte('created_date', selectedDateWindow.startDate).lt('created_date', selectedDateWindow.endDateExclusive)
        }
        return query
      })

      const leadTaskRows = await fetchPaged((from, to) => {
        let query = supabase
          .from('lead_task_reports')
          .select('task_created_on, lead_id')
          .order('task_created_on', { ascending: false })
          .order('lead_id', { ascending: true })
          .range(from, to)
        query = applyFilter(query, 'task_created_by_dso_code')
        if (selectedDateWindow.startDate && selectedDateWindow.endDateExclusive) {
          query = query.gte('task_created_on', selectedDateWindow.startDate).lt('task_created_on', selectedDateWindow.endDateExclusive)
        }
        return query
      })

      const workingDays = attendanceRows.filter(row => {
        const parsed = getMonthYearFromValue(row.attendance_date)
        const status = String(row.attendance_status || '').trim()
        return parsed && selectedMonthKeySet.has(`${parsed.month}_${parsed.year}`) && (status === 'P | P' || status === '- | -')
      }).length

      const visitKey = (id, date) => `${id}_${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
      const existingDmiVisitSet = new Set()
      influencerVisitRows.forEach(row => {
        const date = parseDateSafe(row.visit_date)
        if (!date) return
        const parsed = getMonthYearFromValue(row.visit_date)
        if (!parsed || !selectedMonthKeySet.has(`${parsed.month}_${parsed.year}`)) return
        existingDmiVisitSet.add(visitKey(row.influencer_code, date))
      })

      const newDmiVisitSet = new Set()
      enrollmentRows.forEach(row => {
        const date = parseDateSafe(row.enrollment_date)
        if (!date) return
        const parsed = getMonthYearFromValue(row.enrollment_date)
        if (!parsed || !selectedMonthKeySet.has(`${parsed.month}_${parsed.year}`)) return
        newDmiVisitSet.add(visitKey(row.influencer_id, date))
      })

      const newSiteSet = new Set()
      leadDetailsRows.forEach(row => {
        const date = parseDateSafe(row.created_date)
        if (!date || !row.lead_code) return
        const parsed = getMonthYearFromValue(row.created_date)
        if (!parsed || !selectedMonthKeySet.has(`${parsed.month}_${parsed.year}`)) return
        newSiteSet.add(visitKey(row.lead_code, date))
      })

      const leadIds = [...new Set(leadTaskRows.map(row => row.lead_id).filter(Boolean))]
      const leadCreatedMetaMap = new Map()
      if (leadIds.length > 0) {
        const chunkSize = 200
        for (let index = 0; index < leadIds.length; index += chunkSize) {
          const chunk = leadIds.slice(index, index + chunkSize)
          const { data } = await supabase
            .from('lead_details_reports')
            .select('lead_code, created_date')
            .in('lead_code', chunk)
          ;(data || []).forEach(row => {
            if (!row.lead_code) return
            const leadCode = String(row.lead_code).trim()
            if (!leadCreatedMetaMap.has(leadCode)) leadCreatedMetaMap.set(leadCode, { dates: new Set(), hasNullDate: false })
            const meta = leadCreatedMetaMap.get(leadCode)
            if (!row.created_date) meta.hasNullDate = true
            else meta.dates.add(String(row.created_date).slice(0, 10))
          })
        }
      }

      // Existing Site Visits: Count all lead tasks unique per lead per day from lead_task_reports
      const existingSiteSet = new Set()
      leadTaskRows.forEach((row, index) => {
        const date = parseDateSafe(row.task_created_on)
        if (!date) return
        const parsed = getMonthYearFromValue(row.task_created_on)
        if (!parsed || !selectedMonthKeySet.has(`${parsed.month}_${parsed.year}`)) return
        const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

        if (row.lead_id) existingSiteSet.add(visitKey(row.lead_id, date))
        else existingSiteSet.add(`null-lead-${index}_${dateKey}`)
      })

      const existingDmiVisits = existingDmiVisitSet.size
      const newDmiVisits = newDmiVisitSet.size
      const dmiVisits = existingDmiVisits + newDmiVisits
      const newSiteVisits = newSiteSet.size
      const existingSiteVisits = existingSiteSet.size
      const siteVisits = newSiteVisits + existingSiteVisits

      return {
        visitGoal: Math.max(workingDays - 1, 0) * 10,
        achievedVisits: dmiVisits + siteVisits,
        dmiVisits,
        newDmiVisits,
        existingDmiVisits,
        siteVisits,
        newSiteVisits,
        existingSiteVisits,
      }
    }

    const sgtCoverageCodes = teamFilterMode === 'Team' ? rawTeamIds : [exactEmployeeId]

    const [sheetResult, dmiData, sgtData, warTaskData, buddyWorkingData, dmiSiteData] = await Promise.all([
      fetchSheetPoints({
        codes: rawTeamIds,
        monthYearPairs: sortedPairs,
        sheetGoalCodeList: asmGoalCodes,
        dmiGoalCodeList: asmGoalCodes,
      }),
      fetchDmiPoints({ codes: allCodes, monthYearPairs: sortedPairs }),
      fetchSgtCoverage({ codes: sgtCoverageCodes, monthYearPairs: sortedPairs }),
      fetchWarTask({ codes: allCodes, monthYearPairs: sortedPairs }),
      fetchBuddyWorking(),
      fetchDmiSiteVisits({ codes: allCodes, monthYearPairs: sortedPairs }),
    ])

    const sheetData = sheetResult?.sheetData || {
      achieved: 0,
      claimed: 0,
      approvedSummary: 0,
      points: 0,
      goal: 0,
      baseMonthlyGoal: 0,
      brandBreakdown: [],
    }
    const dmiGoal = toNumber(sheetResult?.dmiGoal)

    const dgoSnapshotRows = await Promise.all(dgoTeam.map(async (dgo, index) => {
      const dgoEmployeeId = String(dgo.employee_id || '').trim()
      if (!dgoEmployeeId) {
        return {
          id: dgo.id || `dgo-${index}`,
          name: dgo.full_name || `DGO ${index + 1}`,
          employeeId: '',
          earned: 0,
          goal: 0,
          pct: 0,
          status: 'NOT RATED',
          sheetPoints: 0,
          sheetGoal: 0,
          dmiPoints: 0,
          dmiGoal: 0,
          behaviorPoints: 0,
          behaviorGoal: 0,
          brandBreakdown: [],
          tierBreakdown: [],
          behaviorBreakdown: [],
        }
      }

      const dgoCodes = buildCodeAliases(dgoEmployeeId)
      const [dgoSheetResult, dgoDmiData, dgoSgtData, dgoWarTaskData, dgoDmiSiteData] = await Promise.all([
        fetchSheetPoints({
          codes: [dgoEmployeeId],
          monthYearPairs: sortedPairs,
          sheetGoalCodeList: [dgoEmployeeId],
          dmiGoalCodeList: [dgoEmployeeId],
          claimCodeExact: dgoEmployeeId,
        }),
        fetchDmiPoints({ codes: dgoCodes, monthYearPairs: sortedPairs, claimCodeExact: dgoEmployeeId }),
        fetchSgtCoverage({ codes: dgoCodes, monthYearPairs: sortedPairs, strictEmployeeCode: dgoEmployeeId }),
        fetchWarTask({ codes: dgoCodes, monthYearPairs: sortedPairs, strictEmployeeCode: dgoEmployeeId }),
        fetchDmiSiteVisits({ codes: dgoCodes, monthYearPairs: sortedPairs }),
      ])

      const dgoSheetData = dgoSheetResult?.sheetData || { achieved: 0, claimed: 0, approvedSummary: 0, points: 0, goal: 0, baseMonthlyGoal: 0, brandBreakdown: [] }
      const dgoDmiGoal = toNumber(dgoSheetResult?.dmiGoal)
      const dgoBehaviorData = buildDgoBehaviorData(
        dgoSheetData,
        dgoDmiGoal,
        dgoSgtData || { visitGoal: 0, achievedVisits: 0, sgtTierBreakdown: [] },
        dgoWarTaskData || { assigned: 0, completed: 0 },
        dgoDmiSiteData || { visitGoal: 0, achievedVisits: 0, dmiVisits: 0, newDmiVisits: 0, existingDmiVisits: 0, siteVisits: 0, newSiteVisits: 0, existingSiteVisits: 0 },
        sortedPairs
      ) || { achievedPoints: 0, goal: 0, completionPercentage: 0, breakdown: [] }

      const earned = toNumber(dgoSheetData.points) + toNumber(dgoDmiData?.achievedPoints) + toNumber(dgoBehaviorData.achievedPoints)
      const goal = toNumber(dgoSheetData.goal) + dgoDmiGoal + toNumber(dgoBehaviorData.goal)
      const pct = goal > 0 ? Number(((earned / goal) * 100).toFixed(1)) : 0

      return {
        id: dgo.id || `dgo-${index}`,
        name: dgo.full_name || `DGO ${index + 1}`,
        employeeId: dgoEmployeeId,
        earned: Math.round(earned),
        goal: Math.round(goal),
        pct,
        status: toAchievementStatus(pct),
        sheetPoints: Math.round(toNumber(dgoSheetData.points)),
        sheetGoal: Math.round(toNumber(dgoSheetData.goal)),
        sheetClaimed: toNumber(dgoSheetData.claimed),
        sheetApproved: toNumber(dgoSheetData.approvedSummary),
        dmiPoints: Math.round(toNumber(dgoDmiData?.achievedPoints)),
        dmiGoal: Math.round(dgoDmiGoal),
        dmiClaimedCount: toNumber(dgoDmiData?.claimedDmiCount),
        dmiActiveCount: toNumber(dgoDmiData?.activeDmiCount),
        dmiNewEnrolledPoints: Math.round(toNumber(dgoDmiData?.newEnrolledPoints)),
        dmiUpdatePoints: Math.round(toNumber(dgoDmiData?.dmiUpdatePoints)),
        behaviorPoints: Math.round(toNumber(dgoBehaviorData.achievedPoints)),
        behaviorGoal: Math.round(toNumber(dgoBehaviorData.goal)),
        behaviorCompletion: toNumber(dgoBehaviorData.completionPercentage),
        brandBreakdown: Array.isArray(dgoSheetData.brandBreakdown) ? dgoSheetData.brandBreakdown : [],
        tierBreakdown: Array.isArray(dgoDmiData?.tierBreakdown) ? dgoDmiData.tierBreakdown : [],
        behaviorBreakdown: Array.isArray(dgoBehaviorData.breakdown) ? dgoBehaviorData.breakdown : [],
      }
    }))

    const teamPerformanceData = dgoSnapshotRows.reduce((totals, row) => {
      totals.achievedPoints += toNumber(row.behaviorPoints)
      totals.goalPoints += toNumber(row.behaviorGoal)
      return totals
    }, { achievedPoints: 0, goalPoints: 0 })

    const behaviorData = buildAsmBehaviorData(
      sheetData,
      dmiGoal,
      sgtData || { visitGoal: 0, achievedVisits: 0, sgtTierBreakdown: [] },
      warTaskData || { assigned: 0, completed: 0 },
      buddyWorkingData || { assigned: 0, completed: 0, percentage: 100 },
      teamPerformanceData,
      sortedPairs
    ) || { achievedPoints: 0, goal: 0, completionPercentage: 0, breakdown: [] }

    const totals = {
      achievedPoints: toNumber(sheetData.points) + toNumber(dmiData?.achievedPoints) + toNumber(behaviorData.achievedPoints),
      goalPoints: toNumber(sheetData.goal) + toNumber(dmiGoal) + toNumber(behaviorData.goal),
    }
    totals.percentage = totals.goalPoints > 0 ? Number(((totals.achievedPoints / totals.goalPoints) * 100).toFixed(1)) : 0

    return {
      asm: {
        id: asmUser?.id || '',
        name: asmUser?.full_name || '',
        employeeId: exactEmployeeId,
        email: asmUser?.email || '',
        branchName: asmUser?.branch_name || '',
      },
      generatedAt: new Date().toISOString(),
      sheetData,
      dmiGoal,
      dmiData: dmiData || { achievedPoints: 0, finalRawPoints: 0, newEnrolledPoints: 0, dmiUpdatePoints: 0, claimedDmiCount: 0, activeDmiCount: 0, newDmiCount: 0, tierUpgradedDmiCount: 0, averageSheetsPerDmi: 0, tierBreakdown: [] },
      behaviorData,
      sgtData: sgtData || { visitGoal: 0, achievedVisits: 0, sgtTierBreakdown: [] },
      warTaskData: warTaskData || { assigned: 0, completed: 0 },
      buddyWorkingData: buddyWorkingData || { assigned: 0, completed: 0, percentage: 100 },
      dmiSiteData: dmiSiteData || { visitGoal: 0, achievedVisits: 0, dmiVisits: 0, newDmiVisits: 0, existingDmiVisits: 0, siteVisits: 0, newSiteVisits: 0, existingSiteVisits: 0 },
      teamPerformanceData,
      dgoTeam: dgoSnapshotRows,
      totals,
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

      const quarterKey = selectedQuarters.includes('All') ? 'all' : [...selectedQuarters].sort().join('-')
      const monthKey = selectedMonths.includes('All') ? 'all' : [...selectedMonths].sort((a, b) => Number(a) - Number(b)).join('-')
      const cacheKey = `asm_perf_detail_v11_${selectedUser.employee_id}_${selectedFYStart}_${quarterKey}_${monthKey}_${teamFilter}`

      const result = await cachedFetch(
        cacheKey,
        () => computeAsmPerformance(selectedUser.employee_id, monthYearPairs, selectedFYStart, selectedUser, false, teamFilter),
        TTL.SHORT,
        forceRefresh
      )

      if (!mountedRef.current) return
      setDetailData(result.data)
      setFromCache(Boolean(result.fromCache))
    } catch (error) {
      if (mountedRef.current) setDetailError(error.message)
    } finally {
      if (mountedRef.current) setDetailLoading(false)
    }
  }, [selectedFYStart, selectedMonths, selectedQuarters, selectedUser, monthYearPairs, computeAsmPerformance, teamFilter])

  const downloadCurrentReport = useCallback(() => {
    if (!detailData || !selectedUser) return

    const selectionLabel = buildSelectionLabel(selectedQuarters, selectedMonths)
    const fyLabel = `FY_${selectedFYStart}-${String(selectedFYStart + 1).slice(-2)}`
    const safeName = String(selectedUser.full_name || selectedUser.employee_id || 'ASM').replace(/[^a-z0-9]+/gi, '_')
    const fileName = `ASM_Performance_Report_${safeName}_${fyLabel}_${selectionLabel}.xlsx`

    const summaryRows = [{
      ASM_Employee: selectedUser.employee_id || '',
      ASM_Name: selectedUser.full_name || '',
      ASM_Email: selectedUser.email || '',
      DGO_Count: detailData.dgoTeam.length,
      Total_Goal_Points: detailData.totals.goalPoints,
      Total_Achieved_Points: detailData.totals.achievedPoints,
      Overall_Achievement_Percentage: detailData.totals.percentage,
    }]

    const dgoRows = detailData.dgoTeam.map(row => ({
      DGO_Name: row.name,
      DGO_Employee_ID: row.employeeId,
      Total_Earned: row.earned,
      Total_Goal: row.goal,
      Achievement_Percentage: row.pct,
      Status: row.status,
      Sheet_Points: row.sheetPoints,
      DMI_Points: row.dmiPoints,
      Behavior_Points: row.behaviorPoints,
    }))

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Summary')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(dgoRows), 'DGO Snapshot')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailData.sheetData.brandBreakdown || []), 'Sheet Breakdown')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailData.dmiData.tierBreakdown || []), 'DMI Breakdown')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailData.behaviorData.breakdown || []), 'Behavior Breakdown')
    XLSX.writeFile(workbook, fileName)
  }, [detailData, selectedFYStart, selectedMonths, selectedQuarters, selectedUser])

  const downloadAllUsersReport = useCallback(async () => {
    if (!monthYearPairs.length || allUsersExporting) return

    const selectionLabel = buildSelectionLabel(selectedQuarters, selectedMonths)
    const fyLabel = `FY_${selectedFYStart}-${String(selectedFYStart + 1).slice(-2)}`
    const exportUsers = filteredUsers.filter(user => user?.employee_id)
    if (exportUsers.length === 0) {
      console.warn('No users to export')
      return
    }

    setAllUsersExporting(true)
    setAllUsersExportProgress({ done: 0, total: exportUsers.length })

    const rows = []

    const buildExportRow = (user, data) => ({
      Employee: user.employee_id || '',
      Employee_Name: user.full_name || '',
      Branch_Name: user.branch_name || '',
      DGO_Count: data.dgoTeam.length,
      Achieved_Sheet: data.sheetData.approvedSummary || 0,
      Sheet_Goal: data.sheetData.goal || 0,
      Achieved_Sheet_Points: data.sheetData.points || 0,
      Sheet_Points_Goal: data.sheetData.goal || 0,
      Achieved_DMI_Points: data.dmiData.achievedPoints || 0,
      Goal_DMI_Points: data.dmiGoal || 0,
      Achieved_Behaviour_Points: data.behaviorData.achievedPoints || 0,
      Goal_Behaviour_Points: data.behaviorData.goal || 0,
      Total_Goal_Points: data.totals.goalPoints || 0,
      Total_Achieved_Points: data.totals.achievedPoints || 0,
      Overall_Achievement_Percentage: data.totals.percentage || 0,
    })

    const processUsersForExport = async (usersToProcess, {
      forceRefresh = false,
      updateProgress = false,
      maxConcurrency = 4,
      requestDelayMs = 0,
      maxAttempts = 1,
      attemptBackoffMs = 0,
    } = {}) => {
      const localRows = []
      const localFailedUsers = []
      const concurrency = Math.max(1, Math.min(maxConcurrency, usersToProcess.length))
      let nextIndex = 0
      let completedCount = 0

      const worker = async () => {
        while (true) {
          const currentIndex = nextIndex
          if (currentIndex >= usersToProcess.length) return
          nextIndex += 1

          const user = usersToProcess[currentIndex]
          const cacheKey = forceRefresh
            ? `asm_perf_export_v7_retry_${user.employee_id}_${selectedFYStart}_${selectionLabel}`
            : `asm_perf_export_v7_${user.employee_id}_${selectedFYStart}_${selectionLabel}`

          let success = false
          let lastError = null

          try {
            for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
              try {
                const result = await cachedFetch(
                  cacheKey,
                  () => computeAsmPerformance(user.employee_id, monthYearPairs, selectedFYStart, user, true),
                  TTL.SHORT,
                  forceRefresh || attempt > 1
                )

                if (result?.data) {
                  localRows.push(buildExportRow(user, result.data))
                  success = true
                  break
                }

                lastError = new Error('No data returned')
              } catch (attemptError) {
                lastError = attemptError
              }

              if (attempt < maxAttempts && attemptBackoffMs > 0) {
                await new Promise(resolve => setTimeout(resolve, attemptBackoffMs * attempt))
              }
            }

            if (!success) {
              localFailedUsers.push(user.employee_id)
              console.warn(`Failed to fetch data for ${user.employee_id} after ${maxAttempts} attempt(s):`, lastError?.message || 'Unknown error')
            }
          } finally {
            completedCount += 1
            if (updateProgress) {
              setAllUsersExportProgress({ done: completedCount, total: exportUsers.length })
            }

            if (requestDelayMs > 0) {
              await new Promise(resolve => setTimeout(resolve, requestDelayMs))
            }
          }
        }
      }

      await Promise.all(Array.from({ length: concurrency }, () => worker()))
      return { localRows, localFailedUsers }
    }

    try {
      const firstPass = await processUsersForExport(exportUsers, {
        updateProgress: true,
        maxConcurrency: 3,
        maxAttempts: 1,
      })
      rows.push(...firstPass.localRows)

      let failedUsers = firstPass.localFailedUsers
      if (failedUsers.length > 0) {
        const retryUsers = exportUsers.filter(user => failedUsers.includes(user.employee_id))
        const retryPass = await processUsersForExport(retryUsers, {
          forceRefresh: true,
          maxConcurrency: 1,
          requestDelayMs: 300,
          maxAttempts: 2,
          attemptBackoffMs: 400,
        })
        rows.push(...retryPass.localRows)
        failedUsers = retryPass.localFailedUsers
      }

      if (failedUsers.length > 0) {
        const finalRetryUsers = exportUsers.filter(user => failedUsers.includes(user.employee_id))
        const finalRetryPass = await processUsersForExport(finalRetryUsers, {
          forceRefresh: true,
          maxConcurrency: 1,
          requestDelayMs: 600,
          maxAttempts: 3,
          attemptBackoffMs: 800,
        })
        rows.push(...finalRetryPass.localRows)
        failedUsers = finalRetryPass.localFailedUsers
      }

      if (rows.length === 0) {
        console.error('No valid rows to export after processing all users')
        alert('Failed to fetch data for all users. Please try downloading again.')
        return
      }

      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'ASM Performance Report')
      XLSX.writeFile(workbook, `ASM_Performance_Report_All_${fyLabel}_${selectionLabel}.xlsx`)
      console.log(`Successfully exported ${rows.length}/${exportUsers.length} ASM records`)
      
      if (failedUsers.length > 0) {
        console.warn(`Failed to fetch data for ${failedUsers.length} users: ${failedUsers.join(', ')}`)
        alert(`Downloaded ${rows.length} records. Failed to fetch ${failedUsers.length} users (check console for details).`)
      }
    } catch (error) {
      console.error('Error downloading ASM report:', error)
      alert(`Failed to download report: ${error.message || 'Unknown error'}`)
    } finally {
      setAllUsersExporting(false)
      setAllUsersExportProgress({ done: 0, total: 0 })
    }
  }, [allUsersExporting, computeAsmPerformance, filteredUsers, monthYearPairs, selectedFYStart, selectedMonths, selectedQuarters])

  useEffect(() => {
    mountedRef.current = true
    loadUsers()
    return () => { mountedRef.current = false }
  }, [loadUsers])

  useEffect(() => {
    loadDetail(false)
  }, [loadDetail])

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
        ),
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

  useEffect(() => {
    setTeamFilter('Team')
  }, [selectedUserId])

  const totalSummaryRows = detailData ? [
    { label: 'Sheets', achieved: toNumber(detailData.sheetData.approvedSummary), goal: toNumber(detailData.sheetData.goal) },
    { label: 'Active DMIs', achieved: toNumber(detailData.dmiData.activeDmiCount) + toNumber(detailData.dmiData.newDmiCount), goal: toNumber(detailData.dmiGoal / 40) },
    { label: 'DGOs', achieved: detailData.dgoTeam.length, goal: detailData.dgoTeam.length },
  ] : []

  const insight = detailData
    ? getInsight(detailData.totals.percentage, detailData.totals.goalPoints)
    : { title: 'Loading Data', message: 'Select an ASM to view DURO Lakshya performance.' }

  return (
    <>
    <main className="apdr-main asmpr-main">
      <section className="apdr-header">
        <div>
          <h2>DURO Lakshya Dashboard ASM</h2>
          <p>ASM-level dashboard for users assigned with ASM access in Assign Performance Dashboard</p>
        </div>
        <button className="apdr-btn apdr-btn-secondary" onClick={loadUsers} disabled={usersLoading}>
          <i className={`fa-solid fa-rotate-right ${usersLoading ? 'fa-spin' : ''}`}></i>
          Refresh Users
        </button>
      </section>

      <section className="apdr-filter-row">
        <div className="apdr-filter-group">
          <label>Financial Year</label>
          <select value={selectedFYStart} onChange={(event) => setSelectedFYStart(Number(event.target.value))}>
            {fyOptions.map(option => <option key={option.start} value={option.start}>{option.label}</option>)}
          </select>
        </div>

        <div className="apdr-filter-group">
          <label>Quarter / Month</label>
          <div className="apdr-inline-filters">
            <select
              className="apdr-quarter-select"
              value={selectedQuarters.includes('All') ? 'All' : selectedQuarters[0] || 'All'}
              onChange={(event) => {
                const value = event.target.value
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
              onChange={(event) => {
                const value = event.target.value
                if (value === 'All') {
                  setSelectedMonths(['All'])
                  return
                }
                setSelectedMonths([value])
              }}
            >
              <option value="All">All Months</option>
              {availableMonths.map(month => <option key={month} value={String(month)}>{MONTH_LABELS[month]}</option>)}
            </select>
          </div>
        </div>

        <div className="apdr-filter-group apdr-filter-action">
          <label>Branch</label>
          <select
            value={selectedBranch}
            onChange={(event) => setSelectedBranch(event.target.value)}
          >
            {branchOptions.map(branch => <option key={branch} value={branch}>{branch}</option>)}
          </select>
        </div>

        <div className="apdr-filter-group apdr-filter-action">
          <label>Report</label>
          <button className="apdr-btn apdr-btn-secondary" onClick={downloadAllUsersReport} disabled={allUsersExporting}>
            <i className={`fa-solid ${allUsersExporting ? 'fa-spinner fa-spin' : 'fa-file-arrow-down'}`}></i>
            {allUsersExporting
              ? `Downloading (${allUsersExportProgress.done}/${allUsersExportProgress.total})`
              : 'Download All ASM'}
          </button>
        </div>
      </section>

      <div className="apdr-layout">
        <section className="apdr-card apdr-list-card">
          <div className="apdr-list-header">
            <h3>Assigned ASM Users</h3>
            <span>{filteredUsers.length}</span>
          </div>

          <div className="apdr-search">
            <i className="fa-solid fa-search"></i>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by name, email, employee ID"
            />
          </div>

          {usersLoading ? (
            <div className="apdr-loading"><i className="fa-solid fa-spinner fa-spin"></i><span>Loading ASM users...</span></div>
          ) : usersError ? (
            <div className="apdr-error">{usersError}</div>
          ) : filteredUsers.length === 0 ? (
            <div className="apdr-empty">No ASM users assigned in Assign Performance Dashboard.</div>
          ) : (
            <div className="apdr-user-list">
              {filteredUsers.map(user => (
                <button
                  key={user.id}
                  className={`apdr-user-row ${selectedUserId === user.id ? 'selected' : ''}`}
                  onClick={() => setSelectedUserId(user.id)}
                >
                  <div className="apdr-user-name">{user.full_name || 'Unknown User'}</div>
                  <div className="apdr-user-sub">{user.employee_id || '-'} | {user.email || '-'}</div>
                  <div className="asmpr-user-branch">{user.branch_name || 'No branch assigned'}</div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="apdr-card apdr-detail-card">
          {!selectedUser ? (
            <div className="apdr-empty">Select an ASM to view DURO Lakshya dashboard details.</div>
          ) : detailLoading ? (
            <div className="apdr-loading"><i className="fa-solid fa-spinner fa-spin"></i><span>Loading ASM performance...</span></div>
          ) : detailError ? (
            <div className="apdr-error">{detailError}</div>
          ) : !detailData ? (
            <div className="apdr-empty">No data available for this ASM.</div>
          ) : (
            <>
              <div className="apdr-detail-header">
                <div>
                  <h3>{selectedUser.full_name || 'ASM User'}</h3>
                  <p>{selectedUser.employee_id || '-'} | {selectedUser.email || '-'} | {selectedUser.branch_name || 'No branch'}</p>
                </div>
                <div className="apdr-detail-actions">
                  <div className="apdr-filter-group" style={{ minWidth: '120px' }}>
                    <label>View</label>
                    <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
                      <option value="My">My</option>
                      <option value="Team">Team</option>
                    </select>
                  </div>
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

              <div className="asmpr-alert">
                <div className="asmpr-alert-icon"><i className="fa-solid fa-chart-line"></i></div>
                <div>
                  <h4>{insight.title}</h4>
                  <p>{insight.message}</p>
                </div>
              </div>

              <div className="apdr-total-card asmpr-total-card">
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

              <div className="asmpr-overview-grid">
                {totalSummaryRows.map(row => (
                  <div key={row.label} className="asmpr-stat-card">
                    <span>{row.label}</span>
                    <strong>{row.achieved.toLocaleString()}</strong>
                    <small>Goal: {row.goal.toLocaleString()}</small>
                  </div>
                ))}
                <div className="asmpr-stat-card">
                  <span>Buddy Working</span>
                  <strong>{toNumber(detailData.buddyWorkingData.percentage).toFixed(1)}%</strong>
                  <small>{toNumber(detailData.buddyWorkingData.completed)} / {toNumber(detailData.buddyWorkingData.assigned)}</small>
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
                    <div><label>Base Monthly Goal</label><strong>{toNumber(detailData.sheetData.baseMonthlyGoal).toLocaleString()}</strong></div>
                  </div>

                  <div className="apdr-subtable-wrap">
                    <h5>Brand Breakdown</h5>
                    {detailData.sheetData.brandBreakdown.length === 0 ? (
                      <p className="apdr-muted">No brand data.</p>
                    ) : (
                      <table className="apdr-subtable">
                        <thead><tr><th>Brand</th><th>Sheets</th><th>Multiplier</th><th>Points</th></tr></thead>
                        <tbody>
                          {detailData.sheetData.brandBreakdown.map((row, index) => (
                            <tr key={index}>
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
                        {detailData.dmiData.tierBreakdown.map((row, index) => (
                          <tr key={index}>
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
                    <div><label>Completion</label><strong>{toNumber(detailData.behaviorData.completionPercentage).toFixed(1)}%</strong></div>
                    <div><label>SGT Achieved / Goal</label><strong>{toNumber(detailData.sgtData.achievedVisits)} / {toNumber(detailData.sgtData.visitGoal)}</strong></div>
                    <div><label>WAR Completed / Assigned</label><strong>{toNumber(detailData.warTaskData.completed)} / {toNumber(detailData.warTaskData.assigned)}</strong></div>
                    <div><label>Team Perf Points</label><strong>{toNumber(detailData.teamPerformanceData.achievedPoints)} / {toNumber(detailData.teamPerformanceData.goalPoints)}</strong></div>
                  </div>

                  <div className="apdr-subtable-wrap">
                    <h5>Behavior Breakdown</h5>
                    <table className="apdr-subtable">
                      <thead><tr><th>Metric</th><th>Weightage</th><th>Value</th><th>Achieved</th><th>Goal</th></tr></thead>
                      <tbody>
                        {detailData.behaviorData.breakdown.map((row, index) => (
                          <tr key={index}>
                            <td>{row.label}</td>
                            <td>{row.weightage}%</td>
                            <td>{toNumber(row.value).toLocaleString()}%</td>
                            <td>{toNumber(row.achievedVisits ?? row.completed ?? row.achievedPoints).toLocaleString()}</td>
                            <td>{toNumber(row.visitGoal ?? row.assigned ?? row.goalPoints).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {detailData.behaviorData.breakdown
                      .filter(row => row.label === 'S/G/T Coverage' && Array.isArray(row.sgtTierBreakdown) && row.sgtTierBreakdown.length > 0)
                      .map((row, idx) => (
                        <div key={`sgt-tier-${idx}`} style={{ marginTop: '0.75rem' }}>
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
                  </div>
                </div>
              </div>

              <div className="apdr-pillar asmpr-team-card">
                <div className="asmpr-team-header">
                  <div>
                    <h4>DGO Team Snapshot</h4>
                    <p>{detailData.dgoTeam.length} mapped DGOs found under this ASM</p>
                  </div>
                  <div className="asmpr-team-total">
                    <span>Team Behavior</span>
                    <strong>{toNumber(detailData.teamPerformanceData.achievedPoints).toLocaleString()} / {toNumber(detailData.teamPerformanceData.goalPoints).toLocaleString()}</strong>
                  </div>
                </div>

                {detailData.dgoTeam.length === 0 ? (
                  <div className="apdr-empty">No DGOs are mapped to this ASM in the user hierarchy.</div>
                ) : (
                  <div className="asmpr-table-wrap">
                    <table className="apdr-subtable asmpr-team-table">
                      <thead>
                        <tr>
                          <th>DGO</th>
                          <th>Employee ID</th>
                          <th>Total Earned</th>
                          <th>Total Goal</th>
                          <th>Achievement %</th>
                          <th>Status</th>
                          <th>Sheet</th>
                          <th>DMI</th>
                          <th>Behavior</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailData.dgoTeam.map(row => (
                          <tr
                            key={row.id}
                            className="asmpr-dgo-clickable-row"
                            onClick={() => setSelectedDgoModal(row)}
                            title="Click to view full performance details"
                          >
                            <td>
                              <span className="asmpr-dgo-name-link">{row.name}</span>
                            </td>
                            <td>{row.employeeId || '-'}</td>
                            <td>{toNumber(row.earned).toLocaleString()}</td>
                            <td>{toNumber(row.goal).toLocaleString()}</td>
                            <td>{toNumber(row.pct).toFixed(1)}%</td>
                            <td><span className={`asmpr-status asmpr-status-${row.status.toLowerCase().replace(/\s+/g, '-')}`}>{row.status}</span></td>
                            <td>{toNumber(row.sheetPoints).toLocaleString()}</td>
                            <td>{toNumber(row.dmiPoints).toLocaleString()}</td>
                            <td>{toNumber(row.behaviorPoints).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>

    {selectedDgoModal && (
      <div className="asmpr-modal-overlay" onClick={() => setSelectedDgoModal(null)}>
        <div className="asmpr-modal-panel" onClick={e => e.stopPropagation()}>
          <div className="asmpr-modal-header">
            <div className="asmpr-modal-title">
              <h2>{selectedDgoModal.name}</h2>
              <p>{selectedDgoModal.employeeId} &nbsp;·&nbsp; DGO Performance Dashboard</p>
            </div>
            <button className="asmpr-modal-close" onClick={() => setSelectedDgoModal(null)} aria-label="Close">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>

          <div className="asmpr-modal-hero">
            <div className="asmpr-modal-hero-stat">
              <label>Total Earned</label>
              <strong>{toNumber(selectedDgoModal.earned).toLocaleString()}</strong>
            </div>
            <div className="asmpr-modal-hero-stat">
              <label>Total Goal</label>
              <strong>{toNumber(selectedDgoModal.goal).toLocaleString()}</strong>
            </div>
            <div className="asmpr-modal-hero-stat asmpr-modal-hero-pct">
              <label>Achievement</label>
              <strong>{toNumber(selectedDgoModal.pct).toFixed(1)}%</strong>
            </div>
            <div className="asmpr-modal-hero-stat">
              <label>Status</label>
              <span className={`asmpr-status asmpr-status-${selectedDgoModal.status.toLowerCase().replace(/\s+/g, '-')}`}>
                {selectedDgoModal.status}
              </span>
            </div>
          </div>

          <div className="asmpr-modal-pillars">
            {/* Sheet Points */}
            <div className="asmpr-modal-pillar">
              <div className="asmpr-modal-pillar-head">
                <i className="fa-solid fa-file-invoice" />
                <h4>Sheet Points</h4>
                <span className="asmpr-modal-pillar-score">
                  {toNumber(selectedDgoModal.sheetPoints).toLocaleString()} / {toNumber(selectedDgoModal.sheetGoal).toLocaleString()}
                </span>
              </div>
              <div className="asmpr-modal-grid3">
                <div><label>Claimed Sheets</label><strong>{toNumber(selectedDgoModal.sheetClaimed).toLocaleString()}</strong></div>
                <div><label>Approved Sheets</label><strong>{toNumber(selectedDgoModal.sheetApproved).toLocaleString()}</strong></div>
                <div><label>Points Earned</label><strong>{toNumber(selectedDgoModal.sheetPoints).toLocaleString()}</strong></div>
                <div><label>Goal</label><strong>{toNumber(selectedDgoModal.sheetGoal).toLocaleString()}</strong></div>
                <div><label>Achievement</label><strong>{selectedDgoModal.sheetGoal > 0 ? ((selectedDgoModal.sheetPoints / selectedDgoModal.sheetGoal) * 100).toFixed(1) : '0.0'}%</strong></div>
              </div>
              {selectedDgoModal.brandBreakdown.length > 0 && (
                <div className="asmpr-modal-subtable-wrap">
                  <h5>Brand Breakdown</h5>
                  <table className="apdr-subtable">
                    <thead><tr><th>Brand</th><th>Sheets</th><th>Multiplier</th><th>Points</th></tr></thead>
                    <tbody>
                      {selectedDgoModal.brandBreakdown.map((row, i) => (
                        <tr key={i}>
                          <td>{row.brandCategory}</td>
                          <td>{toNumber(row.qty).toLocaleString()}</td>
                          <td>{toNumber(row.pointsPerSheet).toLocaleString()}</td>
                          <td>{toNumber(row.totalPoints).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* DMI Points */}
            <div className="asmpr-modal-pillar">
              <div className="asmpr-modal-pillar-head">
                <i className="fa-solid fa-chart-line" />
                <h4>DMI Points</h4>
                <span className="asmpr-modal-pillar-score">
                  {toNumber(selectedDgoModal.dmiPoints).toLocaleString()} / {toNumber(selectedDgoModal.dmiGoal).toLocaleString()}
                </span>
              </div>
              <div className="asmpr-modal-grid3">
                <div><label>Claimed DMIs</label><strong>{toNumber(selectedDgoModal.dmiClaimedCount).toLocaleString()}</strong></div>
                <div><label>Active DMIs</label><strong>{toNumber(selectedDgoModal.dmiActiveCount).toLocaleString()}</strong></div>
                <div><label>Achieved Points</label><strong>{toNumber(selectedDgoModal.dmiPoints).toLocaleString()}</strong></div>
                <div><label>Goal</label><strong>{toNumber(selectedDgoModal.dmiGoal).toLocaleString()}</strong></div>
                <div><label>New DMI Points</label><strong>{toNumber(selectedDgoModal.dmiNewEnrolledPoints).toLocaleString()}</strong></div>
                <div><label>Tier Upgrade Pts</label><strong>{toNumber(selectedDgoModal.dmiUpdatePoints).toLocaleString()}</strong></div>
              </div>
              {selectedDgoModal.tierBreakdown.length > 0 && (
                <div className="asmpr-modal-subtable-wrap">
                  <h5>Tier Breakdown</h5>
                  <table className="apdr-subtable">
                    <thead><tr><th>Tier</th><th>Active Count</th><th>Multiplier</th><th>Points</th></tr></thead>
                    <tbody>
                      {selectedDgoModal.tierBreakdown.map((row, i) => (
                        <tr key={i}>
                          <td>{row.tier}</td>
                          <td>{toNumber(row.activeDmiCount).toLocaleString()}</td>
                          <td>{toNumber(row.pointsPerDmi).toLocaleString()}</td>
                          <td>{(toNumber(row.activeDmiCount) * toNumber(row.pointsPerDmi)).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Behavior Points */}
            <div className="asmpr-modal-pillar">
              <div className="asmpr-modal-pillar-head">
                <i className="fa-solid fa-brain" />
                <h4>Behavior Points</h4>
                <span className="asmpr-modal-pillar-score">
                  {toNumber(selectedDgoModal.behaviorPoints).toLocaleString()} / {toNumber(selectedDgoModal.behaviorGoal).toLocaleString()}
                </span>
              </div>
              <div className="asmpr-modal-grid3">
                <div><label>Achieved Points</label><strong>{toNumber(selectedDgoModal.behaviorPoints).toLocaleString()}</strong></div>
                <div><label>Goal</label><strong>{toNumber(selectedDgoModal.behaviorGoal).toLocaleString()}</strong></div>
                <div><label>Completion</label><strong>{toNumber(selectedDgoModal.behaviorCompletion).toFixed(1)}%</strong></div>
              </div>
              {selectedDgoModal.behaviorBreakdown.length > 0 && (
                <div className="asmpr-modal-subtable-wrap">
                  <h5>Behavior Breakdown</h5>
                  <table className="apdr-subtable">
                    <thead><tr><th>Metric</th><th>Weightage</th><th>Value</th><th>Achieved</th><th>Goal</th></tr></thead>
                    <tbody>
                      {selectedDgoModal.behaviorBreakdown.map((row, i) => (
                        <tr key={i}>
                          <td>{row.label}</td>
                          <td>{row.weightage}%</td>
                          <td>{toNumber(row.value).toFixed(0)}%</td>
                          <td>{toNumber(row.achievedVisits ?? row.completed).toLocaleString()}</td>
                          <td>{toNumber(row.visitGoal ?? row.assigned).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {selectedDgoModal.behaviorBreakdown
                    .filter(row => row.label === 'S/G/T Coverage' && Array.isArray(row.sgtTierBreakdown) && row.sgtTierBreakdown.length > 0)
                    .map((row, i) => (
                      <div key={`sgt-${i}`} className="asmpr-modal-subtable-wrap" style={{ marginTop: '0.75rem' }}>
                        <h5>S/G/T Tier-wise Breakdown</h5>
                        <table className="apdr-subtable">
                          <thead><tr><th>Tier</th><th>Achieved</th><th>Goal</th></tr></thead>
                          <tbody>
                            {row.sgtTierBreakdown.map((t, ti) => (
                              <tr key={ti}>
                                <td>{t.tier}</td>
                                <td>{toNumber(t.achievedVisits).toLocaleString()}</td>
                                <td>{toNumber(t.goalVisits).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}

                  {selectedDgoModal.behaviorBreakdown
                    .filter(row => row.label === 'DMI+Site Visits')
                    .map((row, i) => (
                      <div key={`dmisite-${i}`} className="asmpr-modal-subtable-wrap" style={{ marginTop: '0.75rem' }}>
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
                              <td><strong>Total</strong></td>
                              <td>{(toNumber(row.newDmiVisits) + toNumber(row.newSiteVisits)).toLocaleString()}</td>
                              <td>{(toNumber(row.existingDmiVisits) + toNumber(row.existingSiteVisits)).toLocaleString()}</td>
                              <td><strong>{(toNumber(row.newDmiVisits) + toNumber(row.newSiteVisits) + toNumber(row.existingDmiVisits) + toNumber(row.existingSiteVisits)).toLocaleString()}</strong></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  )
}