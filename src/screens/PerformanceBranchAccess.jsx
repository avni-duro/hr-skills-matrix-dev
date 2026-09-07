import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { cachedFetch, cacheDelete, TTL } from '../utils/cacheDB'
import { useNotification } from '../contexts/NotificationContext'
import './PerformanceBranchAccess.css'

function PerformanceBranchAccess() {
  const { showNotification } = useNotification()
  const mountedRef = useRef(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [users, setUsers] = useState([])
  const [branches, setBranches] = useState([])
  const [assignments, setAssignments] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUserId, setEditingUserId] = useState(null)
  const [formUserId, setFormUserId] = useState('')
  const [selectedBranchIds, setSelectedBranchIds] = useState([])

  useEffect(() => {
    mountedRef.current = true
    fetchAllData()
    return () => { mountedRef.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchAllRows = async (table, select, orderCol) => {
    const PAGE_SIZE = 1000
    let allData = []
    let from = 0
    let hasMore = true
    while (hasMore) {
      let query = supabase.from(table).select(select).range(from, from + PAGE_SIZE - 1)
      if (orderCol) query = query.order(orderCol, { ascending: true })
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

  const fetchAllData = async () => {
    try {
      setLoading(true)
      setError(null)
      const [usersResult, branchesResult] = await Promise.all([
        cachedFetch('perf_branch_users', async () => {
          const { data, error } = await supabase
            .from('users')
            .select('id, full_name, email, employee_id, role, branch_id')
            .eq('role', 'admin')
            .order('full_name', { ascending: true })
          if (error) throw error
          return data || []
        }, TTL.SHORT),
        cachedFetch('perf_branch_list', async () => {
          const { data, error } = await supabase
            .from('branches')
            .select('id, branch_name')
            .order('branch_name', { ascending: true })
          if (error) throw error
          return data || []
        }, TTL.LONG),
      ])

      const assignmentRows = await fetchAllRows('performance_dashboard_branch_access', '*', 'created_at')

      if (!mountedRef.current) return
      setUsers(Array.isArray(usersResult?.data || usersResult) ? (usersResult?.data || usersResult) : [])
      setBranches(Array.isArray(branchesResult?.data || branchesResult) ? (branchesResult?.data || branchesResult) : [])
      setAssignments(Array.isArray(assignmentRows) ? assignmentRows : [])
    } catch (err) {
      if (mountedRef.current) setError(err.message)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  const branchMap = useMemo(() => new Map(branches.map(branch => [branch.id, branch.branch_name])), [branches])

  const groupedAssignments = useMemo(() => {
    const userMap = new Map(users.map(user => [user.id, user]))
    const groups = new Map()

    assignments.forEach(row => {
      const user = userMap.get(row.user_id)
      if (!user) return
      if (!groups.has(row.user_id)) {
        groups.set(row.user_id, {
          user,
          branches: [],
          assignmentIds: [],
        })
      }
      const group = groups.get(row.user_id)
      group.branches.push({ id: row.branch_id, name: branchMap.get(row.branch_id) || 'Unknown Branch' })
      group.assignmentIds.push(row.id)
    })

    return Array.from(groups.values()).sort((a, b) => String(a.user.full_name || '').localeCompare(String(b.user.full_name || '')))
  }, [assignments, users, branchMap])

  const filteredAssignments = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return groupedAssignments
    return groupedAssignments.filter(group => {
      return [group.user.full_name, group.user.email, group.user.employee_id].some(
        value => String(value || '').toLowerCase().includes(q)
      )
    })
  }, [searchTerm, groupedAssignments])

  const openAddModal = () => {
    setEditingUserId(null)
    setFormUserId('')
    setSelectedBranchIds([])
    setModalOpen(true)
  }

  const openEditModal = (group) => {
    setEditingUserId(group.user.id)
    setFormUserId(group.user.id)
    setSelectedBranchIds(group.branches.map(b => b.id))
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingUserId(null)
    setFormUserId('')
    setSelectedBranchIds([])
  }

  const toggleBranch = (branchId) => {
    setSelectedBranchIds(prev => prev.includes(branchId) ? prev.filter(id => id !== branchId) : [...prev, branchId])
  }

  const saveAccess = async () => {
    if (!formUserId) return showNotification('Please select a user', 'error')
    if (selectedBranchIds.length === 0) return showNotification('Please select at least one branch', 'error')

    try {
      setSaving(true)
      const { error: delError } = await supabase
        .from('performance_dashboard_branch_access')
        .delete()
        .eq('user_id', formUserId)
      if (delError) throw delError

      const rows = selectedBranchIds.map(branchId => ({ user_id: formUserId, branch_id: branchId }))
      const { error: insError } = await supabase
        .from('performance_dashboard_branch_access')
        .insert(rows)
      if (insError) throw insError

      await cacheDelete('perf_dashboard_branch_access_' + formUserId)
      await fetchAllData()
      closeModal()
      showNotification('Performance branch access saved!', 'success')
    } catch (err) {
      showNotification('Error: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const deleteAccess = async (userId) => {
    if (!confirm('Remove all branch access for this user?')) return
    try {
      setSaving(true)
      const { error } = await supabase
        .from('performance_dashboard_branch_access')
        .delete()
        .eq('user_id', userId)
      if (error) throw error
      await cacheDelete('perf_dashboard_branch_access_' + userId)
      await fetchAllData()
      showNotification('Branch access removed!', 'success')
    } catch (err) {
      showNotification('Error: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading && assignments.length === 0) {
    return <main className="pba-main"><div className="pba-loading"><i className="fa-solid fa-spinner fa-spin"></i><span>Loading...</span></div></main>
  }

  return (
    <main className="pba-container">
      <div className="pba-page-header">
        <div className="pba-header-content">
          <h1>Performance Branch Access</h1>
          <p>Manage branch access for DURO Lakshya Dashboard users</p>
        </div>
        <div className="pba-header-actions">
          <button className="pba-btn pba-btn-secondary" onClick={fetchAllData} disabled={loading || saving}>
            <i className={`fa-solid fa-rotate-right ${loading ? 'fa-spin' : ''}`}></i>
            Refresh
          </button>
          <button className="pba-btn pba-btn-primary" onClick={openAddModal} disabled={users.length === 0}>
            <i className="fa-solid fa-plus"></i>
            Add New
          </button>
        </div>
      </div>

      {error && <div className="pba-error-banner"><i className="fa-solid fa-circle-exclamation"></i><span>{error}</span></div>}

      <div className="pba-table-section">
        <div className="pba-search-bar">
          <i className="fa-solid fa-search"></i>
          <input 
            type="text" 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            placeholder="Search by name, email or employee ID..." 
          />
        </div>

        {filteredAssignments.length === 0 ? (
          <div className="pba-empty-state">
            <div className="pba-empty-icon"><i className="fa-solid fa-inbox"></i></div>
            <h2>No branch access assigned</h2>
            <p>Click "Add New" to assign branches to admin users</p>
          </div>
        ) : (
          <div className="pba-table-wrapper">
            <table className="pba-data-table">
              <thead>
                <tr>
                  <th>Admin User</th>
                  <th>Branches Assigned</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssignments.map(group => (
                  <tr key={group.user.id}>
                    <td>
                      <div className="pba-user-info">
                        <div className="pba-user-avatar-small">{(group.user.full_name || group.user.email || '?')[0].toUpperCase()}</div>
                        <div className="pba-user-details">
                          <strong>{group.user.full_name || 'Unnamed'}</strong>
                          <div className="pba-user-meta">{group.user.email}</div>
                          {group.user.employee_id && <div className="pba-user-meta">{group.user.employee_id}</div>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="pba-branches-list">
                        {group.branches.map(branch => (
                          <span key={branch.id} className="pba-branch-tag">{branch.name}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="pba-action-buttons">
                        <button className="pba-btn pba-btn-icon pba-btn-edit" onClick={() => openEditModal(group)} disabled={saving}>
                          <i className="fa-solid fa-pen"></i>
                          Edit
                        </button>
                        <button className="pba-btn pba-btn-icon pba-btn-delete" onClick={() => deleteAccess(group.user.id)} disabled={saving}>
                          <i className="fa-solid fa-trash"></i>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="pba-modal-overlay" onClick={closeModal}>
          <div className="pba-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pba-modal-header">
              <h2>{editingUserId ? 'Edit Branch Access' : 'Add New Branch Access'}</h2>
              <button className="pba-modal-close" onClick={closeModal}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="pba-modal-body">
              <div className="pba-form-group">
                <label>Select Admin User</label>
                <select 
                  value={formUserId} 
                  onChange={(e) => setFormUserId(e.target.value)}
                  disabled={editingUserId !== null}
                  className="pba-select"
                >
                  <option value="">-- Choose a user --</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.full_name || 'Unnamed'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pba-form-group">
                <label>Select Branches</label>
                <div className="pba-branches-toggle-grid">
                  {branches.map(branch => (
                    <div key={branch.id} className="pba-branch-toggle-item">
                      <span>{branch.branch_name}</span>
                      <label className="pba-toggle-switch">
                        <input 
                          type="checkbox" 
                          checked={selectedBranchIds.includes(branch.id)}
                          onChange={() => toggleBranch(branch.id)}
                        />
                        <span className="pba-toggle-slider"></span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pba-modal-footer">
              <button className="pba-btn pba-btn-secondary" onClick={closeModal} disabled={saving}>
                Cancel
              </button>
              <button className="pba-btn pba-btn-primary" onClick={saveAccess} disabled={saving || !formUserId || selectedBranchIds.length === 0}>
                {saving ? <><i className="fa-solid fa-spinner fa-spin"></i><span>Saving...</span></> : <><i className="fa-solid fa-floppy-disk"></i><span>Save</span></>}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default PerformanceBranchAccess