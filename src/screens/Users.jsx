import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { cachedFetch, cacheDelete, TTL } from '../utils/cacheDB'
import { useNotification } from '../contexts/NotificationContext'
import * as XLSX from 'xlsx'
import './Users.css'

function Users() {
  const { showNotification } = useNotification()
  const mountedRef = useRef(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [addUserModalOpen, setAddUserModalOpen] = useState(false)
  const [editUserModalOpen, setEditUserModalOpen] = useState(false)
  const [editingUserId, setEditingUserId] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [roleFilter, setRoleFilter] = useState('All Roles')
  const [departmentFilter, setDepartmentFilter] = useState('All Departments')
  const [searchQuery, setSearchQuery] = useState('')
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [regions, setRegions] = useState([])
  const [branches, setBranches] = useState([])
  const [subBranches, setSubBranches] = useState([])
  const [departments, setDepartments] = useState([])
  const [subDepartments, setSubDepartments] = useState([])
  const [grades, setGrades] = useState([])
  const [designations, setDesignations] = useState([])
  const [updatePassword, setUpdatePassword] = useState(false)
  const [bulkUploadModalOpen, setBulkUploadModalOpen] = useState(false)
  const [uploadedFile, setUploadedFile] = useState(null)
  const [bulkUploadResults, setBulkUploadResults] = useState(null)
  const [exportingUsers, setExportingUsers] = useState(false)
  const [managerSearchQuery, setManagerSearchQuery] = useState('')
  const [managerDropdownOpen, setManagerDropdownOpen] = useState(false)
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    role: 'user',
    employee_id: '',
    reporting_manager: '',
    password: '',
    date_of_birth: '',
    date_of_joining: '',
    leaving_date: '',
    status: 'active',
    region_id: '',
    branch_id: '',
    sub_branch_id: '',
    department_id: '',
    sub_department_id: '',
    grade_id: '',
    designation_id: ''
  })
  const [errorMessage, setErrorMessage] = useState('')

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const breadcrumbItems = [
    { label: 'Home', link: true },
    { label: 'User Management', link: false }
  ]

  const getInitials = (name) => {
    const names = name.split(' ')
    if (names.length >= 2) {
      return `${names[0][0]}${names[1][0]}`.toUpperCase()
    }
    return name[0].toUpperCase()
  }

  // Memoized filtered + sorted users — instant tab switching, no refetch
  const filteredUsers = useMemo(() => {
    return users
      .filter(user => {
        const roleValue = (user.role || '').toString().toLowerCase()
        const deptValue = (user.department || '').toString()
        const nameValue = (user.name || '').toString().toLowerCase()
        const emailValue = (user.email || '').toString().toLowerCase()
        const searchValue = searchQuery.toLowerCase()

        const matchesRole = roleFilter === 'All Roles' || roleValue === roleFilter.toLowerCase()
        const matchesDepartment = departmentFilter === 'All Departments' || deptValue === departmentFilter
        const matchesSearch = searchQuery === '' || nameValue.includes(searchValue) || emailValue.includes(searchValue)

        return matchesRole && matchesDepartment && matchesSearch
      })
      .sort((a, b) => {
        const nameA = (a.name || '').toString().toLowerCase()
        const nameB = (b.name || '').toString().toLowerCase()
        return nameA.localeCompare(nameB)
      })
  }, [users, roleFilter, departmentFilter, searchQuery])

  const reportingManagerOptions = useMemo(() => {
    const currentEmployeeId = (formData.employee_id || '').trim().toLowerCase()
    const query = managerSearchQuery.trim().toLowerCase()
    const uniqueMap = new Map()

    users.forEach((u) => {
      const employeeCode = (u.employeeId || '').toString().trim()
      if (!employeeCode) return
      if (employeeCode.toLowerCase() === currentEmployeeId) return
      if (!uniqueMap.has(employeeCode)) {
        uniqueMap.set(employeeCode, {
          employee_id: employeeCode,
          name: u.name || 'Unknown',
        })
      }
    })

    const allOptions = Array.from(uniqueMap.values())
      .sort((a, b) => a.name.localeCompare(b.name))

    if (!query) return allOptions

    return allOptions.filter((opt) => {
      const name = (opt.name || '').toLowerCase()
      const code = (opt.employee_id || '').toLowerCase()
      return name.includes(query) || code.includes(query)
    })
  }, [users, formData.employee_id, managerSearchQuery])

  const selectReportingManager = (manager) => {
    setFormData(prev => ({ ...prev, reporting_manager: manager.employee_id }))
    setManagerSearchQuery(`${manager.name} (${manager.employee_id})`)
    setManagerDropdownOpen(false)
  }

  // Fetch users and organizational data from Supabase
  useEffect(() => {
    mountedRef.current = true
    
    const fetchData = async () => {
      // Only fetch essential data first - users, designations, and departments
      // Other data can be loaded when needed (e.g., when opening add/edit modal)
      await Promise.all([
        fetchUsers(),
        fetchDesignations(),
        fetchDepartments()
      ])
    }
    
    fetchData()
    
    return () => {
      mountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchUsers = async (forceRefresh = false) => {
    try {
      // Only show loading spinner when there's no cached data yet
      if (users.length === 0 || forceRefresh) {
        setLoading(true)
      }

      const usersResult = await cachedFetch('users_screen_data', async () => {
        // Fetch users without joins for better performance (paginate to get all rows)
        const pageSize = 1000
        let page = 0
        let allRows = []
        let hasMore = true

        while (hasMore) {
          const from = page * pageSize
          const to = from + pageSize - 1

          const { data: pageRows, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false })
            .range(from, to)

          if (error) {
            throw error
          }

          allRows = allRows.concat(pageRows || [])
          hasMore = (pageRows || []).length === pageSize
          page += 1
        }

        const data = allRows
        
        // Get unique lookup IDs
        const designationIds = [...new Set(data?.map(u => u.designation_id).filter(Boolean))]
        const departmentIds = [...new Set(data?.map(u => u.department_id).filter(Boolean))]
        const branchIds = [...new Set(data?.map(u => u.branch_id).filter(Boolean))]
        const subBranchIds = [...new Set(data?.map(u => u.sub_branch_id).filter(Boolean))]
        const regionIds = [...new Set(data?.map(u => u.region_id).filter(Boolean))]
        const subDepartmentIds = [...new Set(data?.map(u => u.sub_department_id).filter(Boolean))]
        const gradeIds = [...new Set(data?.map(u => u.grade_id).filter(Boolean))]
        
        // Fetch lookups in parallel if there are any
        const [designationsData, departmentsData, branchesData, subBranchesData, regionsData, subDepartmentsData, gradesData] = await Promise.all([
          designationIds.length > 0 
            ? supabase.from('designations').select('id, designation_name').in('id', designationIds)
            : Promise.resolve({ data: [] }),
          departmentIds.length > 0
            ? supabase.from('departments').select('id, department_name').in('id', departmentIds)
            : Promise.resolve({ data: [] })
          ,
          branchIds.length > 0
            ? supabase.from('branches').select('id, branch_name').in('id', branchIds)
            : Promise.resolve({ data: [] })
          ,
          subBranchIds.length > 0
            ? supabase.from('sub_branches').select('id, sub_branch_name').in('id', subBranchIds)
            : Promise.resolve({ data: [] })
          ,
          regionIds.length > 0
            ? supabase.from('regions').select('id, region_name').in('id', regionIds)
            : Promise.resolve({ data: [] })
          ,
          subDepartmentIds.length > 0
            ? supabase.from('sub_departments').select('id, sub_department_name').in('id', subDepartmentIds)
            : Promise.resolve({ data: [] })
          ,
          gradeIds.length > 0
            ? supabase.from('grades').select('id, grade_name').in('id', gradeIds)
            : Promise.resolve({ data: [] })
        ])
        
        // Create lookup maps for faster access
        const designationMap = new Map(designationsData.data?.map(d => [d.id, d.designation_name]) || [])
        const departmentMap = new Map(departmentsData.data?.map(d => [d.id, d.department_name]) || [])
        const branchMap = new Map(branchesData.data?.map(b => [b.id, b.branch_name]) || [])
        const subBranchMap = new Map(subBranchesData.data?.map(sb => [sb.id, sb.sub_branch_name]) || [])
        const regionMap = new Map(regionsData.data?.map(r => [r.id, r.region_name]) || [])
        const subDepartmentMap = new Map(subDepartmentsData.data?.map(sd => [sd.id, sd.sub_department_name]) || [])
        const gradeMap = new Map(gradesData.data?.map(g => [g.id, g.grade_name]) || [])
        
        // Transform data to match component expectations while preserving all user data
        return data?.map(user => ({
          // Original user data (all columns from users table)
          ...user,
          // UI display fields
          id: user.id,
          name: user.full_name || 'N/A',
          email: user.email,
          phone: user.phone,
          designation: designationMap.get(user.designation_id) || 'N/A',
          department: departmentMap.get(user.department_id) || 'N/A',
          branch: branchMap.get(user.branch_id) || 'N/A',
          subBranch: subBranchMap.get(user.sub_branch_id) || 'N/A',
          region: regionMap.get(user.region_id) || 'N/A',
          subDepartment: subDepartmentMap.get(user.sub_department_id) || 'N/A',
          grade: gradeMap.get(user.grade_id) || 'N/A',
          role: user.role || 'user',
          status: String(user.status || '').trim().toLowerCase() === 'inactive' ? 'Inactive' : 'Active',
          employeeId: user.employee_id,
          progress: 0,
          createdAt: new Date(user.created_at).toISOString().split('T')[0]
        })) || []
      }, TTL.MEDIUM, forceRefresh)

      if (mountedRef.current) {
        const usersData = usersResult?.data || usersResult || []
        setUsers(Array.isArray(usersData) ? usersData : [])
        setErrorMessage('')
      }
    } catch (error) {
      if (mountedRef.current) {
        // Set user-friendly error message
        if (error.message?.includes('JWT')) {
          setErrorMessage('Authentication error. Please check your Supabase credentials.')
        } else if (error.code === 'PGRST301') {
          setErrorMessage('Row Level Security is blocking access. Please disable RLS or add policies to the users table.')
        } else if (error.message) {
          setErrorMessage(`Error: ${error.message}`)
        } else {
          setErrorMessage('Failed to fetch users. Check browser console for details.')
        }
      }
      
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  const fetchRegions = async () => {
    try {
      const { data } = await cachedFetch('regions', async () => {
        const { data, error } = await supabase
          .from('regions')
          .select('id, region_name')
          .order('region_name', { ascending: true })
        if (error) throw error
        return data || []
      }, TTL.VERY_LONG)
      setRegions(data)
    } catch (error) {
      // Silently fail - data will not be available
    }
  }

  const fetchDepartments = async () => {
    try {
      const { data } = await cachedFetch('departments_lookup', async () => {
        const { data, error } = await supabase
          .from('departments')
          .select('id, department_name')
          .order('department_name', { ascending: true })
        if (error) throw error
        return data || []
      }, TTL.LONG)
      setDepartments(data)
    } catch (error) {
      // Silently fail - data will not be available
    }
  }

  const fetchSubDepartments = async () => {
    try {
      const { data } = await cachedFetch('sub_departments', async () => {
        const { data, error } = await supabase
          .from('sub_departments')
          .select('id, department_id, sub_department_name')
          .order('sub_department_name', { ascending: true })
        if (error) throw error
        return data || []
      }, TTL.VERY_LONG)
      setSubDepartments(data)
    } catch (error) {
      // Silently fail - data will not be available
    }
  }

  const fetchBranches = async () => {
    try {
      const { data } = await cachedFetch('branches', async () => {
        const { data, error } = await supabase
          .from('branches')
          .select('id, region_id, branch_name')
          .order('branch_name', { ascending: true })
        if (error) throw error
        return data || []
      }, TTL.VERY_LONG)
      setBranches(data)
    } catch (error) {
      // Silently fail - data will not be available
    }
  }

  const fetchSubBranches = async () => {
    try {
      const { data } = await cachedFetch('sub_branches', async () => {
        const { data, error } = await supabase
          .from('sub_branches')
          .select('id, branch_id, sub_branch_name')
          .order('sub_branch_name', { ascending: true })
        if (error) throw error
        return data || []
      }, TTL.VERY_LONG)
      setSubBranches(data)
    } catch (error) {
      // Silently fail - data will not be available
    }
  }

  const fetchGrades = async () => {
    try {
      const { data } = await cachedFetch('grades', async () => {
        const { data, error } = await supabase
          .from('grades')
          .select('id, grade_name')
          .order('grade_name', { ascending: true })
        if (error) throw error
        return data || []
      }, TTL.VERY_LONG)
      setGrades(data)
    } catch (error) {
      // Silently fail - data will not be available
    }
  }

  const fetchDesignations = async () => {
    try {
      const { data } = await cachedFetch('designations', async () => {
        const { data, error } = await supabase
          .from('designations')
          .select('id, designation_name')
          .order('designation_name', { ascending: true })
        if (error) throw error
        return data || []
      }, TTL.VERY_LONG)
      setDesignations(data)
    } catch (error) {
      // Silently fail - data will not be available
    }
  }

  const getDesignationName = (designationId) => {
    if (!designationId) return 'N/A'
    const designation = designations.find(d => d.id === designationId)
    return designation ? designation.designation_name : 'N/A'
  }

  const watchedVideos = [
    { title: 'Introduction to Sales Funnels', status: 'Completed' },
    { title: 'Advanced Negotiation Tactics', status: 'Completed' },
    { title: 'Closing High-Ticket Deals', status: 'In Progress' }
  ]

  const openDrawer = (user) => {
    setSelectedUser(user)
    setDrawerOpen(true)
    // Initialize charts after drawer opens
    setTimeout(() => initializeCharts(user.progress), 100)
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setTimeout(() => setSelectedUser(null), 300)
  }

  const normalizeEmploymentStatus = (value) => {
    const normalized = String(value || '').trim().toLowerCase()
    return normalized === 'inactive' ? 'inactive' : 'active'
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const openEditModal = async (user) => {
    try {
      // Fetch the full user data from database
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error) throw error

      // Populate form with user data
      setFormData({
        full_name: data.full_name || '',
        email: data.email || '',
        phone: data.phone || '',
        role: data.role || 'user',
        employee_id: data.employee_id || '',
        reporting_manager: data.reporting_manager || '',
        password: '', // Don't populate password for security
        date_of_birth: data.date_of_birth || '',
        date_of_joining: data.date_of_joining || '',
        leaving_date: data.leaving_date || '',
        status: normalizeEmploymentStatus(data.status),
        region_id: data.region_id || '',
        branch_id: data.branch_id || '',
        sub_branch_id: data.sub_branch_id || '',
        department_id: data.department_id || '',
        sub_department_id: data.sub_department_id || '',
        grade_id: data.grade_id || '',
        designation_id: data.designation_id || ''
      })

      const selectedManager = users.find(u => u.employeeId === data.reporting_manager)
      setManagerSearchQuery(selectedManager ? selectedManager.name : '')
      
      // Lazy load additional data when edit modal opens
      if (regions.length === 0) {
        Promise.all([fetchRegions(), fetchBranches(), fetchSubBranches(), fetchSubDepartments(), fetchGrades()])
      }
      
      setEditingUserId(user.id)
      setEditUserModalOpen(true)
    } catch (error) {
      showNotification('Failed to load user data: ' + error.message, 'error')
    }
  }

  const handleAddUser = async (e) => {
    e.preventDefault()
    
    try {
      setLoading(true)
      setErrorMessage('')
      
      // Validate required fields
      if (!formData.full_name || !formData.email || !formData.employee_id) {
        setErrorMessage('Please fill in all required fields: Full Name, Email, and Employee ID')
        showNotification('Please fill in all required fields: Full Name, Email, and Employee ID', 'warning')
        setLoading(false)
        return
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(formData.email)) {
        setErrorMessage('Please enter a valid email address')
        setLoading(false)
        return
      }
      
      // Call edge function to create auth user then profile row
      const requestBody = {
        email: formData.email.trim(),
        password: formData.password?.trim() || undefined,
        full_name: formData.full_name.trim(),
        role: formData.role || 'user',
        employee_id: formData.employee_id.trim(),
        reporting_manager: formData.reporting_manager?.trim() || null,
        phone: formData.phone?.trim() || null,
        date_of_birth: formData.date_of_birth || null,
        date_of_joining: formData.date_of_joining || null,
        leaving_date: formData.leaving_date || null,
        status: normalizeEmploymentStatus(formData.status),
        region_id: formData.region_id ? parseInt(formData.region_id) : null,
        branch_id: formData.branch_id ? parseInt(formData.branch_id) : null,
        sub_branch_id: formData.sub_branch_id ? parseInt(formData.sub_branch_id) : null,
        department_id: formData.department_id ? parseInt(formData.department_id) : null,
        sub_department_id: formData.sub_department_id ? parseInt(formData.sub_department_id) : null,
        grade_id: formData.grade_id ? parseInt(formData.grade_id) : null,
        designation_id: formData.designation_id ? parseInt(formData.designation_id) : null
      }

      console.log('Creating user with data:', { ...requestBody, password: requestBody.password ? '***' : undefined })
      
      const { data: fnData, error: fnError } = await supabase.functions.invoke('create-user', {
        body: requestBody
      })

      if (fnError) {
        console.error('Edge function error:', fnError)
        const errorMsg = fnError.message || JSON.stringify(fnError)
        // Check for duplicate email error
        if (errorMsg.includes('duplicate') || errorMsg.includes('already exists') || errorMsg.includes('unique')) {
          throw new Error('A user with this email address already exists. Please use a different email.')
        }
        throw new Error(`Edge function error: ${errorMsg}`)
      }
      
      console.log('Edge function response:', fnData)
      
      if (!fnData?.success) {
        const errorMsg = fnData?.error || 'User creation failed'
        // Check for duplicate email in response
        if (errorMsg.toLowerCase().includes('duplicate') || errorMsg.toLowerCase().includes('already exists') || errorMsg.toLowerCase().includes('unique')) {
          throw new Error('A user with this email address already exists. Please use a different email.')
        }
        throw new Error(errorMsg)
      }

      // Show generated password if auto-created
      if (fnData.generatedPassword) {
        showNotification(`User created successfully!\n\nAuto-generated password: ${fnData.generatedPassword}\n\nPlease save this password and share it securely with the user.`, 'success')
      } else {
        showNotification('User created successfully!', 'success')
      }

      // Refresh users list (force cache refresh)
      await fetchUsers(true)
      
      // Reset form and close modal
      setFormData({
        full_name: '',
        email: '',
        phone: '',
        role: 'user',
        employee_id: '',
        reporting_manager: '',
        password: '',
        date_of_birth: '',
        date_of_joining: '',
        leaving_date: '',
        status: 'active',
        region_id: '',
        branch_id: '',
        sub_branch_id: '',
        department_id: '',
        sub_department_id: '',
        grade_id: '',
        designation_id: ''
      })
      setManagerSearchQuery('')
      setManagerDropdownOpen(false)
      setAddUserModalOpen(false)
      
    } catch (error) {
      console.error('User creation error:', error)
      const errorMsg = error.message || 'Failed to create user. Please try again.'
      showNotification(`Failed to add user: ${errorMsg}`, 'error')

    } finally {
      setLoading(false)
    }
  }

  const handleUpdateUser = async (e) => {
    e.preventDefault()
    
    try {
      setLoading(true)
      
      // Validate required fields
      if (!formData.full_name || !formData.email || !formData.employee_id) {
        showNotification('Please fill in all required fields: Full Name, Email, and Employee ID', 'warning')
        setLoading(false)
        return
      }

      // Prepare update data (exclude password and email as they're handled separately)
      const updateData = {
        full_name: formData.full_name,
        role: formData.role,
        employee_id: formData.employee_id,
        reporting_manager: formData.reporting_manager || null,
        phone: formData.phone || null,
        date_of_birth: formData.date_of_birth || null,
        date_of_joining: formData.date_of_joining || null,
        leaving_date: formData.leaving_date || null,
        status: normalizeEmploymentStatus(formData.status),
        region_id: formData.region_id ? parseInt(formData.region_id) : null,
        branch_id: formData.branch_id ? parseInt(formData.branch_id) : null,
        sub_branch_id: formData.sub_branch_id ? parseInt(formData.sub_branch_id) : null,
        department_id: formData.department_id ? parseInt(formData.department_id) : null,
        sub_department_id: formData.sub_department_id ? parseInt(formData.sub_department_id) : null,
        grade_id: formData.grade_id ? parseInt(formData.grade_id) : null,
        designation_id: formData.designation_id ? parseInt(formData.designation_id) : null
      }

      // Update user in database
      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', editingUserId)

      if (error) {
        throw new Error(`Failed to update user: ${error.message}`)
      }

      // Update password if requested
      if (updatePassword && formData.password) {
        const { data: { session } } = await supabase.auth.getSession()
        
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-user-password`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token}`
            },
            body: JSON.stringify({
              userId: editingUserId,
              password: formData.password
            })
          }
        )

        const result = await response.json()

        if (!response.ok) {
          throw new Error(`Failed to update password: ${result.error}`)
        }
      }

      showNotification('User updated successfully!', 'success')

      // Refresh users list (force cache refresh)
      await fetchUsers(true)
      
      // Reset form and close modal
      setFormData({
        full_name: '',
        email: '',
        phone: '',
        role: 'user',
        employee_id: '',
        reporting_manager: '',
        password: '',
        date_of_birth: '',
        date_of_joining: '',
        leaving_date: '',
        status: 'active',
        region_id: '',
        branch_id: '',
        sub_branch_id: '',
        department_id: '',
        sub_department_id: '',
        grade_id: '',
        designation_id: ''
      })
      setManagerSearchQuery('')
      setManagerDropdownOpen(false)
      setEditingUserId(null)
      setEditUserModalOpen(false)
      setUpdatePassword(false)
      
    } catch (error) {
      showNotification(`Failed to update user: ${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteUser = async (user) => {
    try {
      if (!user?.id) return
      const ok = window.confirm(`Delete user "${user.name}"? This removes their row in public.users.`)
      if (!ok) return
      setLoading(true)
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', user.id)

      if (error) {
        if (/row-level security/i.test(error.message)) {
          showNotification('RLS blocked delete. Ensure admin DELETE policy exists on public.users. See SUPABASE_SETUP.md Users policies.', 'error')
        } else {
          showNotification('Failed to delete user: ' + error.message, 'error')
        }
        return
      }

      await fetchUsers(true)
      showNotification('User deleted', 'success')
    } catch (err) {
      showNotification('Failed to delete user: ' + (err.message || 'Unknown error'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleStatus = async (e, user) => {
    e.stopPropagation()
    try {
      const newStatus = user.status === 'Active' ? 'inactive' : 'active'

      setUsers(prevUsers =>
        prevUsers.map(currentUser =>
          currentUser.id === user.id
            ? { ...currentUser, status: newStatus === 'inactive' ? 'Inactive' : 'Active' }
            : currentUser
        )
      )

      if (selectedUser?.id === user.id) {
        setSelectedUser(prevUser =>
          prevUser ? { ...prevUser, status: newStatus === 'inactive' ? 'Inactive' : 'Active' } : prevUser
        )
      }

      const { error } = await supabase
        .from('users')
        .update({ status: newStatus })
        .eq('id', user.id)

      if (error) {
        setUsers(prevUsers =>
          prevUsers.map(currentUser =>
            currentUser.id === user.id
              ? { ...currentUser, status: user.status }
              : currentUser
          )
        )

        if (selectedUser?.id === user.id) {
          setSelectedUser(prevUser =>
            prevUser ? { ...prevUser, status: user.status } : prevUser
          )
        }

        showNotification('Failed to update status: ' + error.message, 'error')
        return
      }

      cacheDelete('users_screen_data').catch(() => {})
    } catch (err) {
      showNotification('Failed to update status: ' + (err.message || 'Unknown error'), 'error')
    }
  }

  // Download Excel template
  const downloadTemplate = () => {
    const template = [
      {
        'Full Name*': 'John Doe',
        'Email*': 'john.doe@example.com',
        'Employee ID*': 'EMP001',
        'Reporting Manager Employee ID': 'EMP010',
        'Password*': 'password123',
        'Phone': '123-456-7890',
        'Role': 'user',
        'Date of Birth': '1990-01-15',
        'Date of Joining': '2024-01-01',
        'Region': 'North',
        'Branch': 'Main Branch',
        'Sub Branch': 'Sub Branch 1',
        'Department': 'IT',
        'Sub Department': 'Software',
        'Grade': 'Grade A',
        'Designation': 'Developer'
      }
    ]

    const ws = XLSX.utils.json_to_sheet(template)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Users Template')
    
    // Set column widths
    ws['!cols'] = [
      { wch: 20 }, { wch: 30 }, { wch: 15 }, { wch: 15 },
      { wch: 24 }, { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 15 },
      { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
      { wch: 20 }, { wch: 15 }, { wch: 20 }
    ]

    XLSX.writeFile(wb, 'users_bulk_upload_template.xlsx')
  }

  const downloadAllUsersData = () => {
    if (!users.length) {
      showNotification('No users available to export', 'warning')
      return
    }

    try {
      setExportingUsers(true)

      // Define columns to export in specific order with exact names
      const columnMapping = {
        'Employee_id': 'employee_id',
        'Full_name': 'full_name',
        'Email': 'email',
        'Phone': 'phone',
        'Designation': 'designation',
        'Branch': 'branch',
        'Sub Branch': 'subBranch',
        'Region': 'region',
        'Department': 'department',
        'Sub Department': 'subDepartment',
        'Reporting_manager': 'reporting_manager',
        'Date_of_birth': 'date_of_birth',
        'Date_of_joining': 'date_of_joining',
        'Leaving_date': 'leaving_date',
        'Role': 'role',
        'Status': 'status'
      }

      const exportRows = users.map((user) => {
        const row = {}
        Object.entries(columnMapping).forEach(([displayKey, userKey]) => {
          row[displayKey] = user[userKey] || ''
        })
        return row
      })

      const ws = XLSX.utils.json_to_sheet(exportRows)
      
      // Auto-fit columns based on content
      const maxWidth = 32
      if (exportRows.length > 0) {
        const colWidths = Object.keys(exportRows[0]).map(key => ({
          wch: Math.min(maxWidth, Math.max(key.length + 2, 12))
        }))
        ws['!cols'] = colWidths
      }

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Users')
      XLSX.writeFile(wb, `users_data_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (error) {
      showNotification('Failed to export users: ' + (error?.message || 'Unknown error'), 'error')
    } finally {
      setExportingUsers(false)
    }
  }

  // Process bulk upload
  const handleBulkUpload = async () => {
    if (!uploadedFile) {
      showNotification('Please select a file first', 'warning')
      return
    }

    setLoading(true)
    setBulkUploadResults(null)

    try {
      const data = await uploadedFile.arrayBuffer()
      const workbook = XLSX.read(data)
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json(worksheet)

      if (jsonData.length === 0) {
        showNotification('The Excel file is empty', 'warning')
        setLoading(false)
        return
      }

      const results = {
        total: jsonData.length,
        success: 0,
        failed: 0,
        errors: []
      }

      // Process each row
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i]
        try {
          // Validate required fields
          if (!row['Full Name*'] || !row['Email*'] || !row['Employee ID*'] || !row['Password*']) {
            throw new Error('Missing required fields')
          }

          const email = String(row['Email*']).trim()

          // Skip users that already exist (by email)
          try {
            const { data: existingUser, error: existingError } = await supabase
              .from('users')
              .select('id')
              .eq('email', email)
              .maybeSingle()

            if (!existingError && existingUser) {
              // Treat existing users as successfully handled and skip creation
              results.success++
              continue
            }
          } catch (checkError) {
            // If this check fails, we still try to create the user below
          }

          // Find IDs for lookup fields
          const regionId = row['Region'] ? regions.find(r => r.region_name === row['Region'])?.id : null
          const branchId = row['Branch'] ? branches.find(b => b.branch_name === row['Branch'])?.id : null
          const subBranchId = row['Sub Branch'] ? subBranches.find(sb => sb.sub_branch_name === row['Sub Branch'])?.id : null
          const departmentId = row['Department'] ? departments.find(d => d.department_name === row['Department'])?.id : null
          const subDepartmentId = row['Sub Department'] ? subDepartments.find(sd => sd.sub_department_name === row['Sub Department'])?.id : null
          const gradeId = row['Grade'] ? grades.find(g => g.grade_name === row['Grade'])?.id : null
          const designationId = row['Designation'] ? designations.find(d => d.designation_name === row['Designation'])?.id : null

          // Call the same edge function used for single user creation
          const requestBody = {
            email,
            password: row['Password*'],
            full_name: row['Full Name*'],
            employee_id: row['Employee ID*'],
            reporting_manager: row['Reporting Manager Employee ID'] ? String(row['Reporting Manager Employee ID']).trim() : null,
            // Ensure phone is always sent as a string if present
            phone: row['Phone'] ? String(row['Phone']) : null,
            role: row['Role'] || 'user',
            date_of_birth: row['Date of Birth'] || null,
            date_of_joining: row['Date of Joining'] || null,
            region_id: regionId,
            branch_id: branchId,
            sub_branch_id: subBranchId,
            department_id: departmentId,
            sub_department_id: subDepartmentId,
            grade_id: gradeId,
            designation_id: designationId
          }

          const { data: fnData, error: fnError } = await supabase.functions.invoke('create-user', {
            body: requestBody
          })

          if (fnError) {
            throw new Error(fnError.message || 'Edge function error while creating user')
          }

          if (!fnData?.success) {
            throw new Error(fnData?.error || 'User creation failed')
          }

          results.success++
        } catch (error) {
          results.failed++
          results.errors.push({
            row: i + 2, // +2 because Excel rows start at 1 and there's a header
            email: row['Email*'] || 'N/A',
            error: error.message
          })
        }
      }

      setBulkUploadResults(results)
      await fetchUsers(true)

    } catch (error) {
      showNotification(`Failed to process file: ${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const initializeCharts = (progress) => {
    if (typeof Highcharts !== 'undefined') {
      // Module Completion Gauge
      Highcharts.chart('module-completion-gauge', {
        chart: { type: 'solidgauge', backgroundColor: 'transparent', height: 160 },
        title: { text: null },
        credits: { enabled: false },
        pane: {
          center: ['50%', '85%'],
          size: '140%',
          startAngle: -90,
          endAngle: 90,
          background: {
            backgroundColor: '#EEE',
            innerRadius: '60%',
            outerRadius: '100%',
            shape: 'arc'
          }
        },
        yAxis: {
          min: 0,
          max: 100,
          stops: [
            [0.1, '#EF4444'],
            [0.5, '#F59E0B'],
            [0.9, '#10B981']
          ],
          lineWidth: 0,
          tickWidth: 0,
          minorTickInterval: null,
          tickAmount: 2,
          labels: { y: 16 }
        },
        plotOptions: {
          solidgauge: {
            dataLabels: {
              y: -25,
              borderWidth: 0,
              useHTML: true,
              format: '<div style="text-align:center"><span style="font-size:2rem;font-weight:bold;color:#111827">{y}%</span></div>'
            }
          }
        },
        series: [{
          name: 'Progress',
          data: [progress],
          dataLabels: { format: '<div style="text-align:center"><span style="font-size:2rem;font-weight:bold">{y}%</span></div>' }
        }]
      })

      // Quiz Scores Chart
      Highcharts.chart('quiz-scores-chart', {
        chart: { type: 'column', backgroundColor: 'transparent', height: 192 },
        title: { text: null },
        credits: { enabled: false },
        xAxis: {
          categories: ['Quiz 1', 'Quiz 2', 'Quiz 3', 'Quiz 4', 'Quiz 5'],
          labels: { style: { color: '#6B7280', fontSize: '11px' } }
        },
        yAxis: {
          min: 0,
          max: 100,
          title: { text: null },
          labels: { style: { color: '#6B7280' } }
        },
        legend: { enabled: false },
        tooltip: { valueSuffix: '%' },
        plotOptions: {
          column: {
            borderRadius: 4,
            dataLabels: { enabled: false },
            colorByPoint: false,
            color: '#4F46E5'
          }
        },
        series: [{
          name: 'Score',
          data: [85, 92, 78, 88, 95]
        }]
      })
    }
  }

  return (
    <>
        <main className="users-main">
          <section className="users-header">
            <div>
              <h2>User Management</h2>
              <p>Manage all users, their roles, and progress.</p>
            </div>
            <div className="action-buttons">
              <button className="btn btn-secondary" onClick={() => fetchUsers(true)} disabled={loading}>
                <i className={`fa-solid fa-refresh ${loading ? 'fa-spin' : ''}`}></i>Refresh
              </button>
              <button className="btn btn-secondary" onClick={downloadAllUsersData} disabled={loading || exportingUsers}>
                <i className={`fa-solid ${exportingUsers ? 'fa-spinner fa-spin' : 'fa-download'}`}></i>
                {exportingUsers ? 'Exporting...' : 'Download Users'}
              </button>
              <button className="btn btn-secondary" onClick={() => setBulkUploadModalOpen(true)}>
                <i className="fa-solid fa-file-excel"></i>Bulk Upload
              </button>
              <button className="btn btn-primary" onClick={() => {
                // Lazy load additional data when modal opens
                if (regions.length === 0) {
                  Promise.all([fetchRegions(), fetchBranches(), fetchSubBranches(), fetchSubDepartments(), fetchGrades()])
                }
                setAddUserModalOpen(true)
              }}>
                <i className="fa-solid fa-user-plus"></i>Add New User
              </button>
            </div>
          </section>

          {errorMessage && (
            <div style={{
              padding: '1rem',
              marginBottom: '1rem',
              backgroundColor: '#FEE2E2',
              border: '1px solid #DC2626',
              borderRadius: '0.5rem',
              color: '#991B1B'
            }}>
              <strong>⚠️ Error:</strong> {errorMessage}
            </div>
          )}

          <section className="users-table-container">
            <div className="table-filters">
              <div className="search-wrapper">
                <i className="fa-solid fa-magnifying-glass"></i>
                <input 
                  type="text" 
                  placeholder="Search by name or email..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="filter-select-wrapper">
                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                  <option>All Roles</option>
                  <option>Admin</option>
                  <option>User</option>
                  <option>Trainer</option>
                  <option>Test</option>
                </select>
              </div>
              <div className="filter-select-wrapper">
                <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
                  <option>All Departments</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.department_name}>
                      {dept.department_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Designation</th>
                    <th>Role</th>
                    <th>Branch</th>
                    <th>Sub Branch</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                        <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '2rem', color: '#4F46E5' }}></i>
                        <p style={{ marginTop: '1rem', color: '#6B7280' }}>Loading users...</p>
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                        <i className="fa-solid fa-users" style={{ fontSize: '2rem', color: '#9CA3AF' }}></i>
                        <p style={{ marginTop: '1rem', color: '#6B7280' }}>No users found. Add your first user!</p>
                      </td>
                    </tr>
                  ) : (
                    filteredUsers
                      .map(user => (
                      <tr key={user.id} className="user-row" onClick={() => openDrawer(user)}>
                        <td className="user-cell">
                          <div>
                            <div className="user-name">{user.name}</div>
                            <div className="user-email">{user.email}</div>
                          </div>
                        </td>
                        <td>{user.designation}</td>
                        <td>
                          <span className={`role-badge ${user.role.toLowerCase()}`}>{user.role}</span>
                        </td>
                        <td>{user.branch}</td>
                        <td>{user.subBranch}</td>
                        <td>
                          <label
                            className={`toggle-switch ${user.status.toLowerCase()}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input 
                              type="checkbox" 
                              checked={user.status === 'Active'}
                              onChange={(e) => handleToggleStatus(e, user)}
                              onClick={(e) => e.stopPropagation()}
                              title={`Click to toggle to ${user.status === 'Active' ? 'Inactive' : 'Active'}`}
                            />
                            <span className="slider"></span>
                            <span className="toggle-label">{user.status === 'Active' ? 'Active' : 'Inactive'}</span>
                          </label>
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button className="action-btn edit-btn" onClick={(e) => { e.stopPropagation(); openEditModal(user); }}>
                              <i className="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button className="action-btn delete-btn" onClick={(e) => { e.stopPropagation(); handleDeleteUser(user) }}>
                              <i className="fa-solid fa-trash-can"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>

      {/* User Details Drawer */}
      <div className={`drawer-overlay ${drawerOpen ? 'active' : ''}`} onClick={closeDrawer}></div>
      <aside className={`user-details-drawer ${drawerOpen ? 'open' : ''}`}>
        {selectedUser && (
          <div className="drawer-content">
            <div className="drawer-header">
              <h5>User Details</h5>
              <button className="close-drawer-btn" onClick={closeDrawer}>
                <i className="fa-solid fa-times"></i>
              </button>
            </div>

            <div className="user-profile">
              <div className="user-avatar-large">{getInitials(selectedUser.name)}</div>
              <div>
                <h3>{selectedUser.name}</h3>
                <p>Role: <span>{selectedUser.role}</span></p>
                <p>Department: <span>{selectedUser.department}</span></p>
              </div>
            </div>

            <div className="drawer-body">
              <div className="chart-card">
                <h4>Overall Module Completion</h4>
                <div id="module-completion-gauge"></div>
              </div>

              <div className="chart-card">
                <h4>Latest Quiz Scores</h4>
                <div id="quiz-scores-chart"></div>
              </div>

              <div className="videos-card">
                <h4>Watched Videos</h4>
                <ul className="videos-list">
                  {watchedVideos.map((video, index) => (
                    <li key={index}>
                      <span>{video.title}</span>
                      <span className={`video-status ${video.status.toLowerCase().replace(' ', '-')}`}>
                        {video.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="drawer-footer">
              <button className="btn btn-secondary">Send Reminder</button>
              <button className="btn btn-danger">Reset Progress</button>
            </div>
          </div>
        )}
      </aside>

      {/* Add User Modal */}
      {addUserModalOpen && (
        <div className="modal-backdrop" onClick={() => setAddUserModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add New User</h3>
              <button onClick={() => { setAddUserModalOpen(false); setErrorMessage(''); }}>
                <i className="fa-solid fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleAddUser}>
              <div className="modal-body">
                {errorMessage && (
                  <div style={{
                    padding: '0.75rem',
                    marginBottom: '1rem',
                    backgroundColor: '#FEE2E2',
                    border: '1px solid #DC2626',
                    borderRadius: '0.5rem',
                    color: '#991B1B',
                    fontSize: '0.875rem'
                  }}>
                    <strong>⚠️ Error:</strong> {errorMessage}
                  </div>
                )}
                
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="full_name">Full Name *</label>
                    <input 
                      type="text" 
                      id="full_name" 
                      name="full_name"
                      value={formData.full_name}
                      onChange={handleInputChange}
                      placeholder="e.g., John Doe" 
                      required 
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="employee_id">Employee ID *</label>
                    <input 
                      type="text" 
                      id="employee_id" 
                      name="employee_id"
                      value={formData.employee_id}
                      onChange={handleInputChange}
                      placeholder="e.g., EMP001" 
                      required 
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="reporting_manager_combobox">Reporting Manager</label>
                  <div className="rm-combobox">
                    <input
                      type="text"
                      id="reporting_manager_combobox"
                      value={managerSearchQuery}
                      onFocus={() => setManagerDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setManagerDropdownOpen(false), 120)}
                      onChange={(e) => {
                        setManagerSearchQuery(e.target.value)
                        setFormData(prev => ({ ...prev, reporting_manager: '' }))
                        setManagerDropdownOpen(true)
                      }}
                      placeholder="Search manager by name or employee ID"
                      autoComplete="off"
                    />
                    {managerDropdownOpen && (
                      <div className="rm-dropdown" role="listbox" aria-label="Reporting manager options">
                        <button
                          type="button"
                          className="rm-option"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setFormData(prev => ({ ...prev, reporting_manager: '' }))
                            setManagerSearchQuery('')
                            setManagerDropdownOpen(false)
                          }}
                        >
                          None
                        </button>
                        {reportingManagerOptions.length === 0 ? (
                          <div className="rm-empty">No managers found</div>
                        ) : (
                          reportingManagerOptions.map((manager) => (
                            <button
                              type="button"
                              key={manager.employee_id}
                              className="rm-option"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => selectReportingManager(manager)}
                            >
                              {manager.name} ({manager.employee_id})
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <small style={{ color: '#6B7280', fontSize: '0.875rem' }}>
                    Stored value: employee ID
                  </small>
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="email">Email Address *</label>
                    <input 
                      type="email" 
                      id="email" 
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="e.g., name@company.com" 
                      required 
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="phone">Phone</label>
                    <input 
                      type="tel" 
                      id="phone" 
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="e.g., 123-456-7890" 
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="password">Password (optional)</label>
                  <input
                    type="text"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="Auto-generate if left blank"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="region_id">Region</label>
                    <select 
                      id="region_id" 
                      name="region_id"
                      value={formData.region_id}
                      onChange={handleInputChange}
                    >
                      <option value="">Select region</option>
                      {regions.map(region => (
                        <option key={region.id} value={region.id}>
                          {region.region_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="branch_id">Branch</label>
                    <select 
                      id="branch_id" 
                      name="branch_id"
                      value={formData.branch_id}
                      onChange={handleInputChange}
                    >
                      <option value="">Select branch</option>
                      {branches
                        .filter(branch => !formData.region_id || branch.region_id === parseInt(formData.region_id))
                        .map(branch => (
                          <option key={branch.id} value={branch.id}>
                            {branch.branch_name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="sub_branch_id">Sub-Branch</label>
                    <select 
                      id="sub_branch_id" 
                      name="sub_branch_id"
                      value={formData.sub_branch_id}
                      onChange={handleInputChange}
                    >
                      <option value="">Select sub-branch</option>
                      {subBranches
                        .filter(subBranch => !formData.branch_id || subBranch.branch_id === parseInt(formData.branch_id))
                        .map(subBranch => (
                          <option key={subBranch.id} value={subBranch.id}>
                            {subBranch.sub_branch_name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="department_id">Department</label>
                    <select 
                      id="department_id" 
                      name="department_id"
                      value={formData.department_id}
                      onChange={handleInputChange}
                    >
                      <option value="">Select department</option>
                      {departments.map(dept => (
                        <option key={dept.id} value={dept.id}>
                          {dept.department_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="sub_department_id">Sub-Department</label>
                    <select 
                      id="sub_department_id" 
                      name="sub_department_id"
                      value={formData.sub_department_id}
                      onChange={handleInputChange}
                    >
                      <option value="">Select sub-department</option>
                      {subDepartments
                        .filter(subDept => !formData.department_id || subDept.department_id === parseInt(formData.department_id))
                        .map(subDept => (
                          <option key={subDept.id} value={subDept.id}>
                            {subDept.sub_department_name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="designation_id">Designation</label>
                    <select 
                      id="designation_id" 
                      name="designation_id"
                      value={formData.designation_id}
                      onChange={handleInputChange}
                    >
                      <option value="">Select designation</option>
                      {designations.map(designation => (
                        <option key={designation.id} value={designation.id}>
                          {designation.designation_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="grade_id">Grade</label>
                    <select 
                      id="grade_id" 
                      name="grade_id"
                      value={formData.grade_id}
                      onChange={handleInputChange}
                    >
                      <option value="">Select grade</option>
                      {grades.map(grade => (
                        <option key={grade.id} value={grade.id}>
                          {grade.grade_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="role">Role</label>
                    <select 
                      id="role" 
                      name="role"
                      value={formData.role}
                      onChange={handleInputChange}
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                      <option value="trainer">Trainer</option>
                      <option value="test">Test</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="date_of_birth">Date of Birth</label>
                    <input 
                      type="date" 
                      id="date_of_birth" 
                      name="date_of_birth"
                      value={formData.date_of_birth}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="date_of_joining">Date of Joining</label>
                    <input 
                      type="date" 
                      id="date_of_joining" 
                      name="date_of_joining"
                      value={formData.date_of_joining}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="leaving_date">Leaving Date</label>
                    <input
                      type="date"
                      id="leaving_date"
                      name="leaving_date"
                      value={formData.leaving_date}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="status">Status</label>
                    <select
                      id="status"
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setAddUserModalOpen(false)}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editUserModalOpen && (
        <div className="modal-backdrop" onClick={() => { setEditUserModalOpen(false); setEditingUserId(null); setUpdatePassword(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit User</h3>
              <button onClick={() => { setEditUserModalOpen(false); setEditingUserId(null); setUpdatePassword(false); }}>
                <i className="fa-solid fa-times"></i>
              </button>
            </div>
            <form className="modal-body" onSubmit={handleUpdateUser}>
              <div className="form-group">
                <label htmlFor="edit_full_name">Full Name *</label>
                <input 
                  type="text" 
                  id="edit_full_name" 
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleInputChange}
                  placeholder="John Doe" 
                  required 
                />
              </div>
              <div className="form-group">
                <label htmlFor="edit_employee_id">Employee ID *</label>
                <input 
                  type="text" 
                  id="edit_employee_id" 
                  name="employee_id"
                  value={formData.employee_id}
                  onChange={handleInputChange}
                  placeholder="EMP001" 
                  required 
                />
              </div>
              <div className="form-group">
                <label htmlFor="edit_reporting_manager_combobox">Reporting Manager</label>
                <div className="rm-combobox">
                  <input
                    type="text"
                    id="edit_reporting_manager_combobox"
                    value={managerSearchQuery}
                    onFocus={() => setManagerDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setManagerDropdownOpen(false), 120)}
                    onChange={(e) => {
                      setManagerSearchQuery(e.target.value)
                      setFormData(prev => ({ ...prev, reporting_manager: '' }))
                      setManagerDropdownOpen(true)
                    }}
                    placeholder="Search manager by name or employee ID"
                    autoComplete="off"
                  />
                  {managerDropdownOpen && (
                    <div className="rm-dropdown" role="listbox" aria-label="Reporting manager options">
                      <button
                        type="button"
                        className="rm-option"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setFormData(prev => ({ ...prev, reporting_manager: '' }))
                          setManagerSearchQuery('')
                          setManagerDropdownOpen(false)
                        }}
                      >
                        None
                      </button>
                      {reportingManagerOptions.length === 0 ? (
                        <div className="rm-empty">No managers found</div>
                      ) : (
                        reportingManagerOptions.map((manager) => (
                          <button
                            type="button"
                            key={manager.employee_id}
                            className="rm-option"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => selectReportingManager(manager)}
                          >
                            {manager.name} ({manager.employee_id})
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <small style={{ color: '#6B7280', fontSize: '0.875rem' }}>
                  Stored value: employee ID
                </small>
              </div>
              <div className="form-group">
                <label htmlFor="edit_email">Email Address *</label>
                <input 
                  type="email" 
                  id="edit_email" 
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="name@company.com" 
                  disabled
                  style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                />
                <small style={{ color: '#6B7280', fontSize: '0.875rem' }}>Email cannot be changed</small>
              </div>
              <div className="form-group">
                <label htmlFor="edit_phone">Phone</label>
                <input 
                  type="tel" 
                  id="edit_phone" 
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="123-456-7890" 
                />
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={updatePassword}
                    onChange={(e) => {
                      setUpdatePassword(e.target.checked)
                      if (!e.target.checked) {
                        setFormData({ ...formData, password: '' })
                      }
                    }}
                    style={{ marginRight: '8px', width: '16px', height: '16px' }}
                  />
                  Update Password
                </label>
              </div>
              {updatePassword && (
                <div className="form-group">
                  <label htmlFor="edit_password">New Password *</label>
                  <input 
                    type="password" 
                    id="edit_password" 
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="Enter new password"
                    minLength="6"
                    required={updatePassword}
                  />
                  <small style={{ color: '#6B7280', fontSize: '0.875rem' }}>Minimum 6 characters</small>
                </div>
              )}
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="edit_region_id">Region</label>
                  <select 
                    id="edit_region_id" 
                    name="region_id"
                    value={formData.region_id}
                    onChange={handleInputChange}
                  >
                    <option value="">Select region</option>
                    {regions.map(region => (
                      <option key={region.id} value={region.id}>
                        {region.region_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="edit_branch_id">Branch</label>
                  <select 
                    id="edit_branch_id" 
                    name="branch_id"
                    value={formData.branch_id}
                    onChange={handleInputChange}
                  >
                    <option value="">Select branch</option>
                    {branches
                      .filter(branch => !formData.region_id || branch.region_id === parseInt(formData.region_id))
                      .map(branch => (
                        <option key={branch.id} value={branch.id}>
                          {branch.branch_name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="edit_sub_branch_id">Sub-Branch</label>
                  <select 
                    id="edit_sub_branch_id" 
                    name="sub_branch_id"
                    value={formData.sub_branch_id}
                    onChange={handleInputChange}
                  >
                    <option value="">Select sub-branch</option>
                    {subBranches
                      .filter(subBranch => !formData.branch_id || subBranch.branch_id === parseInt(formData.branch_id))
                      .map(subBranch => (
                        <option key={subBranch.id} value={subBranch.id}>
                          {subBranch.sub_branch_name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="edit_department_id">Department</label>
                  <select 
                    id="edit_department_id" 
                    name="department_id"
                    value={formData.department_id}
                    onChange={handleInputChange}
                  >
                    <option value="">Select department</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id}>
                        {dept.department_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="edit_sub_department_id">Sub-Department</label>
                  <select 
                    id="edit_sub_department_id" 
                    name="sub_department_id"
                    value={formData.sub_department_id}
                    onChange={handleInputChange}
                  >
                    <option value="">Select sub-department</option>
                    {subDepartments
                      .filter(subDept => !formData.department_id || subDept.department_id === parseInt(formData.department_id))
                      .map(subDept => (
                        <option key={subDept.id} value={subDept.id}>
                          {subDept.sub_department_name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="edit_grade_id">Grade</label>
                  <select 
                    id="edit_grade_id" 
                    name="grade_id"
                    value={formData.grade_id}
                    onChange={handleInputChange}
                  >
                    <option value="">Select grade</option>
                    {grades.map(grade => (
                      <option key={grade.id} value={grade.id}>
                        {grade.grade_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="edit_designation_id">Designation</label>
                  <select 
                    id="edit_designation_id" 
                    name="designation_id"
                    value={formData.designation_id}
                    onChange={handleInputChange}
                  >
                    <option value="">Select designation</option>
                    {designations.map(designation => (
                      <option key={designation.id} value={designation.id}>
                        {designation.designation_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="edit_role">Role</label>
                  <select 
                    id="edit_role" 
                    name="role"
                    value={formData.role}
                    onChange={handleInputChange}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                    <option value="trainer">Trainer</option>
                    <option value="test">Test</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="edit_date_of_birth">Date of Birth</label>
                  <input 
                    type="date" 
                    id="edit_date_of_birth" 
                    name="date_of_birth"
                    value={formData.date_of_birth}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="edit_date_of_joining">Date of Joining</label>
                  <input 
                    type="date" 
                    id="edit_date_of_joining" 
                    name="date_of_joining"
                    value={formData.date_of_joining}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="edit_leaving_date">Leaving Date</label>
                  <input
                    type="date"
                    id="edit_leaving_date"
                    name="leaving_date"
                    value={formData.leaving_date}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="edit_status">Status</label>
                  <select
                    id="edit_status"
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => { setEditUserModalOpen(false); setEditingUserId(null); setUpdatePassword(false); }}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? 'Updating...' : 'Update User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {bulkUploadModalOpen && (
        <div className="modal-backdrop" onClick={() => { setBulkUploadModalOpen(false); setUploadedFile(null); setBulkUploadResults(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3>Bulk Upload Users</h3>
              <button onClick={() => { setBulkUploadModalOpen(false); setUploadedFile(null); setBulkUploadResults(null); }}>
                <i className="fa-solid fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '1.5rem' }}>
                <p style={{ color: '#6B7280', marginBottom: '1rem' }}>
                  Upload an Excel file with user data. Download the template below to see the required format.
                </p>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={downloadTemplate}
                  style={{ width: '100%' }}
                >
                  <i className="fa-solid fa-download"></i>Download Excel Template
                </button>
              </div>

              <div className="form-group">
                <label htmlFor="bulk_upload_file">Upload Excel File *</label>
                <input 
                  type="file" 
                  id="bulk_upload_file"
                  accept=".xlsx,.xls"
                  onChange={(e) => {
                    setUploadedFile(e.target.files[0])
                    setBulkUploadResults(null)
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '2px dashed #D1D5DB',
                    borderRadius: '0.5rem',
                    cursor: 'pointer'
                  }}
                />
                {uploadedFile && (
                  <small style={{ color: '#4F46E5', marginTop: '0.5rem', display: 'block' }}>
                    <i className="fa-solid fa-file-excel"></i> {uploadedFile.name}
                  </small>
                )}
              </div>

              {bulkUploadResults && (
                <div style={{
                  marginTop: '1.5rem',
                  padding: '1rem',
                  backgroundColor: bulkUploadResults.failed === 0 ? '#F0FDF4' : '#FEF3C7',
                  borderRadius: '0.5rem',
                  border: `1px solid ${bulkUploadResults.failed === 0 ? '#22C55E' : '#F59E0B'}`
                }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#1F2937' }}>Upload Results</h4>
                  <p style={{ margin: '0.25rem 0', color: '#4B5563' }}>
                    <strong>Total:</strong> {bulkUploadResults.total} | 
                    <strong style={{ color: '#22C55E', marginLeft: '0.5rem' }}>Success:</strong> {bulkUploadResults.success} | 
                    <strong style={{ color: '#EF4444', marginLeft: '0.5rem' }}>Failed:</strong> {bulkUploadResults.failed}
                  </p>
                  {bulkUploadResults.errors.length > 0 && (
                    <div style={{ marginTop: '1rem' }}>
                      <h5 style={{ margin: '0 0 0.5rem 0', color: '#991B1B' }}>Errors:</h5>
                      <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {bulkUploadResults.errors.map((err, idx) => (
                          <div key={idx} style={{ 
                            padding: '0.5rem', 
                            marginBottom: '0.5rem', 
                            backgroundColor: '#FEE2E2', 
                            borderRadius: '0.25rem',
                            fontSize: '0.875rem'
                          }}>
                            <strong>Row {err.row}:</strong> {err.email} - {err.error}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="modal-footer" style={{ marginTop: '1.5rem' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => { setBulkUploadModalOpen(false); setUploadedFile(null); setBulkUploadResults(null); }}
                  disabled={loading}
                >
                  Close
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary"
                  onClick={handleBulkUpload}
                  disabled={loading || !uploadedFile}
                >
                  {loading ? 'Uploading...' : 'Upload Users'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Users
