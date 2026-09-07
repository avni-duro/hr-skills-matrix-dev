import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { cachedFetch, cacheDelete, TTL } from '../utils/cacheDB'
import { useNotification } from '../contexts/NotificationContext'
import './Modules.css'

function Modules() {
  const mountedRef = useRef(true)
  const { showNotification } = useNotification()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [addModuleModalOpen, setAddModuleModalOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editingModuleId, setEditingModuleId] = useState(null)
  const [uploadVideoModalOpen, setUploadVideoModalOpen] = useState(false)
  const [selectedModule, setSelectedModule] = useState(null)
  const [categoryFilter, setCategoryFilter] = useState('All Categories')
  const [modules, setModules] = useState([])
  const [categories, setCategories] = useState([])
  const [departments, setDepartments] = useState([])
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingVideos, setLoadingVideos] = useState(false)
  const [error, setError] = useState(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category_id: '',
    thumbnail_url: '',
    is_locked: false,
    requires_approval: false,
    access_type: 'open',
    department_ids: []
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [departmentSearch, setDepartmentSearch] = useState('')

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const breadcrumbItems = [
    { label: 'Home', link: true },
    { label: 'Modules', link: false }
  ]

  const CATEGORIES_CACHE_KEY = 'categories_modules_v1'

  // Fetch modules and categories from Supabase
  useEffect(() => {
    mountedRef.current = true
    
    const fetchData = async () => {
      await Promise.all([fetchCategories(), fetchDepartments(), fetchModules()])
    }
    
    fetchData()
    
    return () => {
      mountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchCategories = async () => {
    try {
      const { data } = await cachedFetch(CATEGORIES_CACHE_KEY, async () => {
        const { data, error } = await supabase
          .from('categories')
          .select('*')
          .order('name', { ascending: true })
        if (error) throw error
        return data || []
      }, TTL.LONG)

      if (mountedRef.current) {
        setCategories(data)
      }
    } catch (error) {
      console.error('Error fetching categories:', error)
      // Don't set error state here, just log it
    }
  }

  const fetchDepartments = async () => {
    try {
      const { data } = await cachedFetch('departments', async () => {
        const { data, error } = await supabase
          .from('departments')
          .select('*')
          .order('department_name', { ascending: true })
        if (error) throw error
        return data || []
      }, TTL.LONG)

      if (mountedRef.current) {
        setDepartments(data)
      }
    } catch (error) {
      console.error('Error fetching departments:', error)
    }
  }

  const fetchModules = async () => {
    try {
      if (mountedRef.current) {
        setLoading(true)
        setError(null)
      }
      
      const { data } = await cachedFetch('modules_full', async () => {
        const { data, error } = await supabase
          .from('modules')
          .select(`
            *,
            categories (
              id,
              name
            )
          `)
          .order('created_at', { ascending: false })
        if (error) throw error
        return data || []
      }, TTL.MEDIUM)

      if (mountedRef.current) {
        setModules(data)
      }
    } catch (error) {
      console.error('Error fetching modules:', error)
      if (mountedRef.current) {
        setError(error.message || 'Failed to fetch modules. Please check your connection.')
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }

  const handleRefresh = async () => {
    await cacheDelete(CATEGORIES_CACHE_KEY)
    await Promise.all([fetchCategories(), fetchModules()])
  }

  const getCategoryName = (categoryId) => {
    if (!categoryId) return 'N/A'
    const category = categories.find(cat => cat.id === categoryId)
    return category ? category.name : 'N/A'
  }

  const handleAddModule = async () => {
    try {
      // Validate required fields
      if (!formData.title.trim()) {
        showNotification('Please enter a module title', 'warning')
        return
      }

      // Validate department access for department type
      if (formData.access_type === 'department' && formData.department_ids.length === 0) {
        showNotification('Please select at least one department for department-based access', 'warning')
        return
      }

      setError(null)

      if (editMode) {
        // Update existing module
        const { error: moduleError } = await supabase
          .from('modules')
          .update({
            title: formData.title,
            description: formData.description || null,
            category_id: formData.category_id || null,
            thumbnail_url: formData.thumbnail_url || null,
            is_locked: formData.is_locked,
            requires_approval: formData.requires_approval,
            access_type: formData.access_type
          })
          .eq('id', editingModuleId)

        if (moduleError) throw moduleError

        // Delete old department access
        await supabase
          .from('module_department_access')
          .delete()
          .eq('module_id', editingModuleId)

        // Insert new department access if needed
        if (formData.access_type === 'department' && formData.department_ids.length > 0) {
          const departmentAccessRecords = formData.department_ids.map(deptId => ({
            module_id: editingModuleId,
            department_id: deptId
          }))

          const { error: deptAccessError } = await supabase
            .from('module_department_access')
            .insert(departmentAccessRecords)

          if (deptAccessError) throw deptAccessError
        }

        showNotification('Module updated successfully!', 'success')
      } else {
        // Insert new module
        const { data: moduleData, error: moduleError } = await supabase
          .from('modules')
          .insert([{
            title: formData.title,
            description: formData.description || null,
            category_id: formData.category_id || null,
            thumbnail_url: formData.thumbnail_url || null,
            is_locked: formData.is_locked,
            requires_approval: formData.requires_approval,
            access_type: formData.access_type
          }])
          .select()
          .single()

        if (moduleError) throw moduleError

        // Insert department access if access_type is 'department'
        if (formData.access_type === 'department' && formData.department_ids.length > 0) {
          const departmentAccessRecords = formData.department_ids.map(deptId => ({
            module_id: moduleData.id,
            department_id: deptId
          }))

          const { error: deptAccessError } = await supabase
            .from('module_department_access')
            .insert(departmentAccessRecords)

          if (deptAccessError) throw deptAccessError
        }

        showNotification('Module added successfully!', 'success')
      }

      // Close modal and refresh list
      setAddModuleModalOpen(false)
      setEditMode(false)
      setEditingModuleId(null)
      setDepartmentSearch('')
      setFormData({
        title: '',
        description: '',
        category_id: '',
        thumbnail_url: '',
        is_locked: false,
        requires_approval: false,
        access_type: 'open',
        department_ids: []
      })
      await fetchModules()
    } catch (error) {
      console.error('Error saving module:', error)
      setError(error.message || 'Failed to save module. Please try again.')
      showNotification('Failed to save module: ' + (error.message || 'Unknown error'), 'error')
    }
  }

  const handleEditModule = async (module, e) => {
    e.stopPropagation()
    
    try {
      // Fetch department access for this module
      const { data: deptAccess, error: deptError } = await supabase
        .from('module_department_access')
        .select('department_id')
        .eq('module_id', module.id)

      if (deptError) throw deptError

      // Set form data with module details
      setFormData({
        title: module.title,
        description: module.description || '',
        category_id: module.category_id || '',
        thumbnail_url: module.thumbnail_url || '',
        is_locked: module.is_locked || false,
        requires_approval: module.requires_approval || false,
        access_type: module.access_type || 'open',
        department_ids: deptAccess ? deptAccess.map(d => d.department_id) : []
      })
      
      setEditMode(true)
      setEditingModuleId(module.id)
      setAddModuleModalOpen(true)
    } catch (error) {
      console.error('Error loading module for edit:', error)
      showNotification('Failed to load module details: ' + (error.message || 'Unknown error'), 'error')
    }
  }

  const handleDeleteModule = async (moduleId, e) => {
    e.stopPropagation()
    
    if (!confirm('Are you sure you want to delete this module?')) {
      return
    }

    try {
      const { error } = await supabase
        .from('modules')
        .delete()
        .eq('id', moduleId)

      if (error) throw error

      await fetchModules()
      showNotification('Module deleted successfully!', 'success')
    } catch (error) {
      console.error('Error deleting module:', error)
      showNotification('Failed to delete module: ' + (error.message || 'Unknown error'), 'error')
    }
  }

  const fetchVideosForModule = async (moduleId) => {
    try {
      setLoadingVideos(true)
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .eq('module_id', moduleId)
        .order('created_at', { ascending: false })

      if (error) throw error

      setVideos(data || [])
    } catch (error) {
      console.error('Error fetching videos:', error)
      setVideos([])
    } finally {
      setLoadingVideos(false)
    }
  }

  const openDrawer = (module) => {
    setSelectedModule(module)
    setDrawerOpen(true)
    fetchVideosForModule(module.id)
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setSelectedModule(null)
    setVideos([])
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  // Filter modules based on search and category
  const filteredModules = modules.filter(module => {
    const matchesSearch = module.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (module.description && module.description.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesCategory = categoryFilter === 'All Categories' || module.category_id === categoryFilter
    return matchesSearch && matchesCategory
  })

  const formatVideoDate = (dateString) => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const formatDuration = (seconds) => {
    if (!seconds) return 'N/A'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <>
        <main className="modules-main">
          <section className="modules-header">
            <div>
              <h2>Training Modules</h2>
              <p>Manage, create, and organize all learning modules.</p>
            </div>
            <div className="action-buttons">
              <button className="btn btn-secondary" onClick={handleRefresh}>
                <i className="fa-solid fa-arrows-rotate"></i>Refresh
              </button>
              <button className="btn btn-primary" onClick={() => setAddModuleModalOpen(true)}>
                <i className="fa-solid fa-plus"></i>Add Module
              </button>
            </div>
          </section>

          {/* Error Display */}
          {error && (
            <div className="error-message" style={{
              backgroundColor: '#FEE2E2',
              border: '1px solid #EF4444',
              color: '#991B1B',
              padding: '12px 16px',
              borderRadius: '8px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <i className="fa-solid fa-circle-exclamation"></i>
              <span>{error}</span>
            </div>
          )}

          <section className="modules-table-container">
            <div className="table-filters">
              <div className="search-wrapper">
                <i className="fa-solid fa-magnifying-glass"></i>
                <input 
                  type="text" 
                  placeholder="Search modules..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="filter-select-wrapper">
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                  <option value="All Categories">All Categories</option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
                <i className="fa-solid fa-chevron-down"></i>
              </div>
            </div>

            {loading ? (
              <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                padding: '60px 20px',
                color: '#6B7280'
              }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '8px', fontSize: '20px' }}></i>
                Loading modules...
              </div>
            ) : filteredModules.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '60px 20px',
                color: '#6B7280'
              }}>
                <i className="fa-solid fa-folder-open" style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}></i>
                <p style={{ fontSize: '18px', fontWeight: '500', marginBottom: '8px' }}>No modules found</p>
                <p style={{ fontSize: '14px' }}>
                  {modules.length === 0 
                    ? 'Get started by adding your first module.' 
                    : 'Try adjusting your search or filter criteria.'}
                </p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="modules-table">
                  <thead>
                    <tr>
                      <th>Module Title</th>
                      <th>Description</th>
                      <th>Category</th>
                      <th>Created At</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredModules.map(module => (
                      <tr key={module.id} className="module-row" onClick={() => openDrawer(module)}>
                        <td className="font-medium">{module.title}</td>
                        <td>{module.description ? (module.description.length > 50 ? module.description.substring(0, 50) + '...' : module.description) : 'N/A'}</td>
                        <td>{module.categories?.name || getCategoryName(module.category_id)}</td>
                        <td>{formatDate(module.created_at)}</td>
                        <td className="text-right">
                          <button className="action-btn edit-btn" onClick={(e) => handleEditModule(module, e)} title="Edit Module">
                            <i className="fa-solid fa-pencil"></i>
                          </button>
                          <button className="action-btn delete-btn" onClick={(e) => handleDeleteModule(module.id, e)} title="Delete Module">
                            <i className="fa-solid fa-trash"></i>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="table-pagination">
              <span className="pagination-info">
                Showing <span className="font-semibold">1</span> to <span className="font-semibold">{filteredModules.length}</span> of <span className="font-semibold">{modules.length}</span> Entries
              </span>
              <div className="pagination-buttons">
                <button className="pagination-btn">Previous</button>
                <button className="pagination-btn">Next</button>
              </div>
            </div>
          </section>
        </main>

      {/* Videos Drawer */}
      <div className={`drawer-overlay ${drawerOpen ? 'active' : ''}`} onClick={closeDrawer}></div>
      <aside className={`videos-drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="drawer-content">
          <header className="drawer-header">
            <div>
              <h3>{selectedModule?.title || 'Module Videos'}</h3>
              <p>{videos.length} {videos.length === 1 ? 'Video' : 'Videos'}</p>
            </div>
            <button className="close-drawer-btn" onClick={closeDrawer}>
              <i className="fa-solid fa-xmark"></i>
            </button>
          </header>
          <div className="drawer-body">
            {loadingVideos ? (
              <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                padding: '40px 20px',
                color: '#6B7280'
              }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '8px', fontSize: '18px' }}></i>
                Loading videos...
              </div>
            ) : videos.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '40px 20px',
                color: '#6B7280'
              }}>
                <i className="fa-solid fa-video" style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.5 }}></i>
                <p style={{ fontSize: '16px', fontWeight: '500', marginBottom: '8px' }}>No videos found</p>
                <p style={{ fontSize: '14px' }}>
                  No videos have been added to this module yet.
                </p>
              </div>
            ) : (
              <ul className="videos-list">
                {videos.map(video => (
                  <li key={video.id} className="video-item">
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="video-title">{video.title || 'Untitled Video'}</p>
                        <p className="video-meta">
                          {video.duration ? `Duration: ${formatDuration(video.duration)}` : 'Duration: N/A'} | 
                          Uploaded: {formatVideoDate(video.created_at)}
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                        <span className={`status-badge ${video.status ? video.status.toLowerCase() : 'draft'}`}>
                          {video.status || 'Draft'}
                        </span>
                        <button className="icon-btn" title="Edit Video">
                          <i className="fa-solid fa-pencil"></i>
                        </button>
                        <button className="icon-btn delete" title="Delete Video">
                          <i className="fa-solid fa-trash"></i>
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>

      {/* Add/Edit Module Modal */}
      {addModuleModalOpen && (
        <div className="modal-backdrop" onClick={() => {
          setAddModuleModalOpen(false)
          setEditMode(false)
          setEditingModuleId(null)
          setDepartmentSearch('')
        }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editMode ? 'Edit Module' : 'Add New Module'}</h3>
              <button onClick={() => {
                setAddModuleModalOpen(false)
                setEditMode(false)
                setEditingModuleId(null)
                setDepartmentSearch('')
              }}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="module-title">Module Title <span style={{ color: '#EF4444' }}>*</span></label>
                <input 
                  type="text" 
                  id="module-title" 
                  placeholder="e.g., Introduction to Sales" 
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="module-description">Description</label>
                <textarea 
                  id="module-description" 
                  rows="3" 
                  placeholder="A brief summary of the module's content..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                ></textarea>
              </div>
              <div className="form-group">
                <label htmlFor="module-category">Category</label>
                <select 
                  id="module-category"
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                >
                  <option value="">-- Select Category (Optional) --</option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
                <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
                  Select the category this module belongs to
                </p>
              </div>
              <div className="form-group">
                <label htmlFor="module-thumbnail">Thumbnail URL</label>
                <input 
                  type="text" 
                  id="module-thumbnail" 
                  placeholder="https://example.com/image.jpg (optional)"
                  value={formData.thumbnail_url}
                  onChange={(e) => setFormData({ ...formData, thumbnail_url: e.target.value })}
                />
                <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
                  Enter the URL of the thumbnail image
                </p>
              </div>

              {/* Access Control Section */}
              <div className="access-control-section">
                <div className="form-group">
                  <label htmlFor="access-type" style={{ 
                    textTransform: 'uppercase', 
                    fontSize: '11px', 
                    fontWeight: '600',
                    color: '#6B7280',
                    letterSpacing: '0.5px',
                    marginBottom: '8px'
                  }}>Access Type</label>
                  <select 
                    id="access-type"
                    value={formData.access_type}
                    onChange={(e) => setFormData({ ...formData, access_type: e.target.value, department_ids: [] })}
                    style={{ width: '100%' }}
                  >
                    <option value="open">Open - All users can access</option>
                    <option value="department">Department - Specific departments only</option>
                    <option value="restricted">Restricted - Request required</option>
                  </select>
                  <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '6px', lineHeight: '1.4' }}>
                    {formData.access_type === 'open' && 'Module is accessible to all users'}
                    {formData.access_type === 'department' && 'Only users from selected departments can access'}
                    {formData.access_type === 'restricted' && 'Users must request access to view this module'}
                  </p>
                </div>

                {formData.access_type === 'department' && (
                  <div className="form-group">
                    <label style={{ 
                      textTransform: 'uppercase', 
                      fontSize: '11px', 
                      fontWeight: '600',
                      color: '#6B7280',
                      letterSpacing: '0.5px',
                      marginBottom: '8px',
                      display: 'block'
                    }}>Select Departments</label>
                    
                    {/* Department Search */}
                    <div style={{ 
                      position: 'relative', 
                      marginBottom: '8px' 
                    }}>
                      <i className="fa-solid fa-magnifying-glass" style={{
                        position: 'absolute',
                        left: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#9CA3AF',
                        fontSize: '13px',
                        pointerEvents: 'none'
                      }}></i>
                      <input
                        type="text"
                        placeholder="Search departments..."
                        value={departmentSearch}
                        onChange={(e) => setDepartmentSearch(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px 8px 36px',
                          fontSize: '13px',
                          border: '1px solid #E5E7EB',
                          borderRadius: '6px',
                          outline: 'none',
                          transition: 'border-color 0.2s'
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#4F46E5'}
                        onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
                      />
                    </div>

                    <div className="department-checkboxes">
                      {departments
                        .filter(dept => 
                          dept.department_name.toLowerCase().includes(departmentSearch.toLowerCase())
                        )
                        .map(dept => (
                        <div key={dept.id} className="department-checkbox-item">
                          <label>
                            <input 
                              type="checkbox"
                              checked={formData.department_ids.includes(dept.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormData({ 
                                    ...formData, 
                                    department_ids: [...formData.department_ids, dept.id] 
                                  })
                                } else {
                                  setFormData({ 
                                    ...formData, 
                                    department_ids: formData.department_ids.filter(id => id !== dept.id) 
                                  })
                                }
                              }}
                            />
                            <span>{dept.department_name}</span>
                          </label>
                        </div>
                      ))}
                      {departments.filter(dept => 
                        dept.department_name.toLowerCase().includes(departmentSearch.toLowerCase())
                      ).length === 0 && (
                        <div style={{
                          padding: '20px',
                          textAlign: 'center',
                          color: '#9CA3AF',
                          fontSize: '13px'
                        }}>
                          <i className="fa-solid fa-search" style={{ 
                            fontSize: '24px', 
                            marginBottom: '8px',
                            display: 'block',
                            opacity: 0.5
                          }}></i>
                          No departments found
                        </div>
                      )}
                    </div>
                    <p style={{ 
                      fontSize: '13px', 
                      color: formData.department_ids.length > 0 ? '#059669' : '#6B7280',
                      fontWeight: formData.department_ids.length > 0 ? '600' : '400',
                      marginTop: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      {formData.department_ids.length > 0 && (
                        <i className="fa-solid fa-check-circle" style={{ fontSize: '14px' }}></i>
                      )}
                      {formData.department_ids.length} department(s) selected
                    </p>
                  </div>
                )}

                <div className="access-options">
                  <div className="access-option-item">
                    <div className="option-header">
                      <label className="checkbox-label">
                        <input 
                          type="checkbox"
                          checked={formData.is_locked}
                          onChange={(e) => setFormData({ ...formData, is_locked: e.target.checked })}
                        />
                        <span className="option-icon">
                          <i className="fa-solid fa-lock"></i>
                        </span>
                        <span className="option-title">Lock This Module</span>
                      </label>
                    </div>
                    <p className="option-description">
                      When locked, access control rules will be enforced
                    </p>
                  </div>

                  <div className="access-option-item">
                    <div className="option-header">
                      <label className="checkbox-label">
                        <input 
                          type="checkbox"
                          checked={formData.requires_approval}
                          onChange={(e) => setFormData({ ...formData, requires_approval: e.target.checked })}
                        />
                        <span className="option-icon">
                          <i className="fa-solid fa-user-check"></i>
                        </span>
                        <span className="option-title">Require Approval for Access</span>
                      </label>
                    </div>
                    <p className="option-description">
                      Users must request and receive admin approval to access this module
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => {
                setAddModuleModalOpen(false)
                setEditMode(false)
                setEditingModuleId(null)
                setDepartmentSearch('')
                setFormData({
                  title: '',
                  description: '',
                  category_id: '',
                  thumbnail_url: '',
                  is_locked: false,
                  requires_approval: false,
                  access_type: 'open',
                  department_ids: []
                })
              }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddModule}>
                {editMode ? 'Update Module' : 'Save Module'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Video Modal */}
      {uploadVideoModalOpen && (
        <div className="modal-backdrop" onClick={() => setUploadVideoModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Upload Video to Bunny CDN</h3>
              <button onClick={() => setUploadVideoModalOpen(false)}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="upload-module-select">Select Module</label>
                <select id="upload-module-select">
                  <option value="">-- Select a Module --</option>
                  {modules.map(module => (
                    <option key={module.id} value={module.id}>{module.title}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="video-title">Video Title</label>
                <input type="text" id="video-title" placeholder="e.g., Introduction to Sales" />
              </div>
              <div className="form-group">
                <label>Video File</label>
                <div className="file-upload">
                  <i className="fa-solid fa-video"></i>
                  <div>
                    <label htmlFor="video-file-upload" className="upload-label">
                      <span>Upload a video</span>
                      <input id="video-file-upload" type="file" accept="video/*" className="hidden-input" />
                    </label>
                    <span className="upload-text">or drag and drop</span>
                  </div>
                  <p className="upload-hint">MP4, MOV, AVI up to 500MB</p>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setUploadVideoModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary">Upload Video</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Modules
