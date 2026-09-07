import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { cachedFetch, cacheDelete, TTL } from '../utils/cacheDB'
import { useNotification } from '../contexts/NotificationContext'
import './AssignModules.css'

function AssignModules() {
  const mountedRef = useRef(true)
  const [loading, setLoading] = useState(true)
  const { showNotification } = useNotification()
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [users, setUsers] = useState([])
  const [modules, setModules] = useState([])
  const [assignments, setAssignments] = useState([])
  const [selectedUser, setSelectedUser] = useState('')
  const [selectedModules, setSelectedModules] = useState([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [userSearchTerm, setUserSearchTerm] = useState('')
  const [userFilter, setUserFilter] = useState('All Users')
  const [error, setError] = useState(null)
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)
  const [selectedUserDetail, setSelectedUserDetail] = useState(null)
  const [assignType, setAssignType] = useState('single') // 'single' | 'multiple' | 'department'
  const [selectedUsers, setSelectedUsers] = useState([]) // for multiple mode
  const [selectedDepartment, setSelectedDepartment] = useState('') // for department mode
  const [departments, setDepartments] = useState([])
  const [checkedRows, setCheckedRows] = useState([]) // user ids checked in the table
  const [categories, setCategories] = useState([])
  const [categoryFilter, setCategoryFilter] = useState('')
  const [moduleSearchTerm, setModuleSearchTerm] = useState('')
  const [moduleSelectMode, setModuleSelectMode] = useState('manual') // 'manual' | 'category'
  const [selectedCategories, setSelectedCategories] = useState([])
  const [bulkEditModalOpen, setBulkEditModalOpen] = useState(false)
  const [bulkEditStart, setBulkEditStart] = useState('')
  const [bulkEditEnd, setBulkEditEnd] = useState('')
  const [bulkEditStatus, setBulkEditStatus] = useState('')
  const [editingUserId, setEditingUserId] = useState(null) // null = create mode, userId = edit mode

  const breadcrumbItems = [
    { label: 'Home', link: true },
    { label: 'Assign Modules', link: false }
  ]

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
      await Promise.all([fetchUsers(), fetchModules(), fetchAssignments(), fetchDepartments(), fetchCategories()])
    } catch (err) {
      console.error('Error fetching data:', err)
      if (mountedRef.current) setError(err.message)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  const fetchUsers = async () => {
    try {
      const { data } = await cachedFetch('users_assign_modules', async () => {
        const { data, error } = await supabase
          .from('users')
          .select('id, full_name, email, employee_id, role, department_id')
          .order('full_name', { ascending: true })
        if (error) throw error
        return data || []
      }, TTL.SHORT)

      if (mountedRef.current) {
        setUsers(Array.isArray(data) ? data : [])
      }
    } catch (error) {
      console.error('Error fetching users:', error)
      throw error
    }
  }

  const fetchCategories = async () => {
    try {
      const { data } = await cachedFetch('categories', async () => {
        const { data, error } = await supabase
          .from('categories')
          .select('id, name')
          .order('name', { ascending: true })
        if (error) throw error
        return data || []
      }, TTL.LONG)
      if (mountedRef.current) setCategories(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Error fetching categories:', error)
    }
  }

  const fetchModules = async () => {
    try {
      const { data } = await cachedFetch('modules_assign', async () => {
        const { data, error } = await supabase
          .from('modules')
          .select('id, title, description, category_id')
          .order('title', { ascending: true })
        if (error) throw error
        return data || []
      }, TTL.SHORT)

      if (mountedRef.current) {
        setModules(Array.isArray(data) ? data : [])
      }
    } catch (error) {
      console.error('Error fetching modules:', error)
      throw error
    }
  }

  const fetchAssignments = async () => {
    try {
      const allData = []
      const PAGE_SIZE = 1000
      let from = 0
      let hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('user_module_assignments')
          .select(`
            *,
            users:user_id (id, full_name, email, employee_id),
            modules:module_id (id, title)
          `)
          .order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1)

        if (error) throw error

        if (data && data.length > 0) {
          allData.push(...data)
          from += PAGE_SIZE
          if (data.length < PAGE_SIZE) hasMore = false
        } else {
          hasMore = false
        }
      }

      if (mountedRef.current) {
        setAssignments(allData)
      }
    } catch (error) {
      console.error('Error fetching assignments:', error)
      // Don't throw - assignments table might not exist yet
    }
  }

  const fetchDepartments = async () => {
    try {
      const { data } = await cachedFetch('departments_list', async () => {
        const { data, error } = await supabase
          .from('departments')
          .select('id, department_name')
          .order('department_name', { ascending: true })
        if (error) throw error
        return data || []
      }, TTL.SHORT)
      if (mountedRef.current) setDepartments(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Error fetching departments:', error)
    }
  }

  const openEditModal = (group) => {
    setEditingUserId(group.user?.id)
    setAssignType('single')
    setSelectedUser(group.user?.id || '')
    setSelectedModules(group.assignments.map(a => a.module_id))
    setStartDate(group.earliestStart || '')
    setEndDate(group.latestEnd || '')
    setSelectedUsers([])
    setSelectedDepartment('')
    setUserSearchTerm('')
    setCategoryFilter('')
    setModuleSearchTerm('')
    setModuleSelectMode('manual')
    setSelectedCategories([])
    setAssignModalOpen(true)
  }

  const handleModuleToggle = (moduleId) => {
    setSelectedModules(prev => {
      if (prev.includes(moduleId)) {
        return prev.filter(id => id !== moduleId)
      } else {
        return [...prev, moduleId]
      }
    })
  }

  const handleSelectAllModules = () => {
    if (selectedModules.length === filteredModules.length && filteredModules.length > 0) {
      setSelectedModules([])
    } else {
      setSelectedModules(filteredModules.map(m => m.id))
    }
  }

  const handleUserToggle = (userId) => {
    setSelectedUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    )
  }

  const handleAssign = async (e) => {
    e.preventDefault()

    if (assignType === 'single' && !selectedUser) {
      showNotification('Please select a user', 'warning')
      return
    }
    if (assignType === 'multiple' && selectedUsers.length === 0) {
      showNotification('Please select at least one user', 'warning')
      return
    }
    if (assignType === 'department' && !selectedDepartment) {
      showNotification('Please select a department', 'warning')
      return
    }

    if (selectedModules.length === 0) {
      showNotification('Please select at least one module', 'warning')
      return
    }

    if (!startDate || !endDate) {
      showNotification('Please select both start and end dates', 'warning')
      return
    }

    if (new Date(endDate) < new Date(startDate)) {
      showNotification('End date must be after start date', 'warning')
      return
    }

    try {
      setLoading(true)

      let targetUserIds = []

      if (assignType === 'single') {
        targetUserIds = [selectedUser]
      } else if (assignType === 'multiple') {
        targetUserIds = selectedUsers
      } else if (assignType === 'department') {
        const { data: deptUsers, error: deptError } = await supabase
          .from('users')
          .select('id')
          .eq('department_id', selectedDepartment)
        if (deptError) throw deptError
        if (!deptUsers || deptUsers.length === 0) {
            showNotification('No users found in the selected department', 'warning')
          setLoading(false)
          return
        }
        targetUserIds = deptUsers.map(u => u.id)
      }

      // In edit mode: delete existing assignments for target users first, then re-insert
      if (editingUserId) {
        const { error: delError } = await supabase
          .from('user_module_assignments')
          .delete()
          .in('user_id', targetUserIds)
        if (delError) throw delError
      }

      // Build assignments for all target users × selected modules
      const assignmentsToInsert = []
      for (const userId of targetUserIds) {
        for (const moduleId of selectedModules) {
          assignmentsToInsert.push({
            user_id: userId,
            module_id: moduleId,
            start_date: startDate,
            end_date: endDate,
            status: 'active',
            created_at: new Date().toISOString()
          })
        }
      }

      const { error } = await supabase
        .from('user_module_assignments')
        .upsert(assignmentsToInsert, {
          onConflict: 'user_id,module_id'
        })

      if (error) throw error

      const msg = assignType === 'department'
        ? `Modules assigned to ${targetUserIds.length} user(s) in the department!`
        : editingUserId
        ? `Modules updated successfully!`
        : `Modules assigned successfully to ${targetUserIds.length} user(s)!`
      showNotification(msg, 'success')

      // Reset form
      setSelectedUser('')
      setSelectedUsers([])
      setSelectedDepartment('')
      setSelectedModules([])
      setStartDate('')
      setEndDate('')
      setUserSearchTerm('')
      setCategoryFilter('')
      setModuleSearchTerm('')
      setEditingUserId(null)
      setAssignModalOpen(false)

      // Invalidate cache and refresh
      await cacheDelete('user_module_assignments')
      await fetchAssignments()

    } catch (error) {
      console.error('Error assigning modules:', error)
            showNotification('Error assigning modules: ' + error.message, 'error')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  const handleDeleteAssignment = async (assignmentId) => {
    if (!confirm('Are you sure you want to remove this assignment?')) return

    try {
      setLoading(true)
      const { error } = await supabase
        .from('user_module_assignments')
        .delete()
        .eq('id', assignmentId)

      if (error) throw error

      showNotification('Assignment removed successfully!', 'success')
      await cacheDelete('user_module_assignments')
      await fetchAssignments()
    } catch (error) {
      console.error('Error deleting assignment:', error)
      showNotification('Error removing assignment: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleBulkEdit = async (e) => {
    e.preventDefault()
    if (checkedRows.length === 0) return
    if (!bulkEditStart && !bulkEditEnd && !bulkEditStatus) {
      showNotification('Please fill at least one field to update.', 'warning')
      return
    }
    if (bulkEditStart && bulkEditEnd && new Date(bulkEditEnd) < new Date(bulkEditStart)) {
      showNotification('End date must be after start date.', 'warning')
      return
    }
    try {
      setLoading(true)
      const updates = {}
      if (bulkEditStart) updates.start_date = bulkEditStart
      if (bulkEditEnd) updates.end_date = bulkEditEnd
      if (bulkEditStatus) updates.status = bulkEditStatus
      const { error } = await supabase
        .from('user_module_assignments')
        .update(updates)
        .in('user_id', checkedRows)
      if (error) throw error
      showNotification(`Assignments updated for ${checkedRows.length} user(s).`, 'success')
      setBulkEditModalOpen(false)
      setBulkEditStart('')
      setBulkEditEnd('')
      setBulkEditStatus('')
      setCheckedRows([])
      await cacheDelete('user_module_assignments')
      await fetchAssignments()
    } catch (error) {
      console.error('Error bulk editing:', error)
      showNotification('Error updating assignments: ' + error.message, 'error')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  const handleBulkDelete = async () => {
    if (checkedRows.length === 0) return
    if (!confirm(`Are you sure you want to delete ALL module assignments for ${checkedRows.length} selected user(s)?`)) return
    try {
      setLoading(true)
      const { error } = await supabase
        .from('user_module_assignments')
        .delete()
        .in('user_id', checkedRows)
      if (error) throw error
      showNotification(`Assignments removed for ${checkedRows.length} user(s).`, 'success')
      setCheckedRows([])
      await cacheDelete('user_module_assignments')
      await fetchAssignments()
    } catch (error) {
      console.error('Error bulk deleting:', error)
      showNotification('Error removing assignments: ' + error.message, 'error')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  const handleDeleteAllUserAssignments = async (userId) => {
    if (!confirm('Are you sure you want to remove ALL module assignments for this user?')) return

    try {
      setLoading(true)
      const { error } = await supabase
        .from('user_module_assignments')
        .delete()
        .eq('user_id', userId)

      if (error) throw error

      showNotification('All assignments removed successfully!', 'success')
      await cacheDelete('user_module_assignments')
      await fetchAssignments()
      setDetailDrawerOpen(false)
    } catch (error) {
      console.error('Error deleting assignments:', error)
      showNotification('Error removing assignments: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const openDetailDrawer = (groupedUser) => {
    setSelectedUserDetail(groupedUser)
    setDetailDrawerOpen(true)
  }

  const getOverallStatus = (statuses) => {
    if (statuses.every(s => s === 'active')) return 'active'
    if (statuses.every(s => s === 'completed')) return 'completed'
    if (statuses.every(s => s === 'inactive')) return 'inactive'
    return 'mixed'
  }

  const filteredAssignments = assignments.filter(assignment => {
    const userName = assignment.users?.full_name?.toLowerCase() || ''
    const userEmail = assignment.users?.email?.toLowerCase() || ''
    const moduleName = assignment.modules?.title?.toLowerCase() || ''
    const search = searchTerm.toLowerCase()

    const matchesSearch = userName.includes(search) || userEmail.includes(search) || moduleName.includes(search)
    
    return matchesSearch
  })

  // Group assignments by user
  const groupedAssignments = useMemo(() => {
    const grouped = {}
    
    filteredAssignments.forEach(assignment => {
      const userId = assignment.user_id
      if (!grouped[userId]) {
        grouped[userId] = {
          user: assignment.users,
          assignments: [],
          moduleCount: 0,
          earliestStart: assignment.start_date,
          latestEnd: assignment.end_date,
          statuses: []
        }
      }
      
      grouped[userId].assignments.push(assignment)
      grouped[userId].moduleCount++
      grouped[userId].statuses.push(assignment.status)
      
      // Track earliest start and latest end
      if (new Date(assignment.start_date) < new Date(grouped[userId].earliestStart)) {
        grouped[userId].earliestStart = assignment.start_date
      }
      if (new Date(assignment.end_date) > new Date(grouped[userId].latestEnd)) {
        grouped[userId].latestEnd = assignment.end_date
      }
    })
    
    return Object.values(grouped)
  }, [filteredAssignments])

  // Filter modules in modal based on category and search
  const filteredModules = useMemo(() => {
    return modules.filter(m => {
      const matchesCategory = !categoryFilter || m.category_id === categoryFilter
      const q = moduleSearchTerm.toLowerCase()
      const matchesSearch = !q || m.title?.toLowerCase().includes(q) || m.description?.toLowerCase().includes(q)
      return matchesCategory && matchesSearch
    })
  }, [modules, categoryFilter, moduleSearchTerm])

  // Filter users in modal based on search
  const filteredUsers = users.filter(user => {
    const search = userSearchTerm.toLowerCase()
    const name = user.full_name?.toLowerCase() || ''
    const email = user.email?.toLowerCase() || ''
    const empId = user.employee_id?.toLowerCase() || ''
    
    return name.includes(search) || email.includes(search) || empId.includes(search)
  })

  
  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  if (loading && assignments.length === 0) {
    return (
      <main className="assign-modules-main">
        <div className="loading-state">
          <i className="fa-solid fa-spinner fa-spin"></i>
          <span>Loading...</span>
        </div>
      </main>
    )
  }

  return (
    <>
      <main className="assign-modules-main">
        <section className="assign-modules-header">
          <div>
            <h2>Assign Modules</h2>
            <p>Assign modules to users with date ranges</p>
          </div>
          <div>
            <button 
              className="btn btn-secondary" 
              onClick={() => fetchAllData()} 
              disabled={loading}
            >
              <i className={`fa-solid fa-refresh ${loading ? 'fa-spin' : ''}`}></i>
              Refresh
            </button>
            <button 
              className="btn btn-primary" 
              onClick={() => {
                setAssignModalOpen(true)
                setAssignType('single')
                setSelectedUser('')
                setSelectedUsers([])
                setSelectedDepartment('')
                setSelectedModules([])
                setStartDate('')
                setEndDate('')
                setUserSearchTerm('')
                setCategoryFilter('')
                setModuleSearchTerm('')
                setModuleSelectMode('manual')
                setSelectedCategories([])
              }}
            >
              <i className="fa-solid fa-plus"></i>
              Assign Module
            </button>
          </div>
        </section>

        {error && (
          <div className="error-message">
            <i className="fa-solid fa-circle-exclamation"></i>
            <span>{error}</span>
          </div>
        )}

        {/* Filters */}
        <div className="filters-section">
          <div className="search-wrapper">
            <i className="fa-solid fa-search"></i>
            <input
              type="text"
              placeholder="Search by user or module..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Bulk action bar */}
        {checkedRows.length > 0 && (
          <div className="bulk-action-bar">
            <span className="bulk-count"><i className="fa-solid fa-check-square"></i> {checkedRows.length} user{checkedRows.length !== 1 ? 's' : ''} selected</span>
            <div className="bulk-actions">
              <button
                className="btn btn-primary"
                onClick={() => {
                  // Find groups for all checked users
                  const checkedGroups = groupedAssignments.filter(g => checkedRows.includes(g.user?.id))

                  // Pre-select modules common to ALL checked users (intersection)
                  let preModules = []
                  if (checkedGroups.length === 1) {
                    preModules = checkedGroups[0].assignments.map(a => a.module_id)
                  } else if (checkedGroups.length > 1) {
                    const firstSet = new Set(checkedGroups[0].assignments.map(a => a.module_id))
                    preModules = checkedGroups.slice(1).reduce(
                      (acc, g) => acc.filter(id => g.assignments.some(a => a.module_id === id)),
                      [...firstSet]
                    )
                  }

                  // Pre-fill dates only if all checked users share the same value
                  const allSameStart = checkedGroups.length > 0 && checkedGroups.every(g => g.earliestStart === checkedGroups[0].earliestStart)
                  const allSameEnd = checkedGroups.length > 0 && checkedGroups.every(g => g.latestEnd === checkedGroups[0].latestEnd)

                  setSelectedUsers(checkedRows)
                  setAssignType('multiple')
                  setEditingUserId('bulk')
                  setSelectedModules(preModules)
                  setStartDate(allSameStart ? checkedGroups[0]?.earliestStart || '' : '')
                  setEndDate(allSameEnd ? checkedGroups[0]?.latestEnd || '' : '')
                  setUserSearchTerm('')
                  setSelectedUser('')
                  setSelectedDepartment('')
                  setModuleSelectMode('manual')
                  setSelectedCategories([])
                  setAssignModalOpen(true)
                }}
                disabled={loading}
              >
                <i className="fa-solid fa-pen"></i> Edit Assignments
              </button>
              <button
                className="btn btn-danger"
                onClick={handleBulkDelete}
                disabled={loading}
              >
                <i className="fa-solid fa-trash"></i> Delete Assignments
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setCheckedRows([])}
              >
                <i className="fa-solid fa-xmark"></i> Clear Selection
              </button>
            </div>
          </div>
        )}

        {/* Assignments Table */}
        <div className="assignments-table-container">
          <div className="table-header-row">
            <h3>Module Assignments</h3>
            <span className="assignments-count">{groupedAssignments.length} user{groupedAssignments.length !== 1 ? 's' : ''}</span>
          </div>

          {groupedAssignments.length === 0 ? (
            <div className="empty-state">
              <i className="fa-solid fa-clipboard-list"></i>
              <p>No module assignments found</p>
              <button className="btn btn-primary" onClick={() => setAssignModalOpen(true)}>
                <i className="fa-solid fa-plus"></i>
                Create First Assignment
              </button>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="assignments-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>
                      <input
                        type="checkbox"
                        className="row-checkbox"
                        title="Select all"
                        checked={checkedRows.length === groupedAssignments.length && groupedAssignments.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) setCheckedRows(groupedAssignments.map(g => g.user?.id).filter(Boolean))
                          else setCheckedRows([])
                        }}
                      />
                    </th>
                    <th>#</th>
                    <th>User</th>
                    <th>Modules</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedAssignments.map((group, index) => {
                    const overallStatus = getOverallStatus(group.statuses)
                    const userId = group.user?.id
                    const isChecked = checkedRows.includes(userId)
                    return (
                      <tr 
                        key={userId || index} 
                        className={`assignments-table-row${isChecked ? ' row-selected' : ''}`}
                        onClick={() => openDetailDrawer(group)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="row-checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) setCheckedRows(prev => [...prev, userId])
                              else setCheckedRows(prev => prev.filter(id => id !== userId))
                            }}
                          />
                        </td>
                        <td>{index + 1}</td>
                        <td>
                          <div className="user-info">
                            <div className="user-name">{group.user?.full_name || 'Unknown User'}</div>
                            <div className="user-email">{group.user?.email || '-'}</div>
                          </div>
                        </td>
                        <td>
                          <span className="module-count-badge">
                            {group.moduleCount} module{group.moduleCount !== 1 ? 's' : ''}
                          </span>
                        </td>
                        <td>{formatDate(group.earliestStart)}</td>
                        <td>{formatDate(group.latestEnd)}</td>
                        <td>
                          <span className={`status-badge status-${overallStatus}`}>
                            {overallStatus}
                          </span>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                              className="btn-icon btn-view"
                              onClick={() => openDetailDrawer(group)}
                              title="View details"
                            >
                              <i className="fa-solid fa-eye"></i>
                            </button>
                            <button
                              className="btn-icon btn-edit"
                              onClick={() => openEditModal(group)}
                              title="Edit assignments"
                            >
                              <i className="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button
                              className="btn-icon btn-delete"
                              onClick={() => handleDeleteAllUserAssignments(group.user?.id)}
                              title="Delete all assignments"
                            >
                              <i className="fa-solid fa-trash"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Assign Modal */}
      {assignModalOpen && (
        <div className="modal-backdrop" onClick={() => {
          setAssignModalOpen(false)
          setEditingUserId(null)
          setUserSearchTerm('')
          setCategoryFilter('')
          setModuleSearchTerm('')
        }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {editingUserId
                  ? (editingUserId === 'bulk'
                      ? `Edit Assignments — ${selectedUsers.length} user${selectedUsers.length !== 1 ? 's' : ''}`
                      : 'Edit Module Assignments')
                  : (assignType === 'single' ? 'Assign Modules to User' :
                     assignType === 'multiple' ? 'Assign Modules to Multiple Users' :
                     'Assign Modules to Department')}
              </h3>
              <button onClick={() => {
                setAssignModalOpen(false)
                setEditingUserId(null)
                setUserSearchTerm('')
                setCategoryFilter('')
                setModuleSearchTerm('')
              }}>
                <i className="fa-solid fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleAssign}>
              <div className="modal-body">
                {/* Assignment Type — hidden in edit mode */}
                {!editingUserId && (
                <div className="form-group">
                  <label htmlFor="assign_type">Assignment Type *</label>
                  <select
                    id="assign_type"
                    value={assignType}
                    onChange={(e) => {
                      setAssignType(e.target.value)
                      setSelectedUser('')
                      setSelectedUsers([])
                      setSelectedDepartment('')
                      setUserSearchTerm('')
                    }}
                  >
                    <option value="single">Single User</option>
                    <option value="multiple">Multiple Users</option>
                    <option value="department">Assign to Department</option>
                  </select>
                </div>
                )}

                {/* Single User — locked display in edit mode */}
                {assignType === 'single' && (
                  <div className="form-group">
                    <label htmlFor="user_search">Select User *</label>
                    {editingUserId ? (
                      <div className="selected-user-display" style={{ marginTop: 0 }}>
                        <i className="fa-solid fa-user"></i>
                        {users.find(u => u.id === selectedUser)?.full_name || selectedUser}
                        <span style={{ marginLeft: '0.5rem', color: '#9CA3AF', fontSize: '0.75rem' }}>(locked)</span>
                      </div>
                    ) : (
                      <div className="searchable-select">
                      <input
                        type="text"
                        id="user_search"
                        placeholder="Search by name, email or ID..."
                        value={userSearchTerm}
                        onChange={(e) => setUserSearchTerm(e.target.value)}
                        className="search-input"
                      />
                      <select
                        id="user_select"
                        value={selectedUser}
                        onChange={(e) => setSelectedUser(e.target.value)}
                        required
                        size="5"
                        className="user-select-list"
                      >
                        <option value="">-- Select User --</option>
                        {filteredUsers.length === 0 ? (
                          <option disabled>No users found</option>
                        ) : (
                          filteredUsers.map(user => (
                            <option key={user.id} value={user.id}>
                              {user.full_name} ({user.email})
                            </option>
                          ))
                        )}
                      </select>
                      {selectedUser && (
                        <div className="selected-user-display">
                          <i className="fa-solid fa-check-circle"></i>
                          Selected: {users.find(u => u.id === selectedUser)?.full_name}
                        </div>
                      )}
                      </div>
                    )}
                  </div>
                )}

                {/* Multiple Users */}
                {assignType === 'multiple' && (
                  <div className="form-group">
                    <label>
                      Select Users *
                      <button
                        type="button"
                        className="select-all-btn"
                        onClick={() => setSelectedUsers(
                          selectedUsers.length === filteredUsers.length
                            ? []
                            : filteredUsers.map(u => u.id)
                        )}
                      >
                        {selectedUsers.length === filteredUsers.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </label>
                    <input
                      type="text"
                      placeholder="Search users..."
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                      className="search-input"
                      style={{ marginBottom: '0.5rem' }}
                    />
                    <div className="modules-list">
                      {filteredUsers.length === 0 ? (
                        <p style={{ color: '#6B7280', fontSize: '0.875rem' }}>No users found</p>
                      ) : (
                        filteredUsers.map(user => (
                          <label key={user.id} className="module-checkbox">
                            <input
                              type="checkbox"
                              checked={selectedUsers.includes(user.id)}
                              onChange={() => handleUserToggle(user.id)}
                            />
                            <div style={{ flex: 1 }}>
                              <span className="module-title">{user.full_name}</span>
                              <span className="module-description">{user.email}</span>
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                    {selectedUsers.length > 0 && (
                      <small style={{ color: '#3B82F6', marginTop: '0.5rem', display: 'block' }}>
                        {selectedUsers.length} user{selectedUsers.length !== 1 ? 's' : ''} selected
                      </small>
                    )}
                  </div>
                )}

                {/* Department */}
                {assignType === 'department' && (
                  <div className="form-group">
                    <label htmlFor="dept_select">Select Department *</label>
                    <select
                      id="dept_select"
                      value={selectedDepartment}
                      onChange={(e) => setSelectedDepartment(e.target.value)}
                      required
                    >
                      <option value="">-- Select Department --</option>
                      {departments.map(dept => (
                        <option key={dept.id} value={dept.id}>{dept.department_name}</option>
                      ))}
                    </select>
                    {selectedDepartment && (
                      <small style={{ color: '#3B82F6', marginTop: '0.5rem', display: 'block' }}>
                        <i className="fa-solid fa-info-circle"></i> Modules will be assigned to all users in this department
                      </small>
                    )}
                  </div>
                )}

                {/* Module Selection Mode Toggle */}
                <div className="form-group">
                  <label>Select Modules *</label>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${moduleSelectMode === 'manual' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => { setModuleSelectMode('manual'); setSelectedCategories([]); }}
                      style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
                    >
                      <i className="fa-solid fa-hand-pointer"></i> Pick Modules
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${moduleSelectMode === 'category' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => { setModuleSelectMode('category'); setSelectedModules([]); setCategoryFilter(''); setModuleSearchTerm(''); }}
                      style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
                    >
                      <i className="fa-solid fa-layer-group"></i> Pick by Category
                    </button>
                  </div>

                  {moduleSelectMode === 'category' ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <small style={{ color: '#6B7280' }}>Select categories to auto-assign all their modules</small>
                        <button
                          type="button"
                          className="select-all-btn"
                          onClick={() => {
                            if (selectedCategories.length === categories.length) {
                              setSelectedCategories([])
                              setSelectedModules([])
                            } else {
                              const allCatIds = categories.map(c => c.id)
                              setSelectedCategories(allCatIds)
                              setSelectedModules(modules.filter(m => allCatIds.includes(m.category_id)).map(m => m.id))
                            }
                          }}
                        >
                          {selectedCategories.length === categories.length ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                      <div className="modules-list">
                        {categories.length === 0 ? (
                          <p style={{ color: '#6B7280', fontSize: '0.875rem' }}>No categories found</p>
                        ) : (
                          categories.map(cat => {
                            const catModuleCount = modules.filter(m => m.category_id === cat.id).length
                            return (
                              <label key={cat.id} className="module-checkbox">
                                <input
                                  type="checkbox"
                                  checked={selectedCategories.includes(cat.id)}
                                  onChange={() => {
                                    const newCats = selectedCategories.includes(cat.id)
                                      ? selectedCategories.filter(id => id !== cat.id)
                                      : [...selectedCategories, cat.id]
                                    setSelectedCategories(newCats)
                                    setSelectedModules(modules.filter(m => newCats.includes(m.category_id)).map(m => m.id))
                                  }}
                                />
                                <div style={{ flex: 1 }}>
                                  <span className="module-title">{cat.name}</span>
                                  <span className="module-description">{catModuleCount} module{catModuleCount !== 1 ? 's' : ''}</span>
                                </div>
                              </label>
                            )
                          })
                        )}
                      </div>
                      {selectedCategories.length > 0 && (
                        <small style={{ color: '#3B82F6', marginTop: '0.5rem', display: 'block' }}>
                          {selectedCategories.length} categor{selectedCategories.length !== 1 ? 'ies' : 'y'} selected → {selectedModules.length} module{selectedModules.length !== 1 ? 's' : ''} will be assigned
                        </small>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.3rem' }}>
                        <button
                          type="button"
                          className="select-all-btn"
                          onClick={() => {
                            if (selectedModules.length === filteredModules.length && filteredModules.length > 0) {
                              setSelectedModules([])
                            } else {
                              setSelectedModules(filteredModules.map(m => m.id))
                            }
                          }}
                        >
                          {selectedModules.length === filteredModules.length && filteredModules.length > 0 ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                      {/* Category filter */}
                      <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        style={{ marginBottom: '0.5rem' }}
                      >
                        <option value="">All Categories</option>
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                      {/* Module search */}
                      <input
                        type="text"
                        placeholder="Search modules..."
                        value={moduleSearchTerm}
                        onChange={(e) => setModuleSearchTerm(e.target.value)}
                        className="search-input"
                        style={{ marginBottom: '0.5rem' }}
                      />
                      <div className="modules-list">
                        {filteredModules.length === 0 ? (
                          <p style={{ color: '#6B7280', fontSize: '0.875rem' }}>No modules found</p>
                        ) : (
                          filteredModules.map(module => (
                            <label key={module.id} className="module-checkbox">
                              <input
                                type="checkbox"
                                checked={selectedModules.includes(module.id)}
                                onChange={() => handleModuleToggle(module.id)}
                              />
                              <div style={{ flex: 1 }}>
                                <span className="module-title">{module.title}</span>
                                {module.description && (
                                  <span className="module-description">{module.description}</span>
                                )}
                              </div>
                            </label>
                          ))
                        )}
                      </div>
                      {selectedModules.length > 0 && (
                        <small style={{ color: '#3B82F6', marginTop: '0.5rem', display: 'block' }}>
                          {selectedModules.length} module{selectedModules.length !== 1 ? 's' : ''} selected
                        </small>
                      )}
                    </>
                  )}
                </div>

                {/* Date Range */}
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="start_date">Start Date *</label>
                    <input
                      type="date"
                      id="start_date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="end_date">End Date *</label>
                    <input
                      type="date"
                      id="end_date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={startDate}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setAssignModalOpen(false)
                    setUserSearchTerm('')
                    setCategoryFilter('')
                    setModuleSearchTerm('')
                  }}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || selectedModules.length === 0}
                >
                  {loading ? 'Assigning...' : 'Assign Modules'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      {detailDrawerOpen && selectedUserDetail && (
        <div className="modal-backdrop" onClick={() => setDetailDrawerOpen(false)}>
          <div className="detail-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-title">
                <h3>{selectedUserDetail.user?.full_name}'s Module Assignments</h3>
                <div className="drawer-subtitle">
                  {selectedUserDetail.user?.email} • {selectedUserDetail.moduleCount} module{selectedUserDetail.moduleCount !== 1 ? 's' : ''}
                </div>
              </div>
              <button className="btn-close" onClick={() => setDetailDrawerOpen(false)}>
                <i className="fa-solid fa-times"></i>
              </button>
            </div>
            
            <div className="drawer-body">
              <div className="detail-table-scroll">
                <table className="detail-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Module Name</th>
                      <th>Start Date</th>
                      <th>End Date</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedUserDetail.assignments.map((assignment, index) => (
                      <tr key={assignment.id}>
                        <td>{index + 1}</td>
                        <td>{assignment.modules?.title || 'Unknown Module'}</td>
                        <td>{formatDate(assignment.start_date)}</td>
                        <td>{formatDate(assignment.end_date)}</td>
                        <td>
                          <span className={`status-badge status-${assignment.status || 'active'}`}>
                            {assignment.status || 'active'}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn-icon btn-delete"
                            onClick={() => handleDeleteAssignment(assignment.id)}
                            title="Delete this assignment"
                          >
                            <i className="fa-solid fa-trash"></i>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="drawer-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setDetailDrawerOpen(false)}
              >
                Close
              </button>
              <button
                className="btn btn-danger"
                onClick={() => handleDeleteAllUserAssignments(selectedUserDetail.user?.id)}
                disabled={loading}
              >
                <i className="fa-solid fa-trash"></i> Delete All Assignments
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Edit Modal */}
      {bulkEditModalOpen && (
        <div className="modal-backdrop" onClick={() => setBulkEditModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fa-solid fa-pen" style={{ marginRight: '0.5rem' }}></i>Edit Assignments — {checkedRows.length} user{checkedRows.length !== 1 ? 's' : ''}</h3>
              <button onClick={() => setBulkEditModalOpen(false)}>
                <i className="fa-solid fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleBulkEdit}>
              <div className="modal-body">
                <p style={{ color: '#6B7280', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                  Leave any field blank to keep its current value unchanged.
                </p>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="bulk_start">Start Date</label>
                    <input
                      type="date"
                      id="bulk_start"
                      value={bulkEditStart}
                      onChange={(e) => setBulkEditStart(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="bulk_end">End Date</label>
                    <input
                      type="date"
                      id="bulk_end"
                      value={bulkEditEnd}
                      onChange={(e) => setBulkEditEnd(e.target.value)}
                      min={bulkEditStart || undefined}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="bulk_status">Status</label>
                  <select
                    id="bulk_status"
                    value={bulkEditStatus}
                    onChange={(e) => setBulkEditStatus(e.target.value)}
                  >
                    <option value="">-- Keep current --</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setBulkEditModalOpen(false)}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export default AssignModules
