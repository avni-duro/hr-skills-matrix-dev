import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { cachedFetch, cacheSet, cacheGet, TTL } from '../utils/cacheDB'
import './Dashboard.css'

function Dashboard() {
  const mountedRef = useRef(true)
  const chartsRef = useRef([])
  const weeklyChartRef = useRef(null)
  const moduleChartRef = null // removed
  const userStatusChartRef = useRef(null)
  
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalModules: 0,
    totalVideos: 0,
    totalAssessments: 0,
    loading: true
  })
  const [weeklySignups, setWeeklySignups] = useState([])
  const [chartsReady, setChartsReady] = useState(false)

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev)
  }, [])

  const breadcrumbItems = useMemo(() => [
    { label: 'Home', link: true },
    { label: 'Dashboard', link: false }
  ], [])

  // ✅ Load stats first (FAST) - show UI immediately
  useEffect(() => {
    mountedRef.current = true
    
    console.log('[Dashboard] Loading stats (fast initial load)...')
    
    // Try to use IndexedDB cached stats
    const loadStats = async () => {
      const cached = await cacheGet('dashboardStats')
      if (cached && mountedRef.current) {
        console.log('[Dashboard] Using cached stats from IndexedDB')
        setStats({ ...cached, loading: false })
        // Still refresh in background
        fetchStats()
        return
      }
      fetchStats()
    }
    loadStats()
    
    return () => {
      mountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ✅ Load charts AFTER page render (DEFERRED)
  useEffect(() => {
    if (stats.loading) return
    
    console.log('[Dashboard] Scheduling deferred chart data load...')
    
    const timer = setTimeout(() => {
      if (mountedRef.current) {
        console.log('[Dashboard] Loading chart data (deferred)...')
        Promise.all([fetchWeeklySignups()]).then(() => {
          console.log('[Dashboard] Chart data loaded')
        })
      }
    }, 300) // Small delay to not block initial render
    
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.loading])

  // ✅ Wait for Highcharts (loaded via index.html) before initializing charts
  useEffect(() => {
    if (chartsReady) return

    let isMounted = true
    let attempts = 0
    let timerId

    const checkHighcharts = () => {
      if (!isMounted) return
      if (typeof window.Highcharts !== 'undefined') {
        console.log('[Dashboard] Highcharts available')
        setChartsReady(true)
        return
      }

      attempts += 1
      if (attempts < 50) {
        timerId = setTimeout(checkHighcharts, 100)
      } else {
        console.error('Highcharts not available after waiting')
      }
    }

    checkHighcharts()

    return () => {
      isMounted = false
      if (timerId) clearTimeout(timerId)
    }
  }, [chartsReady])

  // Initialize charts when Highcharts is ready AND chart data is available
  useEffect(() => {
    if (stats.loading || !chartsReady || !weeklySignups.length) return
    
    console.log('[Dashboard] Initializing charts...')
    
    const timer = setTimeout(() => {
      if (mountedRef.current && typeof window.Highcharts !== 'undefined') {
        try {
          initializeCharts()
        } catch (error) {
          console.error('Failed to initialize charts:', error)
        }
      }
    }, 100)
    
    chartsRef.current.push(timer)
    
    return () => {
      clearTimeout(timer)
      // Cleanup charts on unmount
      try {
        if (weeklyChartRef.current) {
          weeklyChartRef.current.destroy()
          weeklyChartRef.current = null
        }
        if (userStatusChartRef.current) {
          userStatusChartRef.current.destroy()
          userStatusChartRef.current = null
        }
      } catch (e) {
        // Silently fail
      }
    }
  }, [stats.loading, chartsReady, weeklySignups.length])

  const fetchWeeklySignups = async () => {
    try {
      console.log('[Dashboard] Fetching weekly signups...')
      
      // ✅ Try to use SQL RPC first (much faster - aggregates on server)
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_weekly_signups')
        
        if (!rpcError && rpcData) {
          console.log('[Dashboard] Using RPC for weekly signups (server-aggregated)')
          const weekCounts = [0, 0, 0, 0, 0, 0, 0]
          rpcData.forEach(row => {
            if (row.week_index >= 0 && row.week_index < 7) {
              weekCounts[row.week_index] = Number(row.count) || 0
            }
          })
          
          if (mountedRef.current) {
            setWeeklySignups(weekCounts)
            console.log('[Dashboard] Weekly signups loaded:', weekCounts)
          }
          return
        }
      } catch (rpcError) {
        console.log('[Dashboard] RPC not available, using client-side aggregation')
      }

      // Fallback: Client-side aggregation (slower but works without RPC)
      const weeksAgo = new Date()
      weeksAgo.setDate(weeksAgo.getDate() - 49) // 7 weeks = 49 days

      // Only select created_at field to minimize data transfer
      const { data, error } = await supabase
        .from('users')
        .select('created_at')
        .gte('created_at', weeksAgo.toISOString())
        .order('created_at', { ascending: true })
        .limit(1000) // Limit to prevent excessive data loading

      if (error) {
        // Set default data if error
        if (mountedRef.current) {
          setWeeklySignups([0, 0, 0, 0, 0, 0, 0])
        }
        return
      }

      // Group signups by week (client-side)
      const weekCounts = [0, 0, 0, 0, 0, 0, 0]
      const now = new Date()

      data.forEach(user => {
        const signupDate = new Date(user.created_at)
        const daysAgo = Math.floor((now - signupDate) / (1000 * 60 * 60 * 24))
        const weekIndex = Math.floor(daysAgo / 7)
        
        if (weekIndex >= 0 && weekIndex < 7) {
          weekCounts[6 - weekIndex]++ // Reverse order so newest is last
        }
      })

      if (mountedRef.current) {
        setWeeklySignups(weekCounts)
        console.log('[Dashboard] Weekly signups loaded (client-side):', weekCounts)
      }
    } catch (error) {
      console.error('[Dashboard] Error fetching weekly signups:', error)
      if (mountedRef.current) {
        setWeeklySignups([0, 0, 0, 0, 0, 0, 0])
      }
    }
  }

  const fetchStats = async () => {
    try {
      console.log('[Dashboard] Fetching stats...')
      // Fetch only counts using estimated count for faster performance
      // Using count: 'estimated' is much faster than 'exact' for large tables
      const [usersRes, modulesRes, videosRes, quizzesRes] = await Promise.all([
        supabase.from('users').select('*', { count: 'estimated', head: true }),
        supabase.from('modules').select('*', { count: 'estimated', head: true }),
        supabase.from('videos').select('*', { count: 'estimated', head: true }),
        supabase.from('quizzes').select('*', { count: 'estimated', head: true })
      ])

      if (usersRes.error) console.error('Error fetching users count:', usersRes.error)
      if (modulesRes.error) console.error('Error fetching modules count:', modulesRes.error)
      if (videosRes.error) console.error('Error fetching videos count:', videosRes.error)
      if (quizzesRes.error) console.error('Error fetching assessments count:', quizzesRes.error)

      if (mountedRef.current) {
        const newStats = {
          totalUsers: usersRes.count || 0,
          totalModules: modulesRes.count || 0,
          totalVideos: videosRes.count || 0,
          totalAssessments: quizzesRes.count || 0,
          loading: false
        }
        
        // Cache stats in IndexedDB for next page load
        cacheSet('dashboardStats', newStats, TTL.SHORT).catch(() => {})
        
        setStats(newStats)
        console.log('[Dashboard] Stats loaded:', newStats)
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
      if (mountedRef.current) {
        setStats(prev => ({ ...prev, loading: false }))
      }
    }
  }

  const initializeCharts = () => {
    const Highcharts = window.Highcharts
    if (!mountedRef.current || typeof Highcharts === 'undefined') return
    
    try {
      // Destroy existing charts before creating new ones
      if (weeklyChartRef.current) {
        weeklyChartRef.current.destroy()
        weeklyChartRef.current = null
      }
      if (userStatusChartRef.current) {
        userStatusChartRef.current.destroy()
        userStatusChartRef.current = null
      }

      // Get week labels based on current date
      const getWeekLabels = () => {
        const labels = []
        const now = new Date()
        for (let i = 6; i >= 0; i--) {
          const weekDate = new Date(now)
          weekDate.setDate(weekDate.getDate() - (i * 7))
          const month = weekDate.toLocaleString('en-US', { month: 'short' })
          const day = weekDate.getDate()
          labels.push(`${month} ${day}`)
        }
        return labels
      }

      // Weekly User Signups Chart
      weeklyChartRef.current = Highcharts.chart('weekly-signups-chart', {
        chart: { type: 'area', backgroundColor: 'transparent' },
        title: { text: null },
        credits: { enabled: false },
        xAxis: {
          categories: getWeekLabels(),
          labels: { style: { color: '#6B7280' } }
        },
        yAxis: {
          title: { text: null },
          labels: { style: { color: '#6B7280' } },
          allowDecimals: false
        },
        legend: { enabled: false },
        tooltip: {
          shared: true,
          headerFormat: '<b>{point.x}</b><br/>',
          pointFormat: '{series.name}: {point.y}<br/>'
        },
        plotOptions: {
          area: {
            fillColor: {
              linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
              stops: [
                [0, 'rgba(79, 70, 229, 0.3)'],
                [1, 'rgba(79, 70, 229, 0)']
              ]
            },
            marker: { radius: 2 },
            lineWidth: 2,
            states: { hover: { lineWidth: 3 } },
            threshold: null
          }
        },
        series: [{
          name: 'New Users',
          data: weeklySignups.length > 0 ? weeklySignups : [0, 0, 0, 0, 0, 0, 0],
          color: '#4F46E5'
        }]
      })

      // User Status Chart
      userStatusChartRef.current = Highcharts.chart('user-status-chart', {
        chart: { type: 'pie', backgroundColor: 'transparent' },
        title: { text: null },
        credits: { enabled: false },
        tooltip: { pointFormat: '<b>{point.percentage:.1f}%</b>' },
        plotOptions: {
          pie: {
            innerSize: '60%',
            dataLabels: { enabled: false },
            showInLegend: true,
            borderWidth: 0
          }
        },
        legend: {
          align: 'right',
          verticalAlign: 'middle',
          layout: 'vertical',
          itemStyle: { color: '#4B5563', fontWeight: 'normal' }
        },
        series: [{
          name: 'Users',
          data: [
            { name: 'Active', y: 82, color: '#10B981' },
            { name: 'Inactive', y: 18, color: '#F59E0B' }
          ]
        }]
      })
    } catch (error) {
      console.error('Error initializing charts:', error)
    }
  }

  return (
        <main className="dashboard-main">
          {/* Dashboard Header */}
          <section className="dashboard-header">
            <div>
              <h2>Platform Overview</h2>
              <p>Welcome back, here's a summary of DuroAcademy.</p>
            </div>
          </section>

          {/* Metric Cards */}
          <section className="metric-cards">
            <div className="metric-card">
              <div className="metric-content">
                <p className="metric-label">Total Users</p>
                <p className="metric-value">
                  {stats.loading ? (
                    <i className="fa-solid fa-spinner fa-spin"></i>
                  ) : (
                    stats.totalUsers.toLocaleString()
                  )}
                </p>
                <p className="metric-change positive">
                  <i className="fa-solid fa-users"></i> Registered users
                </p>
              </div>
              <div className="metric-icon indigo">
                <i className="fa-solid fa-users"></i>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-content">
                <p className="metric-label">Total Modules</p>
                <p className="metric-value">
                  {stats.loading ? (
                    <i className="fa-solid fa-spinner fa-spin"></i>
                  ) : (
                    stats.totalModules.toLocaleString()
                  )}
                </p>
                <p className="metric-change positive">
                  <i className="fa-solid fa-puzzle-piece"></i> Learning modules
                </p>
              </div>
              <div className="metric-icon blue">
                <i className="fa-solid fa-puzzle-piece"></i>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-content">
                <p className="metric-label">Total Videos</p>
                <p className="metric-value">
                  {stats.loading ? (
                    <i className="fa-solid fa-spinner fa-spin"></i>
                  ) : (
                    stats.totalVideos.toLocaleString()
                  )}
                </p>
                <p className="metric-change positive">
                  <i className="fa-solid fa-video"></i> Video content
                </p>
              </div>
              <div className="metric-icon green">
                <i className="fa-solid fa-video"></i>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-content">
                <p className="metric-label">Assessments</p>
                <p className="metric-value">
                  {stats.loading ? (
                    <i className="fa-solid fa-spinner fa-spin"></i>
                  ) : (
                    stats.totalAssessments.toLocaleString()
                  )}
                </p>
                <p className="metric-change positive">
                  <i className="fa-solid fa-clipboard-question"></i> Total quizzes
                </p>
              </div>
              <div className="metric-icon orange">
                <i className="fa-solid fa-clipboard-question"></i>
              </div>
            </div>
          </section>

          {/* Charts Section - ✅ Don't block UI on chart data */}
          {!stats.loading ? (
            <section className="charts-section">
              <div className="chart-large">
                <h3>Weekly User Signups</h3>
                {weeklySignups.length > 0 ? (
                  <div id="weekly-signups-chart" className="chart-container"></div>
                ) : (
                  <div className="chart-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', color: '#9CA3AF' }}>
                    <p>Loading chart...</p>
                  </div>
                )}
              </div>

              <div className="charts-side">
                <div className="chart-small">
                  <h3>User Status</h3>
                  <div id="user-status-chart" className="chart-container-small"></div>
                </div>
              </div>
            </section>
          ) : (
            <section className="charts-section" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              minHeight: '400px',
              color: '#6B7280'
            }}>
              <div style={{ textAlign: 'center' }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '32px', marginBottom: '12px' }}></i>
                <p>Loading charts...</p>
              </div>
            </section>
          )}
        </main>
  )
}

export default Dashboard
