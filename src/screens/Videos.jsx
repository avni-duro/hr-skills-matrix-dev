import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { cachedFetch, cacheDelete, TTL } from '../utils/cacheDB'
import { useNotification } from '../contexts/NotificationContext'
import './Videos.css'

function Videos() {
  const mountedRef = useRef(true)
  const { showNotification } = useNotification()
  const [videos, setVideos] = useState([])
  const [modules, setModules] = useState([])
  const [quizzes, setQuizzes] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [moduleFilter, setModuleFilter] = useState('All Modules')
  const [error, setError] = useState(null)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editingVideoId, setEditingVideoId] = useState(null)
  const [saving, setSaving] = useState(false)

  // Detail drawer
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedVideo, setSelectedVideo] = useState(null)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 12

  // Form
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    module_id: '',
    bunny_video_id: '',
    playback_url: '',
    duration: '',
    video_order: '',
    quiz_id: '',
  })

  const breadcrumbItems = [
    { label: 'Home', link: true },
    { label: 'Videos', link: false }
  ]

  // Helper function to convert HH:MM:SS time to seconds
  const timeToSeconds = (timeStr) => {
    if (!timeStr || !timeStr.trim()) return null
    
    const parts = timeStr.split(':')
    if (parts.length === 3) {
      // HH:MM:SS format
      const hours = parseInt(parts[0], 10) || 0
      const minutes = parseInt(parts[1], 10) || 0
      const seconds = parseInt(parts[2], 10) || 0
      return (hours * 3600) + (minutes * 60) + seconds
    } else if (parts.length === 2) {
      // MM:SS format
      const minutes = parseInt(parts[0], 10) || 0
      const seconds = parseInt(parts[1], 10) || 0
      return (minutes * 60) + seconds
    }
    return null
  }

  // Helper function to convert seconds to HH:MM:SS
  const secondsToTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return ''
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  // Helper function to format duration for display
  const formatDuration = (seconds) => {
    if (!seconds || isNaN(seconds)) return '—'
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    if (hours > 0) {
      return `${hours}h ${mins}m ${secs}s`
    } else {
      return `${mins}m ${secs}s`
    }
  }

  useEffect(() => {
    mountedRef.current = true
    fetchAll()
    return () => { mountedRef.current = false }
  }, [])

  const fetchAll = async () => {
    await Promise.all([fetchVideos(), fetchModules(), fetchQuizzes()])
  }

  const fetchVideos = async () => {
    try {
      if (mountedRef.current) { setLoading(true); setError(null) }
      const { data } = await cachedFetch('videos_list', async () => {
        const { data, error } = await supabase
          .from('videos')
          .select('*, modules(id, title)')
          .order('created_at', { ascending: false })
        if (error) throw error
        return data || []
      }, TTL.SHORT, true)

      if (mountedRef.current) setVideos(data)
    } catch (err) {
      console.error('Error fetching videos:', err)
      if (mountedRef.current) setError(err.message)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  const fetchModules = async () => {
    try {
      const { data } = await cachedFetch('modules_dropdown', async () => {
        const { data, error } = await supabase
          .from('modules')
          .select('id, title')
          .order('title', { ascending: true })
        if (error) throw error
        return data || []
      }, TTL.LONG)
      if (mountedRef.current) setModules(data)
    } catch (err) {
      console.error('Error fetching modules:', err)
    }
  }

  const fetchQuizzes = async () => {
    try {
      const { data } = await cachedFetch('quizzes_dropdown', async () => {
        const { data, error } = await supabase
          .from('quizzes')
          .select('id, title')
          .order('title', { ascending: true })
        if (error) throw error
        return data || []
      }, TTL.LONG)
      if (mountedRef.current) setQuizzes(data || [])
    } catch (err) {
      console.error('Error fetching quizzes:', err)
      if (mountedRef.current) setQuizzes([])
    }
  }

  // ── CRUD Handlers ──

  const resetForm = () => {
    setFormData({ title: '', description: '', module_id: '', bunny_video_id: '', playback_url: '', duration: '', video_order: '', quiz_id: '' })
    setEditMode(false)
    setEditingVideoId(null)
  }

  const openAddModal = () => {
    resetForm()
    setModalOpen(true)
  }

  const openEditModal = (video, e) => {
    if (e) e.stopPropagation()
    setFormData({
      title: video.title || '',
      description: video.description || '',
      module_id: video.module_id || '',
      bunny_video_id: video.bunny_video_id || '',
      playback_url: video.playback_url || '',
      duration: secondsToTime(video.duration),
      video_order: video.video_order != null ? String(video.video_order) : '',
      quiz_id: video.quiz_id || '',
    })
    setEditMode(true)
    setEditingVideoId(video.id)
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!formData.title.trim()) { showNotification('Please enter a video title', 'warning'); return }
    if (!formData.bunny_video_id.trim()) { showNotification('Please enter the Bunny Video ID', 'warning'); return }
    if (!formData.playback_url.trim()) { showNotification('Please enter the Playback URL', 'warning'); return }

    try {
      setSaving(true)
      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        module_id: formData.module_id || null,
        bunny_video_id: formData.bunny_video_id.trim(),
        playback_url: formData.playback_url.trim(),
        duration: timeToSeconds(formData.duration),
        video_order: formData.video_order ? parseInt(formData.video_order, 10) : null,
        quiz_id: formData.quiz_id || null,
      }

      if (editMode) {
        const { error } = await supabase.from('videos').update(payload).eq('id', editingVideoId)
        if (error) throw error
        showNotification('Video updated successfully!', 'success')
      } else {
        const { error } = await supabase.from('videos').insert([payload])
        if (error) throw error
        showNotification('Video added successfully!', 'success')
      }

      setModalOpen(false)
      resetForm()
      await cacheDelete('videos_list')
      await fetchVideos()

      // If the drawer is open on the same video, refresh it
      if (selectedVideo && selectedVideo.id === editingVideoId) {
        const updated = videos.find(v => v.id === editingVideoId)
        if (updated) setSelectedVideo({ ...updated, ...payload })
      }
    } catch (err) {
      console.error('Error saving video:', err)
      showNotification('Failed to save video: ' + (err.message || 'Unknown error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (videoId, e) => {
    if (e) e.stopPropagation()
    if (!confirm('Are you sure you want to delete this video?')) return

    try {
      const { error } = await supabase.from('videos').delete().eq('id', videoId)
      if (error) throw error
      await cacheDelete('videos_list')
      await fetchVideos()
      if (selectedVideo?.id === videoId) { setDrawerOpen(false); setSelectedVideo(null) }
      showNotification('Video deleted successfully!', 'success')
    } catch (err) {
      console.error('Error deleting video:', err)
      showNotification('Failed to delete video: ' + (err.message || 'Unknown error'), 'error')
    }
  }

  // ── Helpers ──

  const getModuleName = (moduleId) => {
    if (!moduleId) return 'Unassigned'
    const m = modules.find(mod => mod.id === moduleId)
    return m ? m.title : 'Unknown'
  }

  const formatDate = (d) => {
    if (!d) return 'N/A'
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  // ── Filtering + Pagination ──

  const filtered = videos.filter(v => {
    const matchesSearch = v.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.bunny_video_id || '').toLowerCase().includes(searchTerm.toLowerCase())
    const matchesModule = moduleFilter === 'All Modules' || v.module_id === moduleFilter
    return matchesSearch && matchesModule
  })

  const totalPages = Math.ceil(filtered.length / itemsPerPage)
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  useEffect(() => { setCurrentPage(1) }, [searchTerm, moduleFilter])

  return (
    <>
        <main className="vid-main">
          {/* Header */}
          <section className="vid-header">
            <div>
              <h2>Videos</h2>
              <p>Manage all training videos across modules.</p>
            </div>
            <div className="vid-header-actions">
              <button className="vid-btn vid-btn-secondary" onClick={() => { cacheDelete('videos_list'); fetchVideos() }}>
                <i className="fa-solid fa-arrows-rotate"></i> Refresh
              </button>
              <button className="vid-btn vid-btn-primary" onClick={openAddModal}>
                <i className="fa-solid fa-plus"></i> Add Video
              </button>
            </div>
          </section>

          {/* Error */}
          {error && (
            <div className="vid-error">
              <i className="fa-solid fa-circle-exclamation"></i>
              <span>{error}</span>
            </div>
          )}

          {/* Table Card */}
          <section className="vid-table-card">
            {/* Filters */}
            <div className="vid-filters">
              <div className="vid-search">
                <i className="fa-solid fa-search"></i>
                <input
                  type="text"
                  placeholder="Search videos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="vid-filter-select">
                <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
                  <option value="All Modules">All Modules</option>
                  {modules.map(m => (
                    <option key={m.id} value={m.id}>{m.title}</option>
                  ))}
                </select>
                <i className="fa-solid fa-chevron-down"></i>
              </div>
              <span className="vid-count">{filtered.length} video{filtered.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Table */}
            <div className="vid-table-wrap">
              {loading ? (
                <div className="vid-loading">
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  <span>Loading videos...</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="vid-empty">
                  <i className="fa-solid fa-video-slash"></i>
                  <span>No videos found</span>
                </div>
              ) : (
                <table className="vid-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Title</th>
                      <th>Module</th>
                      <th>Bunny ID</th>
                      <th>Duration</th>
                      <th>Order</th>
                      <th>Created</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((video, idx) => (
                      <tr key={video.id} onClick={() => { setSelectedVideo(video); setDrawerOpen(true) }}>
                        <td>{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                        <td>
                          <div className="vid-title-cell">
                            <i className="fa-solid fa-film vid-icon"></i>
                            <span className="vid-title-text">{video.title}</span>
                          </div>
                        </td>
                        <td>
                          <span className="vid-module-badge">
                            {video.modules?.title || getModuleName(video.module_id)}
                          </span>
                        </td>
                        <td><code className="vid-code">{video.bunny_video_id}</code></td>
                        <td>{formatDuration(video.duration)}</td>
                        <td className="text-center">{video.video_order ?? '—'}</td>
                        <td>{formatDate(video.created_at)}</td>
                        <td className="text-right">
                          <button className="vid-action-btn vid-edit" onClick={(e) => openEditModal(video, e)} title="Edit">
                            <i className="fa-solid fa-pen-to-square"></i>
                          </button>
                          <button className="vid-action-btn vid-delete" onClick={(e) => handleDelete(video.id, e)} title="Delete">
                            <i className="fa-solid fa-trash-can"></i>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="vid-pagination">
                <span className="vid-page-info">
                  Showing <strong>{(currentPage - 1) * itemsPerPage + 1}</strong>–<strong>{Math.min(currentPage * itemsPerPage, filtered.length)}</strong> of <strong>{filtered.length}</strong>
                </span>
                <div className="vid-page-btns">
                  <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                    <i className="fa-solid fa-chevron-left"></i>
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .map((p, i, arr) => {
                      const nodes = []
                      if (i > 0 && p - arr[i - 1] > 1) {
                        nodes.push(<span key={'dot' + p} className="vid-page-dots">…</span>)
                      }
                      nodes.push(
                        <button key={p} className={p === currentPage ? 'active' : ''} onClick={() => setCurrentPage(p)}>
                          {p}
                        </button>
                      )
                      return nodes
                    })}
                  <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                    <i className="fa-solid fa-chevron-right"></i>
                  </button>
                </div>
              </div>
            )}
          </section>
        </main>

        {/* ── Detail Drawer ── */}
        {drawerOpen && selectedVideo && (
          <>
            <div className="vid-drawer-overlay" onClick={() => setDrawerOpen(false)}></div>
            <aside className="vid-drawer">
              <div className="vid-drawer-header">
                <h3>Video Details</h3>
                <button className="vid-drawer-close" onClick={() => setDrawerOpen(false)}>
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
              <div className="vid-drawer-body">
                {/* Preview */}
                <div className="vid-preview">
                  <div className="vid-preview-placeholder">
                    <i className="fa-solid fa-play-circle"></i>
                  </div>
                </div>

                <div className="vid-detail-grid">
                  <div className="vid-detail-item">
                    <label>Title</label>
                    <span>{selectedVideo.title}</span>
                  </div>
                  <div className="vid-detail-item">
                    <label>Description</label>
                    <span>{selectedVideo.description || '—'}</span>
                  </div>
                  <div className="vid-detail-item">
                    <label>Module</label>
                    <span>{selectedVideo.modules?.title || getModuleName(selectedVideo.module_id)}</span>
                  </div>
                  <div className="vid-detail-row">
                    <div className="vid-detail-item">
                      <label>Bunny Video ID</label>
                      <code className="vid-code">{selectedVideo.bunny_video_id}</code>
                    </div>
                    <div className="vid-detail-item">
                      <label>Duration</label>
                      <span>{formatDuration(selectedVideo.duration)}</span>
                    </div>
                  </div>
                  <div className="vid-detail-row">
                    <div className="vid-detail-item">
                      <label>Order</label>
                      <span>{selectedVideo.video_order ?? '—'}</span>
                    </div>
                    <div className="vid-detail-item">
                      <label>Created</label>
                      <span>{formatDate(selectedVideo.created_at)}</span>
                    </div>
                  </div>
                  <div className="vid-detail-item">
                    <label>Playback URL</label>
                    <a href={selectedVideo.playback_url} target="_blank" rel="noopener noreferrer" className="vid-link">
                      {selectedVideo.playback_url}
                    </a>
                  </div>
                </div>

                <div className="vid-drawer-actions">
                  <button className="vid-btn vid-btn-secondary" onClick={(e) => openEditModal(selectedVideo, e)}>
                    <i className="fa-solid fa-pen-to-square"></i> Edit
                  </button>
                  <button className="vid-btn vid-btn-danger" onClick={(e) => handleDelete(selectedVideo.id, e)}>
                    <i className="fa-solid fa-trash-can"></i> Delete
                  </button>
                </div>
              </div>
            </aside>
          </>
        )}

        {/* ── Add/Edit Modal ── */}
        {modalOpen && (
          <>
            <div className="vid-modal-overlay" onClick={() => { setModalOpen(false); resetForm() }}></div>
            <div className="vid-modal">
              <div className="vid-modal-header">
                <h3>{editMode ? 'Edit Video' : 'Add New Video'}</h3>
                <button className="vid-drawer-close" onClick={() => { setModalOpen(false); resetForm() }}>
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
              <div className="vid-modal-body">
                {/* Title */}
                <div className="vid-form-group">
                  <label>Title <span className="vid-required">*</span></label>
                  <input
                    type="text"
                    placeholder="Enter video title"
                    value={formData.title}
                    onChange={(e) => setFormData(f => ({ ...f, title: e.target.value }))}
                  />
                </div>

                {/* Description */}
                <div className="vid-form-group">
                  <label>Description</label>
                  <textarea
                    rows="3"
                    placeholder="Enter description (optional)"
                    value={formData.description}
                    onChange={(e) => setFormData(f => ({ ...f, description: e.target.value }))}
                  ></textarea>
                </div>

                {/* Module */}
                <div className="vid-form-group">
                  <label>Module</label>
                  <select
                    value={formData.module_id}
                    onChange={(e) => setFormData(f => ({ ...f, module_id: e.target.value }))}
                  >
                    <option value="">-- Select Module --</option>
                    {modules.map(m => (
                      <option key={m.id} value={m.id}>{m.title}</option>
                    ))}
                  </select>
                </div>

                {/* Bunny Video ID + Playback URL (row) */}
                <div className="vid-form-row">
                  <div className="vid-form-group">
                    <label>Bunny Video ID <span className="vid-required">*</span></label>
                    <input
                      type="text"
                      placeholder="e.g. abc123-xyz"
                      value={formData.bunny_video_id}
                      onChange={(e) => setFormData(f => ({ ...f, bunny_video_id: e.target.value }))}
                    />
                  </div>
                  <div className="vid-form-group">
                    <label>Playback URL <span className="vid-required">*</span></label>
                    <input
                      type="text"
                      placeholder="https://..."
                      value={formData.playback_url}
                      onChange={(e) => setFormData(f => ({ ...f, playback_url: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Duration + Order (row) */}
                <div className="vid-form-row">
                  <div className="vid-form-group">
                    <label>Duration (HH:MM:SS)</label>
                    <input
                      type="text"
                      placeholder="e.g. 02:48:14"
                      value={formData.duration}
                      onChange={(e) => setFormData(f => ({ ...f, duration: e.target.value }))}
                      pattern="^([0-9]{1,2}):([0-5][0-9]):([0-5][0-9])$"
                      title="Enter duration in HH:MM:SS format (e.g., 02:48:14)"
                    />
                  </div>
                  <div className="vid-form-group">
                    <label>Video Order</label>
                    <input
                      type="number"
                      placeholder="e.g. 1"
                      value={formData.video_order}
                      onChange={(e) => setFormData(f => ({ ...f, video_order: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Quiz */}
                <div className="vid-form-group">
                  <label>Quiz (Optional)</label>
                  <select
                    value={formData.quiz_id}
                    onChange={(e) => setFormData(f => ({ ...f, quiz_id: e.target.value }))}
                  >
                    <option value="">-- No Quiz --</option>
                    {quizzes.map(q => (
                      <option key={q.id} value={q.id}>{q.title}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="vid-modal-footer">
                <button className="vid-btn vid-btn-secondary" onClick={() => { setModalOpen(false); resetForm() }}>
                  Cancel
                </button>
                <button className="vid-btn vid-btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <><i className="fa-solid fa-spinner fa-spin"></i> Saving...</>
                  ) : (
                    <><i className="fa-solid fa-floppy-disk"></i> {editMode ? 'Update Video' : 'Add Video'}</>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
    </>
  )
}

export default Videos
