import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { cachedFetch, TTL } from '../utils/cacheDB'
import { useNotification } from '../contexts/NotificationContext'
import './ModuleRequests.css'

function ModuleRequests() {
  const mountedRef = useRef(true)
  const { showNotification } = useNotification()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('pending')
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [adminNotes, setAdminNotes] = useState({})
  const [processingRequest, setProcessingRequest] = useState(null)

  const breadcrumbItems = [
    { label: 'Home', link: true },
    { label: 'Module Requests', link: false }
  ]

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  useEffect(() => {
    mountedRef.current = true
    fetchRequests()
    return () => {
      mountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const fetchRequests = async () => {
    try {
      setLoading(true)
      setError(null)

      const { data, error } = await supabase
        .from('module_access_requests')
        .select(`
          *,
          modules (
            id,
            title,
            thumbnail_url,
            category_id,
            categories (
              name
            )
          )
        `)
        .eq('status', activeTab)
        .order('requested_at', { ascending: false })

      if (error) throw error

      // Fetch user details separately for each request
      if (data && data.length > 0) {
        const enrichedData = await Promise.all(
          data.map(async (request) => {
            try {
              // Fetch user from public.users table
              const { data: userData, error: userError } = await supabase
                .from('users')
                .select(`
                  id,
                  full_name,
                  email,
                  employee_id,
                  departments (
                    department_name
                  )
                `)
                .eq('id', request.user_id)
                .single()

              // Fetch reviewer info if exists
              let reviewerData = null
              if (request.reviewed_by) {
                const { data: reviewer, error: reviewerError } = await supabase
                  .from('users')
                  .select('full_name')
                  .eq('id', request.reviewed_by)
                  .single()
                
                if (!reviewerError) {
                  reviewerData = reviewer
                }
              }

              return {
                ...request,
                users: userError ? null : userData,
                reviewer: reviewerData
              }
            } catch (err) {
              console.error('Error fetching user data for request:', err)
              return {
                ...request,
                users: null,
                reviewer: null
              }
            }
          })
        )
        setRequests(enrichedData)
      } else {
        setRequests([])
      }
    } catch (error) {
      console.error('Error fetching requests:', error)
      setError(error.message || 'Failed to fetch requests')
    } finally {
      setLoading(false)
    }
  }

  const handleApproveRequest = async (requestId, moduleId, userId) => {
    try {
      setProcessingRequest(requestId)
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        showNotification('You must be logged in to approve requests', 'warning')
        return
      }

      // Update request status
      const { error: updateError } = await supabase
        .from('module_access_requests')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
          admin_notes: adminNotes[requestId] || null
        })
        .eq('id', requestId)

      if (updateError) throw updateError

      // Grant user access
      const { error: accessError } = await supabase
        .from('module_user_access')
        .insert([{
          module_id: moduleId,
          user_id: userId,
          granted_by: user.id
        }])

      if (accessError) throw accessError

      showNotification('Request approved successfully!', 'success')
      await fetchRequests()
      setAdminNotes({ ...adminNotes, [requestId]: '' })
    } catch (error) {
      console.error('Error approving request:', error)
      showNotification('Failed to approve request: ' + (error.message || 'Unknown error'), 'error')
    } finally {
      setProcessingRequest(null)
    }
  }

  const handleRejectRequest = async (requestId) => {
    if (!adminNotes[requestId]?.trim()) {
      showNotification('Please provide a reason for rejection in the admin notes', 'warning')
      return
    }

    try {
      setProcessingRequest(requestId)
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        showNotification('You must be logged in to reject requests', 'warning')
        return
      }

      const { error } = await supabase
        .from('module_access_requests')
        .update({
          status: 'rejected',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
          admin_notes: adminNotes[requestId]
        })
        .eq('id', requestId)

      if (error) throw error

      showNotification('Request rejected', 'success')
      await fetchRequests()
      setAdminNotes({ ...adminNotes, [requestId]: '' })
    } catch (error) {
      console.error('Error rejecting request:', error)
      showNotification('Failed to reject request: ' + (error.message || 'Unknown error'), 'error')
    } finally {
      setProcessingRequest(null)
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getTabCount = (status) => {
    return requests.length
  }

  return (
        <main className="module-requests-main">
          <section className="requests-header">
            <div>
              <h2>Module Access Requests</h2>
              <p>Review and manage user requests for module access</p>
            </div>
            <button className="btn btn-secondary" onClick={fetchRequests}>
              <i className="fa-solid fa-arrows-rotate"></i>Refresh
            </button>
          </section>

          {error && (
            <div className="error-message">
              <i className="fa-solid fa-circle-exclamation"></i>
              <span>{error}</span>
            </div>
          )}

          {/* Tabs */}
          <div className="requests-tabs">
            <button 
              className={`tab ${activeTab === 'pending' ? 'active' : ''}`}
              onClick={() => setActiveTab('pending')}
            >
              <i className="fa-solid fa-clock"></i>
              Pending
              {activeTab === 'pending' && requests.length > 0 && (
                <span className="tab-badge">{requests.length}</span>
              )}
            </button>
            <button 
              className={`tab ${activeTab === 'approved' ? 'active' : ''}`}
              onClick={() => setActiveTab('approved')}
            >
              <i className="fa-solid fa-check-circle"></i>
              Approved
              {activeTab === 'approved' && requests.length > 0 && (
                <span className="tab-badge">{requests.length}</span>
              )}
            </button>
            <button 
              className={`tab ${activeTab === 'rejected' ? 'active' : ''}`}
              onClick={() => setActiveTab('rejected')}
            >
              <i className="fa-solid fa-times-circle"></i>
              Rejected
              {activeTab === 'rejected' && requests.length > 0 && (
                <span className="tab-badge">{requests.length}</span>
              )}
            </button>
          </div>

          {/* Requests List */}
          <div className="requests-container">
            {loading ? (
              <div className="loading-state">
                <i className="fa-solid fa-spinner fa-spin"></i>
                Loading requests...
              </div>
            ) : requests.length === 0 ? (
              <div className="empty-state">
                <i className={`fa-solid ${
                  activeTab === 'pending' ? 'fa-inbox' : 
                  activeTab === 'approved' ? 'fa-check-circle' : 
                  'fa-times-circle'
                }`}></i>
                <h3>No {activeTab} requests</h3>
                <p>
                  {activeTab === 'pending' && 'All caught up! No pending requests at the moment.'}
                  {activeTab === 'approved' && 'No approved requests to display.'}
                  {activeTab === 'rejected' && 'No rejected requests to display.'}
                </p>
              </div>
            ) : (
              <div className="requests-grid">
                {requests.map(request => (
                  <div key={request.id} className="request-card">
                    {/* User Info */}
                    <div className="request-user">
                      <div className="user-avatar">
                        {request.users?.full_name?.charAt(0) || 'U'}
                      </div>
                      <div className="user-details">
                        <h4>{request.users?.full_name || 'Unknown User'}</h4>
                        <p className="user-meta">
                          <span>
                            <i className="fa-solid fa-id-card"></i>
                            {request.users?.employee_id || 'N/A'}
                          </span>
                          <span>
                            <i className="fa-solid fa-building"></i>
                            {request.users?.departments?.department_name || 'N/A'}
                          </span>
                        </p>
                        <p className="user-email">
                          <i className="fa-solid fa-envelope"></i>
                          {request.users?.email || 'N/A'}
                        </p>
                      </div>
                    </div>

                    <div className="request-divider"></div>

                    {/* Module Info */}
                    <div className="request-module">
                      <div className="module-thumbnail">
                        {request.modules?.thumbnail_url ? (
                          <img 
                            src={request.modules.thumbnail_url} 
                            alt={request.modules.title}
                            onError={(e) => {
                              e.target.style.display = 'none'
                              e.target.nextSibling.style.display = 'flex'
                            }}
                          />
                        ) : null}
                        <div className="module-placeholder" style={{ 
                          display: request.modules?.thumbnail_url ? 'none' : 'flex' 
                        }}>
                          <i className="fa-solid fa-graduation-cap"></i>
                        </div>
                      </div>
                      <div className="module-details">
                        <h5>{request.modules?.title || 'Unknown Module'}</h5>
                        {request.modules?.categories && (
                          <span className="module-category">
                            <i className="fa-solid fa-tag"></i>
                            {request.modules.categories.name}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Request Details */}
                    <div className="request-info">
                      <div className="info-row">
                        <span className="info-label">
                          <i className="fa-solid fa-calendar"></i>
                          Requested
                        </span>
                        <span className="info-value">{formatDate(request.requested_at)}</span>
                      </div>
                      {request.reason && (
                        <div className="info-row">
                          <span className="info-label">
                            <i className="fa-solid fa-comment"></i>
                            Reason
                          </span>
                          <span className="info-value reason-text">{request.reason}</span>
                        </div>
                      )}
                      {request.reviewed_at && (
                        <div className="info-row">
                          <span className="info-label">
                            <i className="fa-solid fa-user-check"></i>
                            Reviewed
                          </span>
                          <span className="info-value">
                            {formatDate(request.reviewed_at)}
                            {request.reviewer && ` by ${request.reviewer.full_name}`}
                          </span>
                        </div>
                      )}
                      {request.admin_notes && (
                        <div className="info-row">
                          <span className="info-label">
                            <i className="fa-solid fa-note-sticky"></i>
                            Admin Notes
                          </span>
                          <span className="info-value admin-notes-text">{request.admin_notes}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions for Pending Requests */}
                    {activeTab === 'pending' && (
                      <div className="request-actions">
                        <div className="admin-notes-input">
                          <label htmlFor={`notes-${request.id}`}>
                            <i className="fa-solid fa-note-sticky"></i>
                            Admin Notes {activeTab === 'pending' && '(required for rejection)'}
                          </label>
                          <textarea
                            id={`notes-${request.id}`}
                            rows="2"
                            placeholder="Add notes about this request..."
                            value={adminNotes[request.id] || ''}
                            onChange={(e) => setAdminNotes({ 
                              ...adminNotes, 
                              [request.id]: e.target.value 
                            })}
                          />
                        </div>
                        <div className="action-buttons">
                          <button 
                            className="btn btn-danger"
                            onClick={() => handleRejectRequest(request.id)}
                            disabled={processingRequest === request.id}
                          >
                            {processingRequest === request.id ? (
                              <>
                                <i className="fa-solid fa-spinner fa-spin"></i>
                                Rejecting...
                              </>
                            ) : (
                              <>
                                <i className="fa-solid fa-times"></i>
                                Reject
                              </>
                            )}
                          </button>
                          <button 
                            className="btn btn-success"
                            onClick={() => handleApproveRequest(
                              request.id, 
                              request.module_id, 
                              request.user_id
                            )}
                            disabled={processingRequest === request.id}
                          >
                            {processingRequest === request.id ? (
                              <>
                                <i className="fa-solid fa-spinner fa-spin"></i>
                                Approving...
                              </>
                            ) : (
                              <>
                                <i className="fa-solid fa-check"></i>
                                Approve
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Status Badge for Approved/Rejected */}
                    {activeTab !== 'pending' && (
                      <div className="request-status">
                        <span className={`status-badge ${activeTab}`}>
                          <i className={`fa-solid ${
                            activeTab === 'approved' ? 'fa-check' : 'fa-times'
                          }`}></i>
                          {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
  )
}

export default ModuleRequests
