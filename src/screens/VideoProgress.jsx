import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { cachedFetch, TTL } from '../utils/cacheDB'
import * as XLSX from 'xlsx'
import { useNotification } from '../contexts/NotificationContext'
import './VideoProgress.css'

function VideoProgress() {
  const mountedRef = useRef(true)
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // â”€â”€ Raw data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [users, setUsers] = useState([])
  const [branches, setBranches] = useState([])
  const [departments, setDepartments] = useState([])
  const [categories, setCategories] = useState([])
  const [modules, setModules] = useState([])
  const [videos, setVideos] = useState([])
  const [categoryAccess, setCategoryAccess] = useState([])    // [{department_id, category_id}]
  const [moduleAssignments, setModuleAssignments] = useState([]) // [{user_id, module_id}]
  const [progressRecords, setProgressRecords] = useState([])     // [{user_id, video_id, ...}]

  // â”€â”€ View state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [view, setView] = useState('list') // 'list' | 'detail'
  const [selectedUser, setSelectedUser] = useState(null)
  const [mandatoryOnly, setMandatoryOnly] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState({})
  const [expandedModules, setExpandedModules] = useState({})

  // â”€â”€ List filters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [searchUser, setSearchUser] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterBranch, setFilterBranch] = useState('')
  const [listPage, setListPage] = useState(1)
  const PAGE_SIZE = 15

  useEffect(() => {
    mountedRef.current = true
    fetchAll()
    return () => { mountedRef.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchAll = async () => {
    try {
      setLoading(true)
      setError(null)

      const [
        usersRes, branchesRes, deptsRes, catsRes, modsRes, vidsRes,
        catAccessRes, modAssignRes, progressRes
      ] = await Promise.all([
        cachedFetch('vp2_users', async () => {
          const { data, error } = await supabase.from('users')
            .select('id, full_name, email, employee_id, branch_id, department_id')
            .order('full_name')
          if (error) throw error
          return data || []
        }, TTL.MEDIUM),
        cachedFetch('vp2_branches', async () => {
          const { data, error } = await supabase.from('branches').select('id, branch_name').order('branch_name')
          if (error) throw error
          return data || []
        }, TTL.VERY_LONG),
        cachedFetch('vp2_depts', async () => {
          const { data, error } = await supabase.from('departments').select('id, department_name').order('department_name')
          if (error) throw error
          return data || []
        }, TTL.LONG),
        cachedFetch('vp2_cats', async () => {
          const { data, error } = await supabase.from('categories').select('id, name').order('name')
          if (error) throw error
          return data || []
        }, TTL.LONG),
        cachedFetch('vp2_mods', async () => {
          const { data, error } = await supabase.from('modules').select('id, title, category_id').order('title')
          if (error) throw error
          return data || []
        }, TTL.LONG),
        cachedFetch('vp2_vids', async () => {
          const { data, error } = await supabase.from('videos').select('id, title, module_id, duration').order('title')
          if (error) throw error
          return data || []
        }, TTL.LONG),
        cachedFetch('vp2_cat_access', async () => {
          const { data, error } = await supabase.from('category_department_access').select('department_id, category_id')
          if (error) throw error
          return data || []
        }, TTL.LONG),
        cachedFetch('vp2_mod_assign', async () => {
          const PAGE = 1000
          let all = [], from = 0, hasMore = true
          while (hasMore) {
            const { data, error } = await supabase
              .from('user_module_assignments')
              .select('user_id, module_id')
              .range(from, from + PAGE - 1)
            if (error) throw error
            if (data?.length) { all = all.concat(data); from += PAGE; hasMore = data.length === PAGE }
            else hasMore = false
          }
          return all
        }, TTL.MEDIUM),
        // Progress â€” paginated
        (async () => {
          const PAGE = 1000
          let all = [], from = 0, hasMore = true
          while (hasMore) {
            const { data, error } = await supabase
              .from('user_video_progress')
              .select('user_id, video_id, watched_duration, completed, last_watched_at')
              .range(from, from + PAGE - 1)
            if (error) throw error
            if (data?.length) { all = all.concat(data); from += PAGE; hasMore = data.length === PAGE }
            else hasMore = false
          }
          return all
        })(),
      ])

      if (!mountedRef.current) return

      const unwrap = (r) => r?.data || r || []
      setUsers(unwrap(usersRes))
      setBranches(unwrap(branchesRes))
      setDepartments(unwrap(deptsRes))
      setCategories(unwrap(catsRes))
      setModules(unwrap(modsRes))
      setVideos(unwrap(vidsRes))
      setCategoryAccess(unwrap(catAccessRes))
      setModuleAssignments(unwrap(modAssignRes))
      setProgressRecords(progressRes)
    } catch (err) {
      console.error('[VideoProgress]', err)
      if (mountedRef.current) setError(err.message)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  // â”€â”€ Lookup maps â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const branchMap = useMemo(() => new Map(branches.map(b => [b.id, b.branch_name])), [branches])
  const deptMap   = useMemo(() => new Map(departments.map(d => [d.id, d.department_name])), [departments])

  // dept_id â†’ [category_id]
  const deptCatMap = useMemo(() => {
    const m = new Map()
    categoryAccess.forEach(({ department_id, category_id }) => {
      if (!m.has(department_id)) m.set(department_id, [])
      m.get(department_id).push(category_id)
    })
    return m
  }, [categoryAccess])

  // category_id â†’ [module]
  const catModuleMap = useMemo(() => {
    const m = new Map()
    modules.forEach(mod => {
      if (!m.has(mod.category_id)) m.set(mod.category_id, [])
      m.get(mod.category_id).push(mod)
    })
    return m
  }, [modules])

  // module_id â†’ [video]
  const modVideoMap = useMemo(() => {
    const m = new Map()
    videos.forEach(v => {
      if (!m.has(v.module_id)) m.set(v.module_id, [])
      m.get(v.module_id).push(v)
    })
    return m
  }, [videos])

  // user_id â†’ { completed: Set<video_id>, records: Map<video_id, record> }
  const userProgressMap = useMemo(() => {
    const m = new Map()
    progressRecords.forEach(p => {
      if (!m.has(p.user_id)) m.set(p.user_id, { completed: new Set(), records: new Map() })
      if (p.completed) m.get(p.user_id).completed.add(p.video_id)
      m.get(p.user_id).records.set(p.video_id, p)
    })
    return m
  }, [progressRecords])

  // user_id â†’ Set<module_id>  (mandatory = specifically assigned via AssignModules)
  const userMandatoryMap = useMemo(() => {
    const m = new Map()
    moduleAssignments.forEach(({ user_id, module_id }) => {
      if (!m.has(user_id)) m.set(user_id, new Set())
      m.get(user_id).add(module_id)
    })
    return m
  }, [moduleAssignments])

  // â”€â”€ User summaries (list view) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const userSummaries = useMemo(() => {
    return users.map(user => {
      const catIds   = deptCatMap.get(user.department_id) || []
      const userProg = userProgressMap.get(user.id) || { completed: new Set() }
      let totalVideos = 0, watchedVideos = 0
      catIds.forEach(catId => {
        ;(catModuleMap.get(catId) || []).forEach(mod => {
          const vids = modVideoMap.get(mod.id) || []
          totalVideos += vids.length
          vids.forEach(v => { if (userProg.completed.has(v.id)) watchedVideos++ })
        })
      })
      return {
        ...user,
        branchName: branchMap.get(user.branch_id) || 'N/A',
        deptName:   deptMap.get(user.department_id) || 'N/A',
        totalVideos,
        watchedVideos,
        pendingVideos: totalVideos - watchedVideos,
        progress: totalVideos > 0 ? Math.round((watchedVideos / totalVideos) * 100) : 0,
      }
    })
  }, [users, deptCatMap, catModuleMap, modVideoMap, userProgressMap, branchMap, deptMap])

  // â”€â”€ Filtered users â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const filteredUsers = useMemo(() => {
    let list = [...userSummaries]
    if (searchUser) {
      const q = searchUser.toLowerCase()
      list = list.filter(u =>
        u.full_name?.toLowerCase().includes(q) ||
        u.employee_id?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
      )
    }
    if (filterDept)   list = list.filter(u => u.department_id === filterDept)
    if (filterBranch) list = list.filter(u => u.branch_id === filterBranch)
    return list
  }, [userSummaries, searchUser, filterDept, filterBranch])

  useEffect(() => setListPage(1), [searchUser, filterDept, filterBranch])

  const totalPages    = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE))
  const paginatedUsers = useMemo(() => {
    const start = (listPage - 1) * PAGE_SIZE
    return filteredUsers.slice(start, start + PAGE_SIZE)
  }, [filteredUsers, listPage])

  // â”€â”€ User detail data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const userDetail = useMemo(() => {
    if (!selectedUser) return []
    const catIds   = deptCatMap.get(selectedUser.department_id) || []
    const userProg = userProgressMap.get(selectedUser.id) || { completed: new Set(), records: new Map() }
    const mandatoryIds = userMandatoryMap.get(selectedUser.id) || new Set()

    return categories
      .filter(c => catIds.includes(c.id))
      .map(cat => {
        const mods = (catModuleMap.get(cat.id) || []).map(mod => {
          const isMandatory = mandatoryIds.has(mod.id)
          const vids = (modVideoMap.get(mod.id) || []).map(v => {
            const rec      = userProg.records.get(v.id)
            const total    = parseDuration(v.duration)
            const watched  = rec ? (parseInt(rec.watched_duration, 10) || 0) : 0
            const completed = rec?.completed || false
            return {
              ...v,
              completed,
              watched,
              total,
              progress: completed ? 100 : (total > 0 ? Math.min(Math.round((watched / total) * 100), 99) : 0),
              lastWatched: rec?.last_watched_at || null,
            }
          })
          return { ...mod, isMandatory, videos: vids, totalVids: vids.length, watchedVids: vids.filter(v => v.completed).length }
        })
        const allVids = mods.flatMap(m => m.videos)
        return { ...cat, modules: mods, totalVids: allVids.length, watchedVids: allVids.filter(v => v.completed).length }
      })
  }, [selectedUser, deptCatMap, categories, catModuleMap, modVideoMap, userProgressMap, userMandatoryMap])

  const visibleDetail = useMemo(() => {
    if (!mandatoryOnly) return userDetail
    return userDetail
      .map(cat => ({ ...cat, modules: cat.modules.filter(m => m.isMandatory) }))
      .filter(cat => cat.modules.length > 0)
  }, [userDetail, mandatoryOnly])

  // â”€â”€ Detail summary stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const detailStats = useMemo(() => {
    const allVids       = userDetail.flatMap(c => c.modules.flatMap(m => m.videos))
    const mandatoryVids = userDetail.flatMap(c => c.modules.filter(m => m.isMandatory).flatMap(m => m.videos))
    return {
      total:            allVids.length,
      watched:          allVids.filter(v => v.completed).length,
      pending:          allVids.filter(v => !v.completed).length,
      mandatoryTotal:   mandatoryVids.length,
      mandatoryWatched: mandatoryVids.filter(v => v.completed).length,
    }
  }, [userDetail])

  // Auto-expand categories when entering detail view
  useEffect(() => {
    if (view === 'detail' && userDetail.length) {
      const all = {}
      userDetail.forEach(c => { all[c.id] = true })
      setExpandedCategories(all)
      setExpandedModules({})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedUser])

  // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function parseDuration(dur) {
    if (!dur) return 0
    if (typeof dur === 'number') return dur
    const parts = String(dur).split(':').map(Number)
    if (parts.some(isNaN)) return 0
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    return parseInt(dur, 10) || 0
  }

  function formatDur(s) {
    const n = parseInt(s, 10)
    if (!n || n <= 0) return '0:00'
    const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), sec = n % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  function formatDate(d) {
    if (!d) return 'â€”'
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const progressColor = (p) => p >= 100 ? '#10B981' : p >= 60 ? '#3B82F6' : p > 0 ? '#F59E0B' : '#D1D5DB'

  function openUser(user) {
    setSelectedUser(user)
    setView('detail')
    setMandatoryOnly(false)
  }

  function toggleCat(id) { setExpandedCategories(prev => ({ ...prev, [id]: !prev[id] })) }
  function toggleMod(id)  { setExpandedModules(prev => ({ ...prev, [id]: !prev[id] })) }

  // ── Export helpers ──────────────────────────────────────────
  function buildUserVideoRows(user) {
    const catIds   = deptCatMap.get(user.department_id) || []
    const userProg = userProgressMap.get(user.id) || { completed: new Set(), records: new Map() }
    const mandatoryIds = userMandatoryMap.get(user.id) || new Set()
    const rows = []

    categories
      .filter(c => catIds.includes(c.id))
      .forEach(cat => {
        ;(catModuleMap.get(cat.id) || []).forEach(mod => {
          const vids = modVideoMap.get(mod.id) || []
          if (vids.length === 0) return
          vids.forEach(v => {
            const rec       = userProg.records.get(v.id)
            const total     = parseDuration(v.duration)
            const watched   = rec ? (parseInt(rec.watched_duration, 10) || 0) : 0
            const completed = rec?.completed || false
            const pct       = completed ? 100 : (total > 0 ? Math.min(Math.round((watched / total) * 100), 99) : 0)
            const status    = completed ? 'Completed' : watched > 0 ? 'In Progress' : 'Pending'
            rows.push({
              'User Name': user.full_name || '',
              'Employee ID': user.employee_id || '',
              'Email': user.email || '',
              'Department': deptMap.get(user.department_id) || '',
              'Branch': branchMap.get(user.branch_id) || '',
              'Category': cat.name || '',
              'Module': mod.title || '',
              'Mandatory': mandatoryIds.has(mod.id) ? 'Yes' : 'No',
              'Video Title': v.title || '',
              'Status': status,
              'Last Watched': rec?.last_watched_at ? new Date(rec.last_watched_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
            })
          })
        })
      })
    return rows
  }

  const [exporting, setExporting] = useState(false)
  const [quickExporting, setQuickExporting] = useState(false)

  const handleQuickReport = useCallback(() => {
    setQuickExporting(true)
    setTimeout(() => {
      try {
        const rows = filteredUsers.map(user => ({
          'Employee ID': user.employee_id || '',
          'Name': user.full_name || '',
          'Email': user.email || '',
          'Department': user.deptName || '',
          'Branch': user.branchName || '',
          'Total Videos': user.totalVideos,
          'Watched': user.watchedVideos,
          'Pending': user.pendingVideos,
          'Progress %': user.progress,
        }))
        if (rows.length === 0) {
          showNotification('No data to export', 'warning')
          setQuickExporting(false)
          return
        }
        const ws = XLSX.utils.json_to_sheet(rows)
        const colWidths = Object.keys(rows[0]).map(key => {
          const maxLen = Math.max(key.length, ...rows.map(r => String(r[key] ?? '').length))
          return { wch: Math.min(maxLen + 2, 40) }
        })
        ws['!cols'] = colWidths
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Quick Report')
        XLSX.writeFile(wb, `Video_Progress_Quick_Report_${new Date().toISOString().slice(0, 10)}.xlsx`)
      } catch (err) {
        console.error('Quick export error:', err)
        showNotification('Export failed: ' + err.message, 'error')
      } finally {
        setQuickExporting(false)
      }
    }, 50)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredUsers])

  const handleExportAll = useCallback(() => {
    setExporting(true)
    // Use setTimeout so the button spinner renders before the heavy work
    setTimeout(() => {
      try {
        const allRows = []
        filteredUsers.forEach(user => {
          allRows.push(...buildUserVideoRows(user))
        })
        if (allRows.length === 0) {
          showNotification('No data to export', 'warning')
          setExporting(false)
          return
        }
        const ws = XLSX.utils.json_to_sheet(allRows)
        // Auto-size columns
        const colWidths = Object.keys(allRows[0]).map(key => {
          const maxLen = Math.max(key.length, ...allRows.map(r => String(r[key] ?? '').length))
          return { wch: Math.min(maxLen + 2, 40) }
        })
        ws['!cols'] = colWidths
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Video Progress Report')
        XLSX.writeFile(wb, `Video_Progress_Report_${new Date().toISOString().slice(0, 10)}.xlsx`)
      } catch (err) {
        console.error('Export error:', err)
        showNotification('Export failed: ' + err.message, 'error')
      } finally {
        setExporting(false)
      }
    }, 50)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredUsers, deptCatMap, userProgressMap, userMandatoryMap, categories, catModuleMap, modVideoMap])

  const handleExportUser = useCallback(() => {
    if (!selectedUser) return
    setExporting(true)
    setTimeout(() => {
      try {
        const rows = buildUserVideoRows(selectedUser)
        if (rows.length === 0) {
          showNotification('No data to export', 'warning')
          setExporting(false)
          return
        }
        const ws = XLSX.utils.json_to_sheet(rows)
        const colWidths = Object.keys(rows[0]).map(key => {
          const maxLen = Math.max(key.length, ...rows.map(r => String(r[key] ?? '').length))
          return { wch: Math.min(maxLen + 2, 40) }
        })
        ws['!cols'] = colWidths
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Video Progress')
        const safeName = (selectedUser.full_name || 'User').replace(/[^a-zA-Z0-9]/g, '_')
        XLSX.writeFile(wb, `Video_Progress_${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`)
      } catch (err) {
        console.error('Export error:', err)
        showNotification('Export failed: ' + err.message, 'error')
      } finally {
        setExporting(false)
      }
    }, 50)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser, deptCatMap, userProgressMap, userMandatoryMap, categories, catModuleMap, modVideoMap])

  // ── Loading / Error ──────────────────────────────────────────
  if (loading) return (
    <main className="video-progress-main">
      <div className="vp-loading"><i className="fa-solid fa-spinner fa-spin"></i><span>Loading...</span></div>
    </main>
  )
  if (error) return (
    <main className="video-progress-main">
      <div className="vp-error">
        <i className="fa-solid fa-circle-exclamation"></i>
        <p>{error}</p>
        <button onClick={fetchAll}>Retry</button>
      </div>
    </main>
  )

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // DETAIL VIEW
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  if (view === 'detail' && selectedUser) {
    const ds   = detailStats
    const pct  = ds.total > 0 ? Math.round((ds.watched / ds.total) * 100) : 0
    const mPct = ds.mandatoryTotal > 0 ? Math.round((ds.mandatoryWatched / ds.mandatoryTotal) * 100) : 0
    const hasMandatory = (userMandatoryMap.get(selectedUser.id)?.size || 0) > 0

    return (
      <main className="video-progress-main">
        {/* Back + Export */}
        <div className="vpd-top-bar">
          <button className="vpd-back-btn" onClick={() => { setView('list'); setSelectedUser(null) }}>
            <i className="fa-solid fa-arrow-left"></i> Back to Users
          </button>
          <button className="vp-export-btn" onClick={handleExportUser} disabled={exporting} title="Export this user's report">
            <i className={`fa-solid ${exporting ? 'fa-spinner fa-spin' : 'fa-file-excel'}`}></i>
            {exporting ? 'Exporting…' : 'Export Report'}
          </button>
        </div>

        {/* User Card */}
        <div className="vpd-user-card">
          <div className="vpd-avatar">{selectedUser.full_name?.charAt(0).toUpperCase()}</div>
          <div className="vpd-user-info">
            <h2>{selectedUser.full_name}</h2>
            <p className="vpd-user-meta">
              <span><i className="fa-solid fa-id-badge"></i> {selectedUser.employee_id || 'No ID'}</span>
              <span><i className="fa-solid fa-building"></i> {selectedUser.deptName}</span>
              <span><i className="fa-solid fa-location-dot"></i> {selectedUser.branchName}</span>
            </p>
            <p className="vpd-email">{selectedUser.email}</p>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="vpd-stats-row">
          {/* Progress ring */}
          <div className="vpd-stat-card vpd-stat-ring-card">
            <div className="vpd-ring-wrapper">
              <svg className="vpd-ring" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.91" fill="none" stroke="#DDD6FE" strokeWidth="2.5" />
                <circle
                  cx="18" cy="18" r="15.91" fill="none"
                  stroke={progressColor(pct)} strokeWidth="2.5"
                  strokeDasharray={`${pct} ${100 - pct}`}
                  strokeDashoffset="25" strokeLinecap="round"
                  style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.4,0,0.2,1)' }}
                />
              </svg>
              <div className="vpd-ring-center">
                <span className="vpd-ring-pct" style={{ color: progressColor(pct) }}>{pct}%</span>
                <span className="vpd-ring-label-text">Overall</span>
              </div>
            </div>
          </div>

          <div className="vpd-stat-card">
            <i className="fa-solid fa-film vpd-stat-icon" style={{ color: '#3B82F6' }}></i>
            <div>
              <p className="vpd-stat-value" style={{ color: '#3B82F6' }}>{ds.total}</p>
              <p className="vpd-stat-label">Total Videos</p>
            </div>
          </div>
          <div className="vpd-stat-card">
            <i className="fa-solid fa-circle-check vpd-stat-icon" style={{ color: '#10B981' }}></i>
            <div>
              <p className="vpd-stat-value" style={{ color: '#10B981' }}>{ds.watched}</p>
              <p className="vpd-stat-label">Watched</p>
            </div>
          </div>
          <div className="vpd-stat-card">
            <i className="fa-solid fa-hourglass-half vpd-stat-icon" style={{ color: '#F59E0B' }}></i>
            <div>
              <p className="vpd-stat-value" style={{ color: '#F59E0B' }}>{ds.pending}</p>
              <p className="vpd-stat-label">Pending</p>
            </div>
          </div>
          {hasMandatory && (
            <div className="vpd-stat-card">
              <i className="fa-solid fa-star vpd-stat-icon" style={{ color: '#7C3AED' }}></i>
              <div>
                <p className="vpd-stat-value" style={{ color: '#7C3AED' }}>{mPct}%</p>
                <p className="vpd-stat-label">Mandatory Done</p>
                <p className="vpd-stat-sub">{ds.mandatoryWatched}/{ds.mandatoryTotal}</p>
              </div>
            </div>
          )}
        </div>

        {/* Section header + toggle */}
        <div className="vpd-filter-bar">
          <h3 className="vpd-section-title">
            <i className="fa-solid fa-list-check"></i> Video Breakdown by Category
          </h3>
          {hasMandatory && (
            <div className="vpd-toggle-group">
              <button className={`vpd-toggle-btn${!mandatoryOnly ? ' active' : ''}`} onClick={() => setMandatoryOnly(false)}>
                <i className="fa-solid fa-th-list"></i> All Modules
              </button>
              <button className={`vpd-toggle-btn${mandatoryOnly ? ' active' : ''}`} onClick={() => setMandatoryOnly(true)}>
                <i className="fa-solid fa-star"></i> Mandatory Only
              </button>
            </div>
          )}
        </div>

        {/* Category accordion */}
        {visibleDetail.length === 0 ? (
          <div className="vp-empty">
            <i className="fa-solid fa-folder-open"></i>
            <p>{mandatoryOnly ? 'No mandatory modules assigned to this user.' : 'No categories assigned to this department.'}</p>
          </div>
        ) : (
          <div className="vpd-accordion">
            {visibleDetail.map(cat => {
              const catPct = cat.totalVids > 0 ? Math.round((cat.watchedVids / cat.totalVids) * 100) : 0
              return (
                <div key={cat.id} className="vpd-category-block">
                  <div className="vpd-cat-header" onClick={() => toggleCat(cat.id)}>
                    <div className="vpd-cat-left">
                      <i className={`fa-solid fa-chevron-${expandedCategories[cat.id] ? 'down' : 'right'} vpd-chevron`}></i>
                      <i className="fa-solid fa-folder vpd-cat-icon"></i>
                      <span className="vpd-cat-name">{cat.name}</span>
                      <span className="vpd-cat-badge">{cat.modules.length} module{cat.modules.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="vpd-cat-stats">
                      <span className="vpd-cat-count">
                        <strong style={{ color: '#10B981' }}>{cat.watchedVids}</strong>
                        <span className="vpd-sep"> / </span>
                        <span>{cat.totalVids} videos</span>
                      </span>
                      <div className="vpd-mini-bar">
                        <div style={{ width: `${catPct}%`, background: progressColor(catPct) }}></div>
                      </div>
                      <span className="vpd-cat-pct" style={{ color: progressColor(catPct) }}>{catPct}%</span>
                    </div>
                  </div>

                  {expandedCategories[cat.id] && (
                    <div className="vpd-modules-list">
                      {cat.modules.map(mod => {
                        const modStatus = mod.watchedVids === mod.totalVids && mod.totalVids > 0 ? 'done'
                          : mod.watchedVids > 0 ? 'partial' : 'none'
                        return (
                          <div key={mod.id} className="vpd-module-block">
                            <div className="vpd-mod-header" onClick={() => toggleMod(mod.id)}>
                              <div className="vpd-mod-left">
                                <i className={`fa-solid fa-chevron-${expandedModules[mod.id] ? 'down' : 'right'} vpd-chevron-sm`}></i>
                                <i className="fa-solid fa-book-open vpd-mod-icon"></i>
                                <span className="vpd-mod-name">{mod.title}</span>
                                {mod.isMandatory && (
                                  <span className="vpd-mandatory-badge">
                                    <i className="fa-solid fa-star"></i> Mandatory
                                  </span>
                                )}
                              </div>
                              <div className="vpd-mod-stats">
                                <span className="vpd-mod-count">
                                  <strong style={{ color: '#10B981' }}>{mod.watchedVids}</strong>/{mod.totalVids}
                                </span>
                                <span className={`vpd-mod-pill ${modStatus}`}>
                                  {modStatus === 'done' ? 'Complete' : modStatus === 'partial' ? 'In Progress' : 'Not Started'}
                                </span>
                              </div>
                            </div>

                            {expandedModules[mod.id] && (
                              <div className="vpd-videos-table-wrap">
                                <table className="vpd-videos-table">
                                  <thead>
                                    <tr>
                                      <th>#</th>
                                      <th>Video Title</th>
                                      <th>Duration</th>
                                      <th>Watched</th>
                                      <th>Progress</th>
                                      <th>Status</th>
                                      <th>Last Watched</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {mod.videos.length === 0 ? (
                                      <tr><td colSpan={7} className="vpd-no-vids">No videos in this module</td></tr>
                                    ) : mod.videos.map((v, i) => (
                                      <tr key={v.id} className={`vpd-video-row${v.completed ? ' vpd-row-done' : ''}`}>
                                        <td className="vpd-vnum">{i + 1}</td>
                                        <td className="vpd-vtitle">
                                          <i
                                            className={`fa-solid fa-${v.completed ? 'circle-check' : v.watched > 0 ? 'circle-play' : 'circle'} vpd-vicon`}
                                            style={{ color: v.completed ? '#10B981' : v.watched > 0 ? '#3B82F6' : '#D1D5DB' }}
                                          ></i>
                                          {v.title}
                                        </td>
                                        <td className="vpd-vdur">{formatDur(v.total)}</td>
                                        <td className="vpd-vdur">{formatDur(v.watched)}</td>
                                        <td className="vpd-vprog">
                                          <div className="vpd-vbar">
                                            <div style={{ width: `${v.progress}%`, background: progressColor(v.progress) }}></div>
                                          </div>
                                          <span style={{ color: progressColor(v.progress), fontSize: '0.75rem', fontWeight: 600 }}>
                                            {v.progress}%
                                          </span>
                                        </td>
                                        <td>
                                          <span className={`vpd-vstatus ${v.completed ? 'done' : v.watched > 0 ? 'progress' : 'pending'}`}>
                                            {v.completed ? '✔ Done' : v.watched > 0 ? 'In Progress' : 'Pending'}
                                          </span>
                                        </td>
                                        <td className="vpd-vdate">{formatDate(v.lastWatched)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    )
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // LIST VIEW
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  return (
    <main className="video-progress-main">
      {/* Header */}
      <div className="vp-page-header">
        <div>
          <h2>Video Progress</h2>
          <p>User-wise video completion based on assigned categories</p>
        </div>
        <div className="vp-header-actions">
          <button className="vp-export-btn vp-quick-btn" onClick={handleQuickReport} disabled={quickExporting || filteredUsers.length === 0} title="Download Quick Summary Report">
            <i className={`fa-solid ${quickExporting ? 'fa-spinner fa-spin' : 'fa-bolt'}`}></i>
            {quickExporting ? 'Downloading…' : 'Quick Report'}
          </button>
          <button className="vp-export-btn" onClick={handleExportAll} disabled={exporting || filteredUsers.length === 0} title="Export All Users Report">
            <i className={`fa-solid ${exporting ? 'fa-spinner fa-spin' : 'fa-file-excel'}`}></i>
            {exporting ? 'Exporting…' : 'Export Report'}
          </button>
          <button className="vp-refresh-btn" onClick={fetchAll} title="Refresh">
            <i className="fa-solid fa-arrows-rotate"></i>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="vp-filters-card">
        <div className="vp-filters-grid">
          <div className="vp-search-input">
            <i className="fa-solid fa-magnifying-glass"></i>
            <input
              type="text"
              placeholder="Search by name / employee ID / email"
              value={searchUser}
              onChange={e => setSearchUser(e.target.value)}
            />
          </div>
          <div className="vp-select-wrapper">
            <select value={filterDept} onChange={e => setFilterDept(e.target.value)}>
              <option value="">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.department_name}</option>)}
            </select>
            <i className="fa-solid fa-chevron-down"></i>
          </div>
          <div className="vp-select-wrapper">
            <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)}>
              <option value="">All Branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.branch_name}</option>)}
            </select>
            <i className="fa-solid fa-chevron-down"></i>
          </div>
          {(searchUser || filterDept || filterBranch) && (
            <button className="vp-reset-btn" onClick={() => { setSearchUser(''); setFilterDept(''); setFilterBranch('') }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="vp-table-card">
        <div className="vp-table-header">
          <h3>All Users</h3>
          <span className="vp-record-badge">{filteredUsers.length} users</span>
        </div>
        {filteredUsers.length === 0 ? (
          <div className="vp-empty">
            <i className="fa-solid fa-users"></i>
            <p>No users found</p>
          </div>
        ) : (
          <>
            <div className="vp-table-scroll">
              <table className="vp-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Department</th>
                    <th>Branch</th>
                    <th>Total Videos</th>
                    <th>Watched</th>
                    <th>Pending</th>
                    <th>Progress</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.map(user => (
                    <tr key={user.id} className="vp-table-row">
                      <td>
                        <div className="vp-user-cell">
                          <div className="vp-avatar">{user.full_name?.charAt(0).toUpperCase()}</div>
                          <div>
                            <div className="vp-user-name">{user.full_name}</div>
                            <div className="vp-user-id">{user.employee_id || 'No ID'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="vp-cell-text">{user.deptName}</td>
                      <td className="vp-cell-text">{user.branchName}</td>
                      <td className="vp-cell-text">{user.totalVideos}</td>
                      <td><span style={{ color: '#10B981', fontWeight: 600 }}>{user.watchedVideos}</span></td>
                      <td>
                        <span style={{ color: user.pendingVideos > 0 ? '#F59E0B' : '#10B981', fontWeight: 600 }}>
                          {user.pendingVideos}
                        </span>
                      </td>
                      <td>
                        <div className="vp-progress-cell">
                          <div className="vp-progress-bar">
                            <div
                              className="vp-progress-fill"
                              style={{ width: `${user.progress}%`, background: progressColor(user.progress) }}
                            ></div>
                          </div>
                          <span className="vp-progress-text" style={{ color: progressColor(user.progress) }}>
                            {user.progress}%
                          </span>
                        </div>
                      </td>
                      <td>
                        <button className="vp-view-btn" onClick={() => openUser(user)}>
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="vp-pagination">
              <div className="vp-pagination-info">
                Showing <strong>{(listPage - 1) * PAGE_SIZE + 1}</strong>–<strong>{Math.min(listPage * PAGE_SIZE, filteredUsers.length)}</strong> of{' '}
                <strong>{filteredUsers.length}</strong>
              </div>
              <div className="vp-pagination-controls">
                <button className="vp-page-btn" disabled={listPage === 1} onClick={() => setListPage(p => p - 1)}>
                  <i className="fa-solid fa-chevron-left"></i>
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - listPage) <= 1)
                  .reduce((acc, p, i, arr) => {
                    if (i > 0 && p - arr[i - 1] > 1) acc.push('â€¦')
                    acc.push(p)
                    return acc
                  }, [])
                  .map((p, i) =>
                    typeof p === 'string'
                      ? <span key={`d${i}`} className="vp-page-dots">{p}</span>
                      : <button key={p} className={`vp-page-btn${listPage === p ? ' active' : ''}`} onClick={() => setListPage(p)}>{p}</button>
                  )}
                <button className="vp-page-btn" disabled={listPage === totalPages} onClick={() => setListPage(p => p + 1)}>
                  <i className="fa-solid fa-chevron-right"></i>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

export default VideoProgress
