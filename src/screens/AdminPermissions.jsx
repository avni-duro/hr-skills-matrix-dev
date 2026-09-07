import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { NAV_ITEMS, SCREENS } from '../config/permissions'
import { useNotification } from '../contexts/NotificationContext'
import './AdminPermissions.css'

// All manageable screens (exclude admin-permissions itself — super_admin only)
const MANAGEABLE_SCREENS = NAV_ITEMS.filter(
  item => item.screen !== SCREENS.ADMIN_PERMISSIONS
)

function AdminPermissions() {
  const mountedRef = useRef(true)
  const { showNotification } = useNotification()
  const { user: currentUser } = useAuth()
  const [admins, setAdmins] = useState([])
  const [selectedAdmin, setSelectedAdmin] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    mountedRef.current = true
    fetchAdmins()
    return () => { mountedRef.current = false }
  }, [])

  const fetchAdmins = async () => {
    try {
      setLoading(true)
      // Fetch all users with admin role (not super_admin, not regular users)
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email, role')
        .eq('role', 'admin')
        .order('full_name', { ascending: true })

      if (error) throw error
      if (mountedRef.current) {
        setAdmins(data || [])
      }
    } catch (error) {
      console.error('Error fetching admins:', error)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  const selectAdmin = async (admin) => {
    setSelectedAdmin(admin)
    setSaveSuccess(false)
    try {
      // Fetch existing permissions for this admin
      const { data, error } = await supabase
        .from('admin_permissions')
        .select('allowed_screens')
        .eq('user_id', admin.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows found (new admin, no permissions yet)
        throw error
      }

      if (data && data.allowed_screens) {
        setPermissions(data.allowed_screens)
      } else {
        // Default: no permissions for new admin
        setPermissions([])
      }
    } catch (error) {
      console.error('Error fetching permissions:', error)
      setPermissions([])
    }
  }

  const togglePermission = (screenKey) => {
    setPermissions(prev => {
      if (prev.includes(screenKey)) {
        return prev.filter(s => s !== screenKey)
      } else {
        return [...prev, screenKey]
      }
    })
    setSaveSuccess(false)
  }

  const selectAll = () => {
    setPermissions(MANAGEABLE_SCREENS.map(item => item.screen))
    setSaveSuccess(false)
  }

  const deselectAll = () => {
    setPermissions([])
    setSaveSuccess(false)
  }

  const savePermissions = async () => {
    if (!selectedAdmin) return
    try {
      setSaving(true)

      // Upsert: insert if not exists, update if exists
      const { error } = await supabase
        .from('admin_permissions')
        .upsert(
          {
            user_id: selectedAdmin.id,
            allowed_screens: permissions,
            updated_by: currentUser?.id || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )

      if (error) throw error

      if (mountedRef.current) {
        setSaveSuccess(true)
        setTimeout(() => {
          if (mountedRef.current) setSaveSuccess(false)
        }, 3000)
      }
    } catch (error) {
      console.error('Error saving permissions:', error)
      showNotification('Failed to save permissions: ' + error.message, 'error')
    } finally {
      if (mountedRef.current) setSaving(false)
    }
  }

  const filteredAdmins = admins.filter(admin => {
    const query = searchQuery.toLowerCase()
    return (
      (admin.full_name || '').toLowerCase().includes(query) ||
      (admin.email || '').toLowerCase().includes(query)
    )
  })

  const breadcrumbItems = [
    { label: 'Home', link: true },
    { label: 'Admin Permissions', link: false }
  ]

  return (
        <div className="ap-content">
          {/* Left Panel: Admin List */}
          <div className="ap-admin-list-panel">
            <div className="ap-panel-header">
              <h2>Admin Users</h2>
              <span className="ap-count-badge">{admins.length}</span>
            </div>
            <div className="ap-search-box">
              <i className="fa-solid fa-search"></i>
              <input
                type="text"
                placeholder="Search admins..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="ap-admin-list">
              {loading ? (
                <div className="ap-loading">
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  <span>Loading admins...</span>
                </div>
              ) : filteredAdmins.length === 0 ? (
                <div className="ap-empty">
                  <i className="fa-solid fa-user-slash"></i>
                  <span>No admin users found</span>
                </div>
              ) : (
                filteredAdmins.map(admin => (
                  <div
                    key={admin.id}
                    className={`ap-admin-card ${selectedAdmin?.id === admin.id ? 'selected' : ''}`}
                    onClick={() => selectAdmin(admin)}
                  >
                    <div className="ap-admin-avatar">
                      {(admin.full_name || admin.email || '?')[0].toUpperCase()}
                    </div>
                    <div className="ap-admin-info">
                      <span className="ap-admin-name">{admin.full_name || 'Unnamed'}</span>
                      <span className="ap-admin-email">{admin.email}</span>
                    </div>
                    <i className="fa-solid fa-chevron-right ap-chevron"></i>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Panel: Permission Manager */}
          <div className="ap-permission-panel">
            {!selectedAdmin ? (
              <div className="ap-no-selection">
                <i className="fa-solid fa-shield-halved"></i>
                <h3>Select an Admin</h3>
                <p>Choose an admin from the list to manage their screen permissions</p>
              </div>
            ) : (
              <>
                <div className="ap-permission-header">
                  <div className="ap-selected-admin">
                    <div className="ap-admin-avatar large">
                      {(selectedAdmin.full_name || selectedAdmin.email || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <h3>{selectedAdmin.full_name || 'Unnamed'}</h3>
                      <span>{selectedAdmin.email}</span>
                    </div>
                  </div>
                  <div className="ap-header-actions">
                    <button className="ap-btn-secondary" onClick={selectAll}>
                      <i className="fa-solid fa-check-double"></i>
                      Select All
                    </button>
                    <button className="ap-btn-secondary" onClick={deselectAll}>
                      <i className="fa-solid fa-xmark"></i>
                      Deselect All
                    </button>
                  </div>
                </div>

                <div className="ap-permission-grid">
                  {MANAGEABLE_SCREENS.map(item => {
                    const isGranted = permissions.includes(item.screen)
                    return (
                      <div
                        key={item.screen}
                        className={`ap-permission-card ${isGranted ? 'granted' : 'denied'}`}
                        onClick={() => togglePermission(item.screen)}
                      >
                        <div className="ap-perm-icon">
                          <i className={item.icon}></i>
                        </div>
                        <span className="ap-perm-label">{item.label}</span>
                        <div className={`ap-toggle ${isGranted ? 'on' : 'off'}`}>
                          <div className="ap-toggle-knob"></div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="ap-permission-footer">
                  <div className="ap-perm-summary">
                    <span>
                      <strong>{permissions.length}</strong> of {MANAGEABLE_SCREENS.length} screens enabled
                    </span>
                  </div>
                  <div className="ap-footer-actions">
                    {saveSuccess && (
                      <span className="ap-save-success">
                        <i className="fa-solid fa-check-circle"></i>
                        Permissions saved successfully!
                      </span>
                    )}
                    <button
                      className="ap-btn-primary"
                      onClick={savePermissions}
                      disabled={saving}
                    >
                      {saving ? (
                        <>
                          <i className="fa-solid fa-spinner fa-spin"></i>
                          Saving...
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-floppy-disk"></i>
                          Save Permissions
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
  )
}

export default AdminPermissions
