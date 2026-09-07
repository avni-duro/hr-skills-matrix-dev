import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { cachedFetch, cacheDelete, TTL } from '../utils/cacheDB'
import { useNotification } from '../contexts/NotificationContext'
import './CategoryAccess.css'

function CategoryAccess() {
  const mountedRef = useRef(true)
  const [loading, setLoading] = useState(true)
  const { showNotification } = useNotification()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [categories, setCategories] = useState([])
  const [departments, setDepartments] = useState([])
  const [assignments, setAssignments] = useState([])

  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [selectedDepartments, setSelectedDepartments] = useState([])
  const [selectedCategories, setSelectedCategories] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [editingDeptId, setEditingDeptId] = useState(null)

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

      const [categoriesResult, departmentsResult] = await Promise.all([
        cachedFetch('categories_ca', async () => {
          const { data, error } = await supabase
            .from('categories')
            .select('id, name')
            .order('name', { ascending: true })
          if (error) throw error
          return data || []
        }, TTL.LONG),
        cachedFetch('departments_ca', async () => {
          const { data, error } = await supabase
            .from('departments')
            .select('id, department_name')
            .order('department_name', { ascending: true })
          if (error) throw error
          return data || []
        }, TTL.LONG),
      ])

      if (!mountedRef.current) return

      const cats = categoriesResult?.data || categoriesResult || []
      setCategories(Array.isArray(cats) ? cats : [])
      const depts = departmentsResult?.data || departmentsResult || []
      setDepartments(Array.isArray(depts) ? depts : [])

      await fetchAssignments()
    } catch (err) {
      console.error('[CategoryAccess] Error fetching data:', err)
      if (mountedRef.current) setError(err.message)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  const fetchAssignments = async () => {
    try {
      const data = await fetchAllRows('category_department_access', '*', 'created_at')
      if (mountedRef.current) setAssignments(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('[CategoryAccess] Error fetching assignments:', err)
    }
  }

  // Group assignments by department
  const groupedByDept = useMemo(() => {
    const deptMap = new Map(departments.map(d => [d.id, d]))
    const catMap = new Map(categories.map(c => [c.id, c]))
    const grouped = {}

    assignments.forEach(a => {
      const dId = a.department_id
      if (!grouped[dId]) {
        const dept = deptMap.get(dId)
        grouped[dId] = {
          department_id: dId,
          department_name: dept?.department_name || 'Unknown Department',
          categories: [],
          assignmentIds: [],
        }
      }
      const cat = catMap.get(a.category_id)
      grouped[dId].categories.push({
        id: a.id,
        category_id: a.category_id,
        category_name: cat?.name || 'Unknown Category',
        created_at: a.created_at,
      })
      grouped[dId].assignmentIds.push(a.id)
    })

    return Object.values(grouped).sort((a, b) => a.department_name.localeCompare(b.department_name))
  }, [assignments, departments, categories])

  // Filter
  const filteredGroups = useMemo(() => {
    if (!searchTerm.trim()) return groupedByDept
    const q = searchTerm.toLowerCase()
    return groupedByDept.filter(g =>
      g.department_name.toLowerCase().includes(q) ||
      g.categories.some(c => c.category_name.toLowerCase().includes(q))
    )
  }, [groupedByDept, searchTerm])

  // Departments that don't have any assignments yet (for the modal dropdown)
  const availableDepartments = useMemo(() => {
    const assignedDeptIds = new Set(assignments.map(a => a.department_id))
    if (editingDeptId) {
      // When editing, include the currently-editing department
      return departments.filter(d => !assignedDeptIds.has(d.id) || d.id === editingDeptId)
    }
    return departments.filter(d => !assignedDeptIds.has(d.id))
  }, [departments, assignments, editingDeptId])

  const openAssignModal = (deptGroup = null) => {
    if (deptGroup) {
      // Edit mode — single dept locked
      setEditingDeptId(deptGroup.department_id)
      setSelectedDepartments([deptGroup.department_id])
      setSelectedCategories(deptGroup.categories.map(c => c.category_id))
    } else {
      // New mode — multi-select
      setEditingDeptId(null)
      setSelectedDepartments([])
      setSelectedCategories([])
    }
    setAssignModalOpen(true)
  }

  const handleDeptToggle = (deptId) => {
    setSelectedDepartments(prev =>
      prev.includes(deptId) ? prev.filter(id => id !== deptId) : [...prev, deptId]
    )
  }

  const handleSelectAllDepts = () => {
    if (selectedDepartments.length === availableDepartments.length) {
      setSelectedDepartments([])
    } else {
      setSelectedDepartments(availableDepartments.map(d => d.id))
    }
  }

  const handleCategoryToggle = (categoryId) => {
    setSelectedCategories(prev =>
      prev.includes(categoryId) ? prev.filter(id => id !== categoryId) : [...prev, categoryId]
    )
  }

  const handleSelectAllCategories = () => {
    if (selectedCategories.length === categories.length) {
      setSelectedCategories([])
    } else {
      setSelectedCategories(categories.map(c => c.id))
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()

    if (selectedDepartments.length === 0) {
      showNotification('Please select at least one department', 'warning')
      return
    }
    if (selectedCategories.length === 0) {
      showNotification('Please select at least one category', 'warning')
      return
    }

    try {
      setSaving(true)

      if (editingDeptId) {
        // Edit mode — delete old assignments then re-insert for that dept
        const { error: delError } = await supabase
          .from('category_department_access')
          .delete()
          .eq('department_id', editingDeptId)
        if (delError) throw delError

        const rows = selectedCategories.map(catId => ({
          department_id: editingDeptId,
          category_id: catId,
        }))
        const { error: insError } = await supabase
          .from('category_department_access')
          .insert(rows)
        if (insError) throw insError
      } else {
        // New mode — insert for every selected department
        for (const deptId of selectedDepartments) {
          const rows = selectedCategories.map(catId => ({
            department_id: deptId,
            category_id: catId,
          }))
          const { error: insError } = await supabase
            .from('category_department_access')
            .insert(rows)
          if (insError) throw insError
        }
      }

      showNotification(editingDeptId ? 'Category access updated!' : 'Categories assigned successfully!', 'success')
      setAssignModalOpen(false)
      setEditingDeptId(null)
      setSelectedDepartments([])
      setSelectedCategories([])
      await cacheDelete('category_dept_access')
      await fetchAssignments()
    } catch (err) {
      console.error('[CategoryAccess] Save error:', err)
      showNotification('Error: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteDeptAccess = async (deptId) => {
    if (!confirm('Remove ALL category access for this department?')) return
    try {
      setSaving(true)
      const { error } = await supabase
        .from('category_department_access')
        .delete()
        .eq('department_id', deptId)
      if (error) throw error
      showNotification('Category access removed!', 'success')
      await cacheDelete('category_dept_access')
      await fetchAssignments()
    } catch (err) {
      console.error('[CategoryAccess] Delete error:', err)
      showNotification('Error: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSingle = async (assignmentId) => {
    if (!confirm('Remove this category assignment?')) return
    try {
      setSaving(true)
      const { error } = await supabase
        .from('category_department_access')
        .delete()
        .eq('id', assignmentId)
      if (error) throw error
      await fetchAssignments()
    } catch (err) {
      console.error('[CategoryAccess] Delete error:', err)
      showNotification('Error: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  if (loading && assignments.length === 0) {
    return (
      <main className="ca-main">
        <div className="ca-loading">
          <i className="fa-solid fa-spinner fa-spin"></i>
          <span>Loading...</span>
        </div>
      </main>
    )
  }

  return (
    <>
      <main className="ca-main">
        {/* Header */}
        <section className="ca-header">
          <div>
            <h2>Category Access</h2>
            <p>Assign categories to departments so users see content relevant to their department</p>
          </div>
          <div className="ca-actions">
            <button className="btn btn-secondary" onClick={fetchAllData} disabled={loading}>
              <i className={`fa-solid fa-refresh ${loading ? 'fa-spin' : ''}`}></i> Refresh
            </button>
            <button className="btn btn-primary" onClick={() => openAssignModal()}>
              <i className="fa-solid fa-plus"></i> Assign Categories
            </button>
          </div>
        </section>

        {error && (
          <div className="ca-error">
            <i className="fa-solid fa-circle-exclamation"></i>
            <span>{error}</span>
          </div>
        )}

        {/* KPI Cards */}
        <div className="ca-kpi-row">
          <div className="ca-kpi-card">
            <div className="ca-kpi-icon" style={{ background: '#EFF6FF', color: '#3B82F6' }}>
              <i className="fa-solid fa-building"></i>
            </div>
            <div>
              <p className="ca-kpi-label">Total Departments</p>
              <h3 className="ca-kpi-value">{departments.length}</h3>
            </div>
          </div>
          <div className="ca-kpi-card">
            <div className="ca-kpi-icon" style={{ background: '#F0FDF4', color: '#22C55E' }}>
              <i className="fa-solid fa-layer-group"></i>
            </div>
            <div>
              <p className="ca-kpi-label">Total Categories</p>
              <h3 className="ca-kpi-value">{categories.length}</h3>
            </div>
          </div>
          <div className="ca-kpi-card">
            <div className="ca-kpi-icon" style={{ background: '#FAF5FF', color: '#8B5CF6' }}>
              <i className="fa-solid fa-link"></i>
            </div>
            <div>
              <p className="ca-kpi-label">Assignments</p>
              <h3 className="ca-kpi-value">{assignments.length}</h3>
            </div>
          </div>
          <div className="ca-kpi-card">
            <div className="ca-kpi-icon" style={{ background: '#FFF7ED', color: '#F59E0B' }}>
              <i className="fa-solid fa-check-double"></i>
            </div>
            <div>
              <p className="ca-kpi-label">Departments Assigned</p>
              <h3 className="ca-kpi-value">{groupedByDept.length}</h3>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="ca-filters">
          <div className="ca-search-wrapper">
            <i className="fa-solid fa-search"></i>
            <input
              type="text"
              placeholder="Search by department or category..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="ca-table-card">
          <div className="ca-table-header">
            <h3>Department → Category Assignments</h3>
            <span className="ca-count-badge">{filteredGroups.length} department{filteredGroups.length !== 1 ? 's' : ''}</span>
          </div>

          {filteredGroups.length === 0 ? (
            <div className="ca-empty">
              <i className="fa-solid fa-layer-group"></i>
              <p>No category assignments found</p>
              <button className="btn btn-primary" onClick={() => openAssignModal()}>
                <i className="fa-solid fa-plus"></i> Create First Assignment
              </button>
            </div>
          ) : (
            <div className="ca-table-scroll">
              <table className="ca-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Department</th>
                    <th>Categories</th>
                    <th>Count</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGroups.map((group, idx) => (
                    <tr key={group.department_id} className="ca-table-row">
                      <td style={{ color: '#94A3B8' }}>{idx + 1}</td>
                      <td>
                        <span className="ca-dept-name">{group.department_name}</span>
                      </td>
                      <td>
                        <div className="ca-cat-tags">
                          {group.categories.slice(0, 5).map(c => (
                            <span key={c.category_id} className="ca-cat-tag">{c.category_name}</span>
                          ))}
                          {group.categories.length > 5 && (
                            <span className="ca-cat-tag ca-cat-more">+{group.categories.length - 5} more</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="ca-count-pill">{group.categories.length}</span>
                      </td>
                      <td>
                        <div className="ca-row-actions">
                          <button className="btn-icon btn-view" onClick={() => openAssignModal(group)} title="Edit">
                            <i className="fa-solid fa-pen-to-square"></i>
                          </button>
                          <button className="btn-icon btn-delete" onClick={() => handleDeleteDeptAccess(group.department_id)} title="Delete all">
                            <i className="fa-solid fa-trash"></i>
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
      </main>

      {/* Assign / Edit Modal */}
      {assignModalOpen && (
        <div className="ca-modal-backdrop" onClick={() => { setAssignModalOpen(false); setEditingDeptId(null) }}>
          <div className="ca-modal" onClick={e => e.stopPropagation()}>
            <div className="ca-modal-header">
              <h3>{editingDeptId ? 'Edit Category Access' : 'Assign Categories to Department'}</h3>
              <button onClick={() => { setAssignModalOpen(false); setEditingDeptId(null) }}>
                <i className="fa-solid fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleSave}>
              <div className="ca-modal-body">
                {/* Department Selection */}
                <div className="ca-form-group">
                  <label>
                    {editingDeptId ? 'Department' : 'Select Departments *'}
                    {!editingDeptId && (
                      <button type="button" className="ca-select-all-btn" onClick={handleSelectAllDepts}>
                        {selectedDepartments.length === availableDepartments.length ? 'Deselect All' : 'Select All'}
                      </button>
                    )}
                  </label>
                  <div className="ca-cat-list">
                    {editingDeptId ? (
                      <label className="ca-cat-checkbox">
                        <input type="checkbox" checked readOnly disabled />
                        <span className="ca-cat-checkbox-label">
                          {departments.find(d => d.id === editingDeptId)?.department_name}
                        </span>
                      </label>
                    ) : availableDepartments.length === 0 ? (
                      <p style={{ color: '#F59E0B', fontSize: '0.875rem', padding: '0.5rem' }}>
                        All departments already have assignments. Edit existing ones instead.
                      </p>
                    ) : (
                      availableDepartments.map(d => (
                        <label key={d.id} className="ca-cat-checkbox">
                          <input
                            type="checkbox"
                            checked={selectedDepartments.includes(d.id)}
                            onChange={() => handleDeptToggle(d.id)}
                          />
                          <span className="ca-cat-checkbox-label">{d.department_name}</span>
                        </label>
                      ))
                    )}
                  </div>
                  {!editingDeptId && selectedDepartments.length > 0 && (
                    <small style={{ color: '#4F46E5', marginTop: '0.5rem', display: 'block' }}>
                      {selectedDepartments.length} department{selectedDepartments.length !== 1 ? 's' : ''} selected
                    </small>
                  )}
                </div>

                {/* Categories Multi-select */}
                <div className="ca-form-group">
                  <label>
                    Select Categories *
                    <button type="button" className="ca-select-all-btn" onClick={handleSelectAllCategories}>
                      {selectedCategories.length === categories.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </label>
                  <div className="ca-cat-list">
                    {categories.length === 0 ? (
                      <p style={{ color: '#6B7280', fontSize: '0.875rem', padding: '0.5rem' }}>No categories available</p>
                    ) : (
                      categories.map(cat => (
                        <label key={cat.id} className="ca-cat-checkbox">
                          <input
                            type="checkbox"
                            checked={selectedCategories.includes(cat.id)}
                            onChange={() => handleCategoryToggle(cat.id)}
                          />
                          <span className="ca-cat-checkbox-label">{cat.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                  {selectedCategories.length > 0 && (
                    <small style={{ color: '#4F46E5', marginTop: '0.5rem', display: 'block' }}>
                      {selectedCategories.length} categor{selectedCategories.length !== 1 ? 'ies' : 'y'} selected
                    </small>
                  )}
                </div>
              </div>

              <div className="ca-modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setAssignModalOpen(false); setEditingDeptId(null) }} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving || selectedCategories.length === 0 || selectedDepartments.length === 0}>
                  {saving ? 'Saving...' : editingDeptId ? 'Update Access' : 'Assign Categories'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export default CategoryAccess
