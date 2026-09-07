import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useNotification } from '../contexts/NotificationContext'
import { cacheSet, cacheGet, cachedFetch, TTL } from '../utils/cacheDB'
import './Feedbacks.css'

function Feedbacks() {
  const mountedRef = useRef(true)
  const [feedbacks, setFeedbacks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [filterType, setFilterType] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [selected, setSelected] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const breadcrumbItems = [
    { label: 'Home', link: true },
    { label: 'Feedback', link: false }
  ]

  useEffect(() => {
    mountedRef.current = true
    fetchFeedbacks()
    return () => {
      mountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchFeedbacks = async () => {
    setLoading(true)
    setError(null)
    try {
      // First attempt a simple select without implicit joins (avoids schema cache FK issues)
      const { data: rows, error: baseError } = await supabase
        .from('feedback')
        .select('*')
        .order('created_at', { ascending: false })

      if (baseError) {
        // Provide actionable guidance if table missing in schema cache
        if (/Could not find the table/i.test(baseError.message)) {
          throw new Error(
            'Feedback table not found. Ensure the table public.feedback exists, then click "Refresh Schema" in Supabase or wait 1-2 minutes. If it does not exist, run the CREATE TABLE statement from SUPABASE_SETUP.md.'
          )
        }
        throw baseError
      }

      if (!rows || rows.length === 0) {
        setFeedbacks([])
        return
      }

      // Batch fetch related metadata — use cache for modules/videos (change less often)
      const moduleIds = [...new Set(rows.filter(r => r.module_id).map(r => r.module_id))]
      const videoIds = [...new Set(rows.filter(r => r.video_id).map(r => r.video_id))]
      const userIds = [...new Set(rows.filter(r => r.user_id).map(r => r.user_id))]

      // Use cached modules/videos lists, fresh user data
      const [modulesRes, videosRes, usersRes] = await Promise.all([
        moduleIds.length ? cachedFetch('feedback_modules_' + moduleIds.sort().join(','), () => 
          supabase.from('modules').select('id,title').in('id', moduleIds).then(r => r.data || []),
          TTL.LONG
        ) : Promise.resolve({ data: [] }),
        videoIds.length ? cachedFetch('feedback_videos_' + videoIds.sort().join(','), () =>
          supabase.from('videos').select('id,title').in('id', videoIds).then(r => r.data || []),
          TTL.LONG
        ) : Promise.resolve({ data: [] }),
        userIds.length ? supabase.from('users').select('id,full_name,email').in('id', userIds) : Promise.resolve({ data: [] })
      ])

      const modulesData = modulesRes.data || []
      const videosData = videosRes.data || []
      const usersData = usersRes.data || []
      const modulesMap = Object.fromEntries(modulesData.map(m => [m.id, m]))
      const videosMap = Object.fromEntries(videosData.map(v => [v.id, v]))
      const usersMap = Object.fromEntries(usersData.map(u => [u.id, u]))

      const mapped = rows.map(f => ({
        id: f.id,
        type: f.type,
        content: f.content,
        created_at: f.created_at,
        user: f.user_id ? (usersMap[f.user_id] ? { id: f.user_id, name: usersMap[f.user_id].full_name, email: usersMap[f.user_id].email } : null) : null,
        module: f.module_id ? (modulesMap[f.module_id] ? { id: f.module_id, title: modulesMap[f.module_id].title } : null) : null,
        video: f.video_id ? (videosMap[f.video_id] ? { id: f.video_id, title: videosMap[f.video_id].title } : null) : null
      }))
      setFeedbacks(mapped)
    } catch (e) {
      console.error('Error fetching feedbacks:', e)
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleMenuToggle = () => {
    // Sidebar manages its own internal open state; placeholder to match other screens
  }

  const openPanel = (fb) => {
    setSelected(fb)
    setPanelOpen(true)
  }

  const closePanel = () => {
    setPanelOpen(false)
    setTimeout(() => {
      setSelected(null)
    }, 200)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this feedback?')) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('feedback').delete().eq('id', id)
      if (error) throw error
      if (selected && selected.id === id) closePanel()
      await fetchFeedbacks()
    } catch (e) {
      showNotification('Failed to delete: ' + e.message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  const filtered = feedbacks.filter(f => {
    const typeMatch = filterType === 'all' || f.type === filterType
    const term = searchTerm.trim().toLowerCase()
    const searchMatch = !term ||
      (f.user && f.user.name.toLowerCase().includes(term)) ||
      (f.module && f.module.title.toLowerCase().includes(term)) ||
      (f.video && f.video.title.toLowerCase().includes(term)) ||
      f.content.toLowerCase().includes(term)
    return typeMatch && searchMatch
  })

  const formatDate = (iso) => {
    try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '' }
  }

  return (
    <>
        <div className="content-area">
          {/* Filters Row */}
          <div className="feedback-filters">
            <div className="left-tools">
              <div className="search-box">
                <i className="fa-solid fa-search" />
                <input
                  type="text"
                  placeholder="Search feedback..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <select
                className="filter-select"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="all">All Types</option>
                <option value="module">Module</option>
                <option value="video">Video</option>
              </select>
              <button className="btn-refresh" onClick={fetchFeedbacks} disabled={loading}>
                <i className={`fa-solid fa-rotate ${loading ? 'spin' : ''}`}></i>
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="table-container">
            {loading ? (
              <div className="loading-state"><i className="fa-solid fa-spinner fa-spin" /> Loading feedback...</div>
            ) : error ? (
              <div className="error-state">Error: {error}</div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <i className="fa-regular fa-comment" />
                <p>No feedback found</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Type</th>
                    <th>Title</th>
                    <th>Feedback</th>
                    <th>Date</th>
                    <th className="center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(f => {
                    const title = f.type === 'module' ? f.module?.title : f.video?.title
                    return (
                      <tr key={f.id} onClick={() => openPanel(f)} className="row-click">
                        <td>
                          <div className="user-cell">
                            <div className="avatar-circle">{(f.user?.name || 'U').charAt(0).toUpperCase()}</div>
                            <span className="user-name">{f.user?.name || 'Unknown'}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`type-badge ${f.type}`}>{f.type}</span>
                        </td>
                        <td className="truncate">{title || '—'}</td>
                        <td className="truncate">{f.content}</td>
                        <td>{formatDate(f.created_at)}</td>
                        <td className="center">
                          <button
                            className="btn-icon"
                            title="View"
                            onClick={(e) => { e.stopPropagation(); openPanel(f) }}
                          >
                            <i className="fa-solid fa-eye" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

      {/* Slide Panel */}
      {panelOpen && selected && (
        <div className="feedback-panel-overlay" onClick={closePanel}>
          <div className="feedback-panel" onClick={(e) => e.stopPropagation()}>
            <div className="panel-header">
              <h2>Feedback Details</h2>
              <button className="close-btn" onClick={closePanel}><i className="fa-solid fa-times"></i></button>
            </div>
            <div className="panel-body">
              <div className="panel-section">
                <span className="label">User</span>
                <div className="user-detail">
                  <div className="avatar-circle lg">{(selected.user?.name || 'U').charAt(0).toUpperCase()}</div>
                  <div>
                    <p className="user-name lg">{selected.user?.name || 'Unknown User'}</p>
                    {selected.user?.email && <p className="user-email">{selected.user.email}</p>}
                  </div>
                </div>
              </div>
              <div className="panel-grid">
                <div className="panel-section">
                  <span className="label">Type</span>
                  <p><span className={`type-badge ${selected.type}`}>{selected.type}</span></p>
                </div>
                <div className="panel-section">
                  <span className="label">Submitted</span>
                  <p className="value">{formatDate(selected.created_at)}</p>
                </div>
              </div>
              <div className="panel-section">
                <span className="label">Title</span>
                <p className="value title">{selected.type === 'module' ? selected.module?.title : selected.video?.title || '—'}</p>
              </div>
              <div className="panel-section">
                <span className="label">Full Feedback</span>
                <p className="feedback-box">{selected.content}</p>
              </div>
            </div>
            <div className="panel-footer">
              <button className="btn-danger w-full" disabled={deleting} onClick={() => handleDelete(selected.id)}>
                <i className="fa-solid fa-trash"></i> {deleting ? 'Deleting...' : 'Delete Feedback'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Feedbacks
