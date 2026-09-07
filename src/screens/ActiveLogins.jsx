import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { cachedFetch, TTL } from '../utils/cacheDB'
import './ActiveLogins.css'

function ActiveLogins() {
  const mountedRef = useRef(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Data
  const [deviceTokens, setDeviceTokens] = useState([])
  const [otpVerifications, setOtpVerifications] = useState([])
  const [users, setUsers] = useState([])
  const [departments, setDepartments] = useState([])

  // Filters
  const [searchUser, setSearchUser] = useState('')
  const [filterPlatform, setFilterPlatform] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [filterDepartment, setFilterDepartment] = useState('')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  // Detail panel
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState(null)

  const toggleSidebar = useCallback(() => setSidebarOpen(prev => !prev), [])

  const breadcrumbItems = useMemo(() => [
    { label: 'Home', link: true },
    { label: 'Reports', link: false },
    { label: 'Active Logins', link: false }
  ], [])

  useEffect(() => {
    mountedRef.current = true
    fetchAllData()
    return () => { mountedRef.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchAllData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Helper to fetch all rows with pagination (Supabase defaults to 1000 row limit)
      const fetchAllRows = async (table, select, orderCol) => {
        const PAGE_SIZE = 1000
        let allData = []
        let from = 0
        let hasMore = true
        while (hasMore) {
          let query = supabase.from(table).select(select).range(from, from + PAGE_SIZE - 1)
          if (orderCol) query = query.order(orderCol, { ascending: false })
          const { data, error } = await query
          if (error) throw error
          if (data && data.length > 0) {
            allData = allData.concat(data)
            from += PAGE_SIZE
            hasMore = data.length === PAGE_SIZE
          } else {
            hasMore = false
          }
        }
        return allData
      }

      const [usersResponse, tokensResult, otpResult, departmentsResponse] = await Promise.all([
        cachedFetch('users_full_al', async () => {
          return await fetchAllRows('users', 'id, full_name, email, employee_id, phone, branch_id, role, department_id')
        }, TTL.MEDIUM),
        (async () => {
          return await fetchAllRows('user_device_tokens', '*', 'updated_at')
        })(),
        (async () => {
          return await fetchAllRows('otp_verifications', 'id, user_id, is_verified, verified_at, created_at', 'verified_at')
        })(),
        cachedFetch('departments_lookup', async () => {
          const { data, error } = await supabase
            .from('departments')
            .select('id, department_name')
            .order('department_name', { ascending: true })
          if (error) throw error
          return data || []
        }, TTL.LONG)
      ])

      if (!mountedRef.current) return

      const usersData = usersResponse?.data || usersResponse || []
      setUsers(Array.isArray(usersData) ? usersData : [])
      setDeviceTokens(Array.isArray(tokensResult) ? tokensResult : [])
      // Filter only verified OTP records
      const verifiedOtps = (Array.isArray(otpResult) ? otpResult : []).filter(o => o.is_verified === true && o.verified_at)
      setOtpVerifications(verifiedOtps)
      const deptData = departmentsResponse?.data || departmentsResponse || []
      setDepartments(Array.isArray(deptData) ? deptData : [])
    } catch (err) {
      console.error('Error fetching active logins:', err)
      if (mountedRef.current) setError(err.message)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  // Build enriched data grouped by unique user
  const enrichedData = useMemo(() => {
    const userMap = {}
    const safeUsers = Array.isArray(users) ? users : []
    safeUsers.forEach(u => { userMap[u.id] = u })

    // Group tokens by user_id
    const tokenGrouped = {}
    const safeTokens = Array.isArray(deviceTokens) ? deviceTokens : []
    safeTokens.forEach(token => {
      const uid = token.user_id || 'unknown'
      if (!tokenGrouped[uid]) tokenGrouped[uid] = []
      tokenGrouped[uid].push(token)
    })

    // Group OTP verifications by user_id
    const otpGrouped = {}
    const safeOtps = Array.isArray(otpVerifications) ? otpVerifications : []
    safeOtps.forEach(otp => {
      const uid = otp.user_id || 'unknown'
      if (!otpGrouped[uid]) otpGrouped[uid] = []
      otpGrouped[uid].push(otp)
    })

    // Collect all unique user IDs from both sources
    const allUserIds = new Set([
      ...Object.keys(tokenGrouped),
      ...Object.keys(otpGrouped)
    ])

    // Build one entry per unique user
    return [...allUserIds]
      .filter(uid => uid !== 'unknown' && userMap[uid])
      .map(uid => {
      const user = userMap[uid] || {}
      const deviceSessions = tokenGrouped[uid] || []
      const otpLogins = otpGrouped[uid] || []

      // Sort device sessions by updated_at descending
      deviceSessions.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      // Sort OTP logins by verified_at descending
      otpLogins.sort((a, b) => new Date(b.verified_at) - new Date(a.verified_at))

      // Collect unique platforms from device tokens
      const userPlatforms = [...new Set(deviceSessions.map(s => s.platform).filter(Boolean))]

      // Determine latest activity across both sources
      const latestDeviceTime = deviceSessions.length > 0 ? new Date(deviceSessions[0].updated_at) : null
      const latestOtpTime = otpLogins.length > 0 ? new Date(otpLogins[0].verified_at) : null
      let latestTime = null
      if (latestDeviceTime && latestOtpTime) latestTime = latestDeviceTime > latestOtpTime ? latestDeviceTime : latestOtpTime
      else latestTime = latestDeviceTime || latestOtpTime

      const latestPlatform = deviceSessions.length > 0 ? deviceSessions[0].platform : (otpLogins.length > 0 ? 'OTP Login' : null)

      return {
        user_id: uid,
        full_name: user.full_name || 'Unknown User',
        email: user.email || '-',
        employee_id: user.employee_id || '-',
        phone: user.phone || '-',
        role: user.role || '-',
        department_id: user.department_id || null,
        platform: latestPlatform,
        platforms: userPlatforms.length > 0 ? userPlatforms : (otpLogins.length > 0 ? ['OTP Login'] : []),
        updated_at: latestTime ? latestTime.toISOString() : null,
        sessions: deviceSessions,
        otpLogins: otpLogins,
        deviceCount: deviceSessions.length,
        loginCount: otpLogins.length,
        id: uid,
      }
    }).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
  }, [deviceTokens, otpVerifications, users])

  // Get unique platforms
  const platforms = useMemo(() => {
    const set = new Set()
    const safeTokens = Array.isArray(deviceTokens) ? deviceTokens : []
    safeTokens.forEach(t => { if (t.platform) set.add(t.platform) })
    return [...set].sort()
  }, [deviceTokens])

  // KPI stats
  const stats = useMemo(() => {
    const safeTokens = Array.isArray(deviceTokens) ? deviceTokens : []
    const safeOtps = Array.isArray(otpVerifications) ? otpVerifications : []
    const totalDevices = safeTokens.length
    const totalOtpLogins = safeOtps.length
    const uniqueUsers = enrichedData.length
    const platformCounts = {}
    safeTokens.forEach(d => {
      const p = d.platform || 'Unknown'
      platformCounts[p] = (platformCounts[p] || 0) + 1
    })
    if (totalOtpLogins > 0) platformCounts['OTP'] = totalOtpLogins
    const topPlatform = Object.entries(platformCounts).sort((a, b) => b[1] - a[1])[0]

    // Login today — unique users who have at least one session or OTP login today
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const loginToday = enrichedData.filter(d => {
      const hasDeviceToday = d.sessions.some(s => new Date(s.updated_at) >= today)
      const hasOtpToday = d.otpLogins?.some(o => new Date(o.verified_at) >= today)
      return hasDeviceToday || hasOtpToday
    }).length

    return { totalDevices, totalOtpLogins, uniqueUsers, topPlatform: topPlatform ? topPlatform[0] : '-', loginToday }
  }, [enrichedData, deviceTokens, otpVerifications])

  // Apply filters
  const filteredData = useMemo(() => {
    let data = [...enrichedData]

    if (searchUser.trim()) {
      const q = searchUser.toLowerCase()
      data = data.filter(d =>
        d.full_name.toLowerCase().includes(q) ||
        d.email.toLowerCase().includes(q) ||
        (d.employee_id && d.employee_id.toLowerCase().includes(q))
      )
    }

    if (filterPlatform) {
      data = data.filter(d => d.platform === filterPlatform)
    }

    if (filterDepartment) {
      data = data.filter(d => d.department_id && d.department_id.toString() === filterDepartment)
    }

    if (filterDate) {
      const now = new Date()
      let startDate = null
      let endDate = null

      if (filterDate === 'today') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      } else if (filterDate === 'yesterday') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      } else if (filterDate === 'this_week') {
        const day = now.getDay()
        const diff = now.getDate() - day + (day === 0 ? -6 : 1)
        startDate = new Date(now.getFullYear(), now.getMonth(), diff)
      } else if (filterDate === 'this_month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      } else if (filterDate === 'custom') {
        if (customDateFrom) startDate = new Date(customDateFrom)
        if (customDateTo) {
          endDate = new Date(customDateTo)
          endDate.setHours(23, 59, 59, 999)
        }
      }

      if (startDate) {
        data = data.filter(d => {
          const dt = new Date(d.updated_at)
          if (endDate) return dt >= startDate && dt <= endDate
          return dt >= startDate
        })
      }
    }

    return data
  }, [enrichedData, searchUser, filterPlatform, filterDepartment, filterDate, customDateFrom, customDateTo])

  // Pagination
  const totalPages = Math.ceil(filteredData.length / pageSize)
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredData.slice(start, start + pageSize)
  }, [filteredData, currentPage])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchUser, filterPlatform, filterDepartment, filterDate, customDateFrom, customDateTo])

  // Reset filters
  const resetFilters = () => {
    setSearchUser('')
    setFilterPlatform('')
    setFilterDepartment('')
    setFilterDate('')
    setCustomDateFrom('')
    setCustomDateTo('')
  }

  // CSV Export
  const exportCSV = () => {
    if (filteredData.length === 0) return
    const headers = ['User Name', 'Email', 'Employee ID', 'Platform', 'Devices', 'Last Active']
    const rows = filteredData.map(d => [
      d.full_name,
      d.email,
      d.employee_id,
      d.platforms ? d.platforms.join(', ') : 'Unknown',
      d.deviceCount,
      d.updated_at ? new Date(d.updated_at).toLocaleString() : '-'
    ])
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `active_logins_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const formatTime = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  }

  const timeAgo = (dateStr) => {
    if (!dateStr) return '-'
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 7) return `${days}d ago`
    return formatDate(dateStr)
  }

  const getInitials = (name) => {
    if (!name || name === 'Unknown User') return '?'
    const parts = name.split(' ')
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    return parts[0][0].toUpperCase()
  }

  const getPlatformIcon = (platform) => {
    if (!platform) return 'fa-solid fa-mobile-screen'
    const p = platform.toLowerCase()
    if (p === 'android') return 'fa-brands fa-android'
    if (p === 'ios' || p === 'iphone') return 'fa-brands fa-apple'
    if (p === 'web') return 'fa-solid fa-globe'
    return 'fa-solid fa-mobile-screen'
  }

  const getPlatformColor = (platform) => {
    if (!platform) return '#94A3B8'
    const p = platform.toLowerCase()
    if (p === 'android') return '#3DDC84'
    if (p === 'ios' || p === 'iphone') return '#007AFF'
    if (p === 'web') return '#F59E0B'
    return '#94A3B8'
  }

  const isActiveRecently = (dateStr) => {
    if (!dateStr) return false
    const diff = Date.now() - new Date(dateStr).getTime()
    return diff < 24 * 60 * 60 * 1000 // Active within 24h
  }

  // Pagination helpers
  const getPageNumbers = () => {
    const pages = []
    const maxVisible = 5
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2))
    let end = Math.min(totalPages, start + maxVisible - 1)
    if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1)

    if (start > 1) { pages.push(1); if (start > 2) pages.push('...') }
    for (let i = start; i <= end; i++) pages.push(i)
    if (end < totalPages) { if (end < totalPages - 1) pages.push('...'); pages.push(totalPages) }
    return pages
  }

  // Open detail panel
  const openDetail = (record) => {
    setSelectedRecord(record)
    setDetailOpen(true)
  }

  return (
    <>
        <div className="al-content">
          {/* Page Header */}
          <div className="al-page-header">
            <div>
              <h2>Active Login Report</h2>
              <p>Monitor users currently logged in across devices</p>
            </div>
            <div className="al-header-actions">
              <span className="al-last-updated">
                {!loading && `${filteredData.length} record${filteredData.length !== 1 ? 's' : ''}`}
              </span>
              <button className="al-refresh-btn" onClick={fetchAllData} title="Refresh">
                <i className={`fa-solid fa-arrows-rotate ${loading ? 'fa-spin' : ''}`}></i>
              </button>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="al-kpi-row">
            <div className="al-kpi-card">
              <div className="al-kpi-icon" style={{ background: '#F0FDF4', color: '#22C55E' }}>
                <i className="fa-solid fa-users"></i>
              </div>
              <div>
                <p className="al-kpi-label">Unique Users</p>
                <h3 className="al-kpi-value">{stats.uniqueUsers}</h3>
              </div>
            </div>
            <div className="al-kpi-card">
              <div className="al-kpi-icon" style={{ background: '#EFF6FF', color: '#3B82F6' }}>
                <i className="fa-solid fa-mobile-screen"></i>
              </div>
              <div>
                <p className="al-kpi-label">Total Devices</p>
                <h3 className="al-kpi-value">{stats.totalDevices}</h3>
              </div>
            </div>
            <div className="al-kpi-card">
              <div className="al-kpi-icon" style={{ background: '#FAF5FF', color: '#8B5CF6' }}>
                <i className="fa-solid fa-key"></i>
              </div>
              <div>
                <p className="al-kpi-label">OTP Logins</p>
                <h3 className="al-kpi-value">{stats.totalOtpLogins}</h3>
              </div>
            </div>
            <div className="al-kpi-card">
              <div className="al-kpi-icon" style={{ background: '#FFF7ED', color: '#F59E0B' }}>
                <i className="fa-solid fa-bolt"></i>
              </div>
              <div>
                <p className="al-kpi-label">Login Today</p>
                <h3 className="al-kpi-value">{stats.loginToday}</h3>
              </div>
            </div>
            <div className="al-kpi-card">
              <div className="al-kpi-icon" style={{ background: '#FFF1F2', color: '#F43F5E' }}>
                <i className="fa-solid fa-trophy"></i>
              </div>
              <div>
                <p className="al-kpi-label">Top Platform</p>
                <h3 className="al-kpi-value" style={{ textTransform: 'capitalize' }}>{stats.topPlatform}</h3>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="al-filters-card">
            <div className="al-filters-header">
              <h3><i className="fa-solid fa-filter"></i> Filters</h3>
              <button className="al-reset-btn" onClick={resetFilters}>Reset All</button>
            </div>
            <div className="al-filters-grid">
              <div className="al-search-input">
                <i className="fa-solid fa-magnifying-glass"></i>
                <input
                  type="text"
                  placeholder="Search by name, email, or ID..."
                  value={searchUser}
                  onChange={e => setSearchUser(e.target.value)}
                />
              </div>
              <div className="al-select-wrapper">
                <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)}>
                  <option value="">All Platforms</option>
                  {platforms.map(p => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
                <i className="fa-solid fa-chevron-down"></i>
              </div>
              <div className="al-select-wrapper">
                <select value={filterDepartment} onChange={e => setFilterDepartment(e.target.value)}>
                  <option value="">All Departments</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>{dept.department_name}</option>
                  ))}
                </select>
                <i className="fa-solid fa-chevron-down"></i>
              </div>
              <div className="al-select-wrapper">
                <select value={filterDate} onChange={e => setFilterDate(e.target.value)}>
                  <option value="">All Time</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="this_week">This Week</option>
                  <option value="this_month">This Month</option>
                  <option value="custom">Custom Range</option>
                </select>
                <i className="fa-solid fa-chevron-down"></i>
              </div>
              <div className="al-filter-actions">
                <button className="al-export-btn" onClick={exportCSV} disabled={filteredData.length === 0}>
                  <i className="fa-solid fa-download"></i> Export CSV
                </button>
              </div>
            </div>
            {filterDate === 'custom' && (
              <div className="al-custom-date-row">
                <div className="al-date-input">
                  <label>From</label>
                  <input type="date" value={customDateFrom} onChange={e => setCustomDateFrom(e.target.value)} />
                </div>
                <div className="al-date-input">
                  <label>To</label>
                  <input type="date" value={customDateTo} onChange={e => setCustomDateTo(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          {/* Data Table */}
          <div className="al-table-card">
            <div className="al-table-header">
              <h3>Login Sessions</h3>
              <span className="al-record-badge">
                {filteredData.length} record{filteredData.length !== 1 ? 's' : ''}
              </span>
            </div>

            {loading ? (
              <div className="al-loading">
                <i className="fa-solid fa-spinner fa-spin"></i>
                <span>Loading active logins...</span>
              </div>
            ) : error ? (
              <div className="al-error">
                <i className="fa-solid fa-circle-exclamation"></i>
                <span>Error: {error}</span>
                <button onClick={fetchAllData}>Retry</button>
              </div>
            ) : filteredData.length === 0 ? (
              <div className="al-empty">
                <i className="fa-solid fa-mobile-screen-button"></i>
                <span>No active login records found</span>
                <button onClick={resetFilters}>Clear Filters</button>
              </div>
            ) : (
              <>
                <div className="al-table-scroll">
                  <table className="al-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>User</th>
                        <th>Platform</th>
                        <th>Logins</th>
                        <th>Last Active</th>
                        <th>Status</th>
                        <th className="action-col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedData.map((record, idx) => {
                        const active = isActiveRecently(record.updated_at)
                        return (
                          <tr key={record.user_id} className="al-table-row">
                            <td className="al-cell-text" style={{ color: '#94A3B8' }}>
                              {(currentPage - 1) * pageSize + idx + 1}
                            </td>
                            <td>
                              <div className="al-user-cell">
                                <div className="al-avatar">
                                  {getInitials(record.full_name)}
                                </div>
                                <div>
                                  <div className="al-user-name">{record.full_name}</div>
                                  <div className="al-user-id">{record.email}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                {record.platforms.map(p => (
                                  <span key={p} className="al-platform-badge" style={{ borderColor: getPlatformColor(p) + '40', background: getPlatformColor(p) + '10' }}>
                                    <i className={getPlatformIcon(p)} style={{ color: getPlatformColor(p) }}></i>
                                    <span style={{ color: getPlatformColor(p) }}>
                                      {p.charAt(0).toUpperCase() + p.slice(1)}
                                    </span>
                                  </span>
                                ))}
                                {record.platforms.length === 0 && (
                                  <span className="al-platform-badge" style={{ borderColor: '#94A3B840', background: '#94A3B810' }}>
                                    <span style={{ color: '#94A3B8' }}>Unknown</span>
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                                {record.deviceCount > 0 && (
                                  <span className="al-device-count" title="Device tokens">
                                    <i className="fa-solid fa-mobile-screen" style={{ fontSize: '0.65rem', marginRight: '3px' }}></i>{record.deviceCount}
                                  </span>
                                )}
                                {record.loginCount > 0 && (
                                  <span className="al-device-count al-otp-count" title="OTP logins">
                                    <i className="fa-solid fa-key" style={{ fontSize: '0.65rem', marginRight: '3px' }}></i>{record.loginCount}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              <div className="al-cell-text">{formatDate(record.updated_at)}</div>
                              <span className="al-time-sub">{formatTime(record.updated_at)}</span>
                            </td>
                            <td>
                              <span className={`al-status-badge ${active ? 'status-active' : 'status-inactive'}`}>
                                <span className="al-status-dot"></span>
                                {active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button className="al-view-btn" onClick={() => openDetail(record)}>
                                <i className="fa-solid fa-eye"></i> View
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="al-pagination">
                    <span className="al-pagination-info">
                      Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredData.length)} of {filteredData.length}
                    </span>
                    <div className="al-pagination-controls">
                      <button className="al-page-btn" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                        <i className="fa-solid fa-chevron-left"></i>
                      </button>
                      {getPageNumbers().map((p, i) =>
                        p === '...' ? (
                          <span key={`dot-${i}`} className="al-page-dots">...</span>
                        ) : (
                          <button key={p} className={`al-page-btn ${currentPage === p ? 'active' : ''}`} onClick={() => setCurrentPage(p)}>
                            {p}
                          </button>
                        )
                      )}
                      <button className="al-page-btn" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                        <i className="fa-solid fa-chevron-right"></i>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

      {/* Detail Slide-over */}
      {detailOpen && selectedRecord && (
        <div className="al-detail-overlay" onClick={() => setDetailOpen(false)}>
          <div className="al-detail-panel" onClick={e => e.stopPropagation()}>
            <div className="al-detail-header">
              <h2>Login Details</h2>
              <button className="al-detail-close" onClick={() => setDetailOpen(false)}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="al-detail-body">
              {/* User Profile */}
              <div className="al-detail-profile">
                <div className="al-detail-avatar">
                  {getInitials(selectedRecord.full_name)}
                </div>
                <div>
                  <h3>{selectedRecord.full_name}</h3>
                  <p>{selectedRecord.email}</p>
                </div>
              </div>

              {/* User Info */}
              <div className="al-detail-info-card">
                <h4>User Information</h4>
                <div className="al-detail-info-grid">
                  <div>
                    <span className="al-detail-label">Employee ID</span>
                    <span className="al-detail-value">{selectedRecord.employee_id}</span>
                  </div>
                  <div>
                    <span className="al-detail-label">Role</span>
                    <span className="al-detail-value" style={{ textTransform: 'capitalize' }}>{selectedRecord.role}</span>
                  </div>
                  <div>
                    <span className="al-detail-label">Phone</span>
                    <span className="al-detail-value">{selectedRecord.phone}</span>
                  </div>
                  <div>
                    <span className="al-detail-label">Total Devices</span>
                    <span className="al-detail-value">{selectedRecord.deviceCount}</span>
                  </div>
                  <div>
                    <span className="al-detail-label">OTP Logins</span>
                    <span className="al-detail-value">{selectedRecord.loginCount || 0}</span>
                  </div>
                </div>
              </div>

              {/* OTP Login History */}
              {selectedRecord.otpLogins?.length > 0 && (
                <div className="al-detail-info-card">
                  <h4><i className="fa-solid fa-key" style={{ marginRight: '0.4rem', color: '#8B5CF6' }}></i>OTP Login History ({selectedRecord.otpLogins.length} logins)</h4>
                  <div className="al-login-history">
                    {selectedRecord.otpLogins.map((otp, idx) => (
                      <div key={otp.id || idx} className="al-history-item">
                        <div className="al-history-dot-line">
                          <span className={`al-history-dot ${idx === 0 ? 'latest' : ''}`} style={{ background: idx === 0 ? '#8B5CF6' : undefined }}></span>
                          {idx < selectedRecord.otpLogins.length - 1 && <span className="al-history-line"></span>}
                        </div>
                        <div className="al-history-content">
                          <div className="al-history-date">
                            <i className="fa-regular fa-calendar"></i>
                            {formatDate(otp.verified_at)} at {formatTime(otp.verified_at)}
                          </div>
                          <div className="al-history-meta">
                            <span className="al-platform-badge" style={{ borderColor: '#8B5CF640', background: '#8B5CF610', fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}>
                              <i className="fa-solid fa-shield-check" style={{ color: '#8B5CF6', fontSize: '0.7rem' }}></i>
                              <span style={{ color: '#8B5CF6' }}>OTP Verified</span>
                            </span>
                            <span className="al-history-ago">{timeAgo(otp.verified_at)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Device Login History */}
              {selectedRecord.sessions?.length > 0 && (
                <div className="al-detail-info-card">
                  <h4><i className="fa-solid fa-mobile-screen" style={{ marginRight: '0.4rem', color: '#3B82F6' }}></i>Device Sessions ({selectedRecord.sessions.length})</h4>
                  <div className="al-login-history">
                    {selectedRecord.sessions.map((session, idx) => (
                      <div key={session.id || idx} className="al-history-item">
                        <div className="al-history-dot-line">
                          <span className={`al-history-dot ${idx === 0 ? 'latest' : ''}`}></span>
                          {idx < selectedRecord.sessions.length - 1 && <span className="al-history-line"></span>}
                        </div>
                        <div className="al-history-content">
                          <div className="al-history-date">
                            <i className="fa-regular fa-calendar"></i>
                            {formatDate(session.updated_at)} at {formatTime(session.updated_at)}
                          </div>
                          <div className="al-history-meta">
                            <span className="al-platform-badge" style={{ borderColor: getPlatformColor(session.platform) + '40', background: getPlatformColor(session.platform) + '10', fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}>
                              <i className={getPlatformIcon(session.platform)} style={{ color: getPlatformColor(session.platform), fontSize: '0.7rem' }}></i>
                              <span style={{ color: getPlatformColor(session.platform) }}>
                                {session.platform ? session.platform.charAt(0).toUpperCase() + session.platform.slice(1) : 'Unknown'}
                              </span>
                            </span>
                            <span className="al-history-ago">{timeAgo(session.updated_at)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default ActiveLogins
