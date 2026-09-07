import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { cachedFetch, cacheSet, cacheGet, TTL } from '../utils/cacheDB'
import { useNotification } from '../contexts/NotificationContext'
import './Notifications.css'

function Notifications() {
  const mountedRef = useRef(true)
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [users, setUsers] = useState([])
  const [selected, setSelected] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false)

  // Form state
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [targetType, setTargetType] = useState('single') // single | multi | all
  const [singleUserId, setSingleUserId] = useState('')
  const [multiUserIds, setMultiUserIds] = useState([])
  const [userSearch, setUserSearch] = useState('')

  const breadcrumbItems = [
    { label: 'Home', link: true },
    { label: 'Notifications', link: false }
  ]

  useEffect(() => {
    mountedRef.current = true
    fetchData()
    return () => {
      mountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      // Cache users list (used for dropdown, changes infrequently)
      const { data: cachedUsers } = await cachedFetch('users_basic', async () => {
        const { data, error } = await supabase.from('users').select('id, full_name, email').order('full_name')
        if (error) throw error
        return data || []
      }, TTL.MEDIUM)

      const { data: notifRows, error: notifErr } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
      if (notifErr) throw notifErr

      const mapped = (notifRows || []).map(n => ({
        id: n.id,
        title: n.title,
        body: n.body,
        status: n.status || 'pending',
        created_at: n.created_at,
        sent_at: n.sent_at,
        error_message: n.error_message,
        data: n.data || {},
        targetType: n.data?.targetType || (n.user_id ? 'single' : 'unknown'),
        recipientsCount: n.data?.userIds ? n.data.userIds.length : (n.user_id ? 1 : (n.data?.targetType === 'all' ? 'ALL' : 0))
      }))
      setNotifications(mapped)
      setUsers(cachedUsers || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setTitle('')
    setBody('')
    setTargetType('single')
    setSingleUserId('')
    setMultiUserIds([])
  }

  const handleMultiToggle = (id) => {
    setMultiUserIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (!title.trim() || !body.trim()) {
      showNotification('Title and body are required', 'warning')
      return
    }

    setSending(true)
    setError(null)
    try {
      let rowsToInsert = []
      let meta = {}

      if (targetType === 'single') {
        if (!singleUserId) { showNotification('Select a user', 'warning'); setSending(false); return }
        rowsToInsert = [{ title, body, user_id: singleUserId, data: { targetType: 'single', userIds: [singleUserId] } }]
        meta = { targetType: 'single', userIds: [singleUserId] }
      } else if (targetType === 'multi') {
        if (multiUserIds.length === 0) { showNotification('Select at least one user', 'warning'); setSending(false); return }
        rowsToInsert = multiUserIds.map(uid => ({ title, body, user_id: uid, data: { targetType: 'multi', userIds: multiUserIds } }))
        meta = { targetType: 'multi', userIds: multiUserIds }
      } else if (targetType === 'all') {
        const allIds = users.map(u => u.id)
        if (allIds.length === 0) { showNotification('No users available', 'warning'); setSending(false); return }
        rowsToInsert = allIds.map(uid => ({ title, body, user_id: uid, data: { targetType: 'all', userIds: allIds } }))
        meta = { targetType: 'all', userIds: allIds }
      }

      const { data: insertedNotifications, error: insertErr } = await supabase
        .from('notifications')
        .insert(rowsToInsert)
        .select()

      if (insertErr) {
        // Provide clearer guidance if RLS blocks insert
        if (/row-level security/i.test(insertErr.message)) {
          throw new Error('RLS blocked insert. Ensure admin INSERT policy exists and current user has role=admin. See SUPABASE_SETUP.md Notifications section.')
        }
        throw insertErr
      }

      // Notifications will be sent automatically via database webhook trigger
      // The webhook triggers the send-notification edge function on INSERT
      
      showNotification('Notification(s) created successfully! They will be sent automatically.', 'success')
      resetForm()
      fetchData()
    } catch (e) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  const formatDate = (iso) => {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleString() } catch { return iso }
  }

  const openPanel = (n) => { setSelected(n); setPanelOpen(true) }
  const closePanel = () => { setPanelOpen(false); setSelected(null) }

  const updateStatus = async (id, newStatus, errorMsg) => {
    try {
      const updates = { status: newStatus }
      if (newStatus === 'sent') updates.sent_at = new Date().toISOString()
      if (newStatus === 'error') updates.error_message = errorMsg || 'Unknown error'
      const { error: upErr } = await supabase.from('notifications').update(updates).eq('id', id)
      if (upErr) throw upErr
      await fetchData()
      if (selected && selected.id === id) {
        const updated = notifications.find(n => n.id === id)
        if (updated) setSelected(updated)
      }
    } catch (e) {
      showNotification('Failed to update status: ' + e.message, 'error')
    }
  }

  const bulkMarkSent = async () => {
    const pendingIds = notifications.filter(n => n.status === 'pending').map(n => n.id)
    if (pendingIds.length === 0) return
    if (!window.confirm(`Mark ${pendingIds.length} pending notifications as sent?`)) return
    try {
      const { error: bulkErr } = await supabase
        .from('notifications')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .in('id', pendingIds)
      if (bulkErr) {
        if (/row-level security/i.test(bulkErr.message)) {
          throw new Error('RLS blocked bulk update. Add admin UPDATE policy for notifications table.')
        }
        throw bulkErr
      }
      await fetchData()
    } catch (e) {
      showNotification('Bulk update failed: ' + e.message, 'error')
    }
  }

  return (
    <>
        <main className="notifications-main">
          <div className="section-header">
            <h2 className="page-title">Notifications</h2>
          </div>
          <form className="form-card" onSubmit={handleSend}>
            <div className="form-grid">
              <div className="form-group">
                <label>Title</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" />
              </div>
              <div className="form-group">
                <label>Target</label>
                <select value={targetType} onChange={e => setTargetType(e.target.value)}>
                  <option value="single">Single User</option>
                  <option value="multi">Multiple Users</option>
                  <option value="all">All Users</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label>Body</label>
              <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Notification body..." />
            </div>
            {targetType === 'single' && (
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label>Select User</label>
                <select value={singleUserId} onChange={e => setSingleUserId(e.target.value)}>
                  <option value="">-- choose user --</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
                  ))}
                </select>
              </div>
            )}
            {targetType === 'multi' && (
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label>Select Users</label>
                <div className="recipient-tools">
                  <div className="recipient-search">
                    <input
                      placeholder="Search users..."
                      value={userSearch}
                      onChange={e => setUserSearch(e.target.value)}
                    />
                    <span style={{ fontSize:'0.6rem', color:'#6B7280', whiteSpace:'nowrap' }}>{multiUserIds.length} selected</span>
                  </div>
                  {multiUserIds.length > 0 && (
                    <div className="selected-chips">
                      {multiUserIds.map(id => {
                        const u = users.find(x => x.id === id)
                        if (!u) return null
                        return (
                          <span key={id} className="chip">
                            {u.full_name.split(' ')[0]}
                            <button type="button" title="Remove" onClick={() => handleMultiToggle(id)}>
                              <i className="fa-solid fa-xmark"></i>
                            </button>
                          </span>
                        )
                      })}
                    </div>
                  )}
                  <div className="recipient-box">
                      {users.filter(u => {
                        const term = userSearch.trim().toLowerCase()
                        if (!term) return true
                        return u.full_name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)
                      }).map(u => (
                        <label key={u.id} className="recipient-item">
                          <span>{u.full_name} <span className="small">({u.email})</span></span>
                          <input
                            type="checkbox"
                            checked={multiUserIds.includes(u.id)}
                            onChange={() => handleMultiToggle(u.id)}
                          />
                        </label>
                      ))}
                  </div>
                </div>
              </div>
            )}
            {targetType === 'all' && (
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label>Recipients</label>
                <div className="recipient-box"><div className="small">All users will receive this notification ({users.length})</div></div>
              </div>
            )}
            <div className="meta-row">
              <button type="submit" className="send-btn" disabled={sending}>
                <i className="fa-solid fa-paper-plane"></i>
                {sending ? 'Sending...' : 'Send Notification'}
              </button>
              {error && <div className="error-state" style={{ padding: '0.6rem 0.9rem' }}>Error: {error}</div>}
            </div>
          </form>
          <div className="bulk-row">
            <button className="bulk-btn" onClick={bulkMarkSent} disabled={!notifications.some(n => n.status === 'pending')}>
              <i className="fa-solid fa-check"></i> Mark All Pending Sent
            </button>
          </div>
          <div className="table-card">
            {loading ? (
              <div className="loading-state"><i className="fa-solid fa-spinner fa-spin"/> Loading notifications...</div>
            ) : error ? (
              <div className="error-state">Error: {error}</div>
            ) : notifications.length === 0 ? (
              <div className="empty-state">No notifications yet.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Target</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Sent</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.map(n => (
                    <tr key={n.id}>
                      <td className="truncate" title={n.title}>{n.title}</td>
                      <td>{n.targetType === 'all' ? 'All Users' : n.targetType === 'multi' ? `${n.recipientsCount} Users` : 'Single User'}</td>
                      <td><span className={`status-badge ${n.status}`}>{n.status}</span></td>
                      <td>{formatDate(n.created_at)}</td>
                      <td>{formatDate(n.sent_at)}</td>
                      <td>
                        <div className="actions-cell">
                          <button className="btn-icon" title="View" onClick={() => openPanel(n)}><i className="fa-solid fa-eye"></i></button>
                          {n.status !== 'sent' && (
                            <button className="btn-icon" title="Mark Sent" onClick={() => updateStatus(n.id, 'sent')}><i className="fa-solid fa-check"></i></button>
                          )}
                          {n.status !== 'error' && (
                            <button className="btn-icon" title="Mark Error" onClick={() => {
                              const msg = prompt('Error message:','Manual error mark')
                              if (msg !== null) updateStatus(n.id, 'error', msg)
                            }}><i className="fa-solid fa-triangle-exclamation"></i></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      {panelOpen && selected && (
        <div className="notification-panel-overlay" onClick={closePanel}>
          <div className="notification-panel" onClick={e => e.stopPropagation()}>
            <div className="panel-header">
              <h2>Notification Details</h2>
              <button className="close-btn" onClick={closePanel}><i className="fa-solid fa-times"></i></button>
            </div>
            <div className="panel-body">
              <div className="panel-section">
                <span className="label">Title</span>
                <p className="value">{selected.title}</p>
              </div>
              <div className="panel-section">
                <span className="label">Body</span>
                <p className="value" style={{ background:'#F3F4F6', padding:'0.6rem 0.75rem', borderRadius:'0.5rem' }}>{selected.body}</p>
              </div>
              <div className="panel-section">
                <span className="label">Target</span>
                <p className="value">{selected.targetType === 'all' ? 'All Users' : selected.targetType === 'multi' ? `${selected.recipientsCount} Users` : 'Single User'}</p>
              </div>
              <div className="panel-section" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:'1rem' }}>
                <div>
                  <span className="label">Status</span>
                  <p className="value"><span className={`status-badge ${selected.status}`}>{selected.status}</span></p>
                </div>
                <div>
                  <span className="label">Created</span>
                  <p className="value">{formatDate(selected.created_at)}</p>
                </div>
                <div>
                  <span className="label">Sent</span>
                  <p className="value">{formatDate(selected.sent_at)}</p>
                </div>
              </div>
              {selected.error_message && (
                <div className="panel-section">
                  <span className="label">Error Message</span>
                  <p className="value" style={{ color:'#DC2626' }}>{selected.error_message}</p>
                </div>
              )}
            </div>
            <div className="panel-footer">
              {selected.status !== 'sent' && (
                <button className="btn-status sent" onClick={() => updateStatus(selected.id,'sent')}>
                  <i className="fa-solid fa-check"></i> Mark Sent
                </button>
              )}
              {selected.status !== 'error' && (
                <button className="btn-status error" onClick={() => { const msg = prompt('Error message:','Manual error mark'); if (msg!==null) updateStatus(selected.id,'error',msg) }}>
                  <i className="fa-solid fa-triangle-exclamation"></i> Mark Error
                </button>
              )}
              <button className="btn-status close" onClick={closePanel}>
                <i className="fa-solid fa-xmark"></i> Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Notifications
