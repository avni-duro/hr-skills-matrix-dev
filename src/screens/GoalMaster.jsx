import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabaseClient'
import { cacheDelete, cachedFetch, TTL } from '../utils/cacheDB'
import './GoalMaster.css'

function asText(value) {
  return String(value || '').trim()
}

function formatDate(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function parseDateInput(value) {
  if (value == null || value === '') return null

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const y = parsed.y
      const m = String(parsed.m).padStart(2, '0')
      const d = String(parsed.d).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
  }

  const text = String(value).trim()
  if (!text) return null
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return null
  const y = parsed.getFullYear()
  const m = String(parsed.getMonth() + 1).padStart(2, '0')
  const d = String(parsed.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function pickCell(row, keys) {
  const entries = Object.entries(row || {})
  const normalizedCandidates = keys.map(normalizeHeader)
  for (const [key, val] of entries) {
    if (normalizedCandidates.includes(normalizeHeader(key))) return val
  }
  return ''
}

function getDurationLabel(startingDate, endingDate) {
  if (!startingDate || !endingDate) return '-'
  const start = new Date(startingDate)
  const end = new Date(endingDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return '-'

  const dayMs = 24 * 60 * 60 * 1000
  const days = Math.floor((end.getTime() - start.getTime()) / dayMs) + 1
  return `${days} day${days === 1 ? '' : 's'}`
}

function todayDateString() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function GoalMaster() {
  const mountedRef = useRef(true)
  const uploadInputRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [designationFilter, setDesignationFilter] = useState('All')
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [detailRows, setDetailRows] = useState([])
  const [detailQuarterFilter, setDetailQuarterFilter] = useState('All')
  const [detailSortOrder, setDetailSortOrder] = useState('latest')
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingEmployeeCode, setEditingEmployeeCode] = useState('')
  const [editingGoalId, setEditingGoalId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState({ type: '', text: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [formData, setFormData] = useState({
    employee_code: '',
    employee_name: '',
    reporting_manager: '',
    reporting_manager_id: '',
    designation: '',
    monthly_sheet_goal: '',
    quarter: '',
    starting_date: '',
    ending_date: '',
  })

  const resetForm = useCallback(() => {
    setFormData({
      employee_code: '',
      employee_name: '',
      reporting_manager: '',
      reporting_manager_id: '',
      designation: '',
      monthly_sheet_goal: '',
      quarter: '',
      starting_date: '',
      ending_date: '',
    })
    setFormError('')
    setFormSuccess('')
    setEditingEmployeeCode('')
    setEditingGoalId('')
  }, [])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError('')

      const [usersResult, goalsResult] = await Promise.all([
        cachedFetch(
          'goal_master_users_v1',
          async () => {
            const { data, error } = await supabase
              .from('users')
              .select('employee_id, full_name, reporting_manager')
              .not('employee_id', 'is', null)

            if (error) throw error
            return data || []
          },
          TTL.SHORT
        ),
        cachedFetch(
          'goal_master_table_rows_v1',
          async () => {
            const { data, error } = await supabase
              .from('goals_master')
              .select('id, employee_code, employee_name, reporting_manager, reporting_manager_id, designation, monthly_sheet_goal, quarter, starting_date, ending_date, updated_at')
              .order('ending_date', { ascending: true, nullsFirst: true })
              .order('updated_at', { ascending: false })

            if (error) throw error
            return data || []
          },
          TTL.SHORT
        ),
      ])

      if (!mountedRef.current) return

      const users = Array.isArray(usersResult?.data) ? usersResult.data : (Array.isArray(usersResult) ? usersResult : [])
      const goals = Array.isArray(goalsResult?.data) ? goalsResult.data : (Array.isArray(goalsResult) ? goalsResult : [])

      const nameByCode = new Map(users.map(user => [asText(user.employee_id).toLowerCase(), asText(user.full_name)]))

      const goalByCode = new Map()
      goals.forEach(goal => {
        const code = asText(goal.employee_code).toLowerCase()
        if (!code) return
        if (!goalByCode.has(code)) goalByCode.set(code, goal)
      })

      const merged = Array.from(goalByCode.values()).map(goal => {
        const code = asText(goal?.employee_code).toLowerCase()

        const managerCode = asText(goal?.reporting_manager_id)
        const managerNameFromCode = managerCode ? nameByCode.get(managerCode.toLowerCase()) : ''

        return {
          id: goal?.id || null,
          employee_code: asText(goal?.employee_code),
          employee_name: asText(goal?.employee_name),
          reporting_manager: asText(goal?.reporting_manager || managerNameFromCode),
          reporting_manager_id: managerCode,
          designation: asText(goal?.designation),
          monthly_sheet_goal: Number(goal?.monthly_sheet_goal || 0),
          quarter: asText(goal?.quarter),
          starting_date: goal?.starting_date || null,
          ending_date: goal?.ending_date || null,
          updated_at: goal?.updated_at || null,
          has_goal: true,
        }
      })

      merged.sort((a, b) => {
        return asText(a.employee_name).localeCompare(asText(b.employee_name))
      })

      setRows(merged)
    } catch (err) {
      console.error('Error loading Goal Master data:', err)
      if (mountedRef.current) setError(err.message || 'Failed to load Goal Master data')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    loadData()
    return () => {
      mountedRef.current = false
    }
  }, [loadData])

  const designationOptions = useMemo(() => {
    const values = Array.from(new Set(rows.map(r => asText(r.designation)).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b))
    return ['All', ...values]
  }, [rows])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()

    return rows.filter(row => {
      const matchesSearch = !query
        || asText(row.employee_code).toLowerCase().includes(query)
        || asText(row.employee_name).toLowerCase().includes(query)
        || asText(row.reporting_manager).toLowerCase().includes(query)
        || asText(row.reporting_manager_id).toLowerCase().includes(query)

      const matchesDesignation = designationFilter === 'All' || asText(row.designation) === designationFilter

      return matchesSearch && matchesDesignation
    })
  }, [rows, search, designationFilter])

  const handleFormChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleAddRecord = async (event) => {
    event.preventDefault()
    setFormError('')
    setFormSuccess('')

    const employeeCode = asText(formData.employee_code)
    const monthlyGoal = Number(formData.monthly_sheet_goal)
    const startingDate = asText(formData.starting_date)
    const endingDate = asText(formData.ending_date)

    if (!employeeCode) {
      setFormError('Employee Code is required.')
      return
    }

    if (!Number.isFinite(monthlyGoal) || monthlyGoal < 0) {
      setFormError('Monthly Sheet Goal must be a valid non-negative number.')
      return
    }

    if (startingDate && endingDate && startingDate > endingDate) {
      setFormError('Ending Date cannot be earlier than Starting Date.')
      return
    }

    try {
      setSaving(true)

      const payload = {
        employee_code: employeeCode,
        employee_name: asText(formData.employee_name) || null,
        reporting_manager: asText(formData.reporting_manager) || null,
        reporting_manager_id: asText(formData.reporting_manager_id) || null,
        designation: asText(formData.designation) || null,
        monthly_sheet_goal: monthlyGoal,
        quarter: asText(formData.quarter) || null,
        starting_date: startingDate || null,
        ending_date: endingDate || null,
      }

      if (editingEmployeeCode && editingGoalId) {
        const { error: updateError } = await supabase
          .from('goals_master')
          .update(payload)
          .eq('id', editingGoalId)
        if (updateError) throw updateError
      } else {
        const today = todayDateString()
        const { error: closeError } = await supabase
          .from('goals_master')
          .update({ ending_date: today })
          .eq('employee_code', employeeCode)
          .is('ending_date', null)
        if (closeError) throw closeError

        const { error: insertError } = await supabase
          .from('goals_master')
          .insert(payload)
        if (insertError) throw insertError
      }

      await cacheDelete('goal_master_table_rows_v1')
      await loadData()

      setFormSuccess(editingEmployeeCode ? 'Goal record updated successfully.' : 'New goal record added successfully and previous active record closed.')
      resetForm()
      setShowAddForm(false)
    } catch (err) {
      console.error('Error adding goal record:', err)
      if (String(err?.message || '').toLowerCase().includes('duplicate')) {
        setFormError('Could not save due to duplicate-key restriction. Please run the latest goals_master migration and try again.')
      } else {
        setFormError(err.message || 'Failed to add record.')
      }
    } finally {
      setSaving(false)
    }
  }

  const openCreateForm = () => {
    resetForm()
    setShowAddForm(true)
  }

  const openEditForm = (event, row) => {
    event.stopPropagation()
    setEditingEmployeeCode(asText(row.employee_code))
    setEditingGoalId(asText(row.id))
    setFormData({
      employee_code: asText(row.employee_code),
      employee_name: asText(row.employee_name),
      reporting_manager: asText(row.reporting_manager),
      reporting_manager_id: asText(row.reporting_manager_id),
      designation: asText(row.designation),
      monthly_sheet_goal: String(row.monthly_sheet_goal ?? ''),
      quarter: asText(row.quarter),
      starting_date: asText(row.starting_date),
      ending_date: asText(row.ending_date),
    })
    setFormError('')
    setFormSuccess('')
    setShowAddForm(true)
  }

  const handleDeleteRecord = async (event, row) => {
    event.stopPropagation()
    const employeeCode = asText(row.employee_code)
    if (!employeeCode) return

    const confirmed = window.confirm(`Delete goal record for ${employeeCode}?`)
    if (!confirmed) return

    try {
      setLoading(true)
      let deleteError = null
      const rowId = asText(row.id)

      if (rowId) {
        const response = await supabase
          .from('goals_master')
          .delete()
          .eq('id', rowId)
        deleteError = response.error
      } else {
        const response = await supabase
          .from('goals_master')
          .delete()
          .eq('employee_code', employeeCode)
        deleteError = response.error
      }

      if (deleteError) throw deleteError

      await cacheDelete('goal_master_table_rows_v1')
      await loadData()
    } catch (err) {
      console.error('Error deleting goal record:', err)
      setError(err.message || 'Failed to delete record')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadReport = () => {
    const exportRows = filteredRows.map(row => ({
      employee_code: row.employee_code || '',
      employee_name: row.employee_name || '',
      reporting_manager: row.reporting_manager || '',
      reporting_manager_id: row.reporting_manager_id || '',
      designation: row.designation || '',
      monthly_sheet_goal: Number(row.monthly_sheet_goal || 0),
      quarter: row.quarter || '',
      starting_date: row.starting_date || '',
      ending_date: row.ending_date || '',
    }))

    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Goal_Master')

    const stamp = new Date()
    const fileName = `Goal_Master_Report_${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}.xlsx`
    XLSX.writeFile(workbook, fileName)
  }

  const handleUploadReport = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadMessage({ type: '', text: '' })
    setUploading(true)

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
      const firstSheet = workbook.SheetNames[0]
      if (!firstSheet) throw new Error('No sheet found in uploaded file')

      const sheet = workbook.Sheets[firstSheet]
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' })

      const payloadRows = rawRows
        .map(row => {
          const employeeCode = asText(pickCell(row, ['employee_code', 'employee code', 'employeecode']))
          const monthlyGoalRaw = pickCell(row, ['monthly_sheet_goal', 'monthly sheet goal', 'monthlysheetgoal'])
          const monthlyGoal = Number(monthlyGoalRaw)

          if (!employeeCode) return null
          if (!Number.isFinite(monthlyGoal)) return null

          return {
            employee_code: employeeCode,
            employee_name: asText(pickCell(row, ['employee_name', 'employee name'])) || null,
            reporting_manager: asText(pickCell(row, ['reporting_manager', 'reporting manager'])) || null,
            reporting_manager_id: asText(pickCell(row, ['reporting_manager_id', 'reporting manager id', 'reporting manager code'])) || null,
            designation: asText(pickCell(row, ['designation'])) || null,
            monthly_sheet_goal: monthlyGoal,
            quarter: asText(pickCell(row, ['quarter', 'quator'])) || null,
            starting_date: parseDateInput(pickCell(row, ['starting_date', 'starting date'])) || null,
            ending_date: parseDateInput(pickCell(row, ['ending_date', 'ending date'])) || null,
          }
        })
        .filter(Boolean)

      if (payloadRows.length === 0) {
        throw new Error('No valid rows found. Ensure employee_code and monthly_sheet_goal are present.')
      }

      const today = todayDateString()
      let closedCount = 0

      for (const row of payloadRows) {
        const { data: activeRows, error: activeCheckError } = await supabase
          .from('goals_master')
          .select('id')
          .eq('employee_code', row.employee_code)
          .is('ending_date', null)

        if (activeCheckError) throw activeCheckError

        if ((activeRows || []).length > 0) {
          const { error: closeError } = await supabase
            .from('goals_master')
            .update({ ending_date: today })
            .eq('employee_code', row.employee_code)
            .is('ending_date', null)
          if (closeError) throw closeError
          closedCount += activeRows.length
        }

        const { error: insertError } = await supabase
          .from('goals_master')
          .insert(row)
        if (insertError) throw insertError
      }

      await cacheDelete('goal_master_table_rows_v1')
      await loadData()
      setUploadMessage({
        type: 'success',
        text: `Upload successful. Added ${payloadRows.length} records and closed ${closedCount} previous active record(s).`,
      })
    } catch (err) {
      console.error('Goal report upload failed:', err)
      setUploadMessage({ type: 'error', text: err.message || 'Failed to upload report.' })
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  const handleOpenDetails = async (row) => {
    const employeeCode = asText(row?.employee_code)
    if (!employeeCode) return

    setSelectedEmployee({
      employee_code: employeeCode,
      employee_name: asText(row?.employee_name),
    })
    setShowDetailModal(true)
    setDetailLoading(true)
    setDetailError('')
    setDetailRows([])
    setDetailQuarterFilter('All')
    setDetailSortOrder('latest')

    try {
      const { data, error } = await supabase
        .from('goals_master')
        .select('employee_code, employee_name, reporting_manager, reporting_manager_id, designation, monthly_sheet_goal, quarter, starting_date, ending_date, updated_at')
        .eq('employee_code', employeeCode)
        .order('starting_date', { ascending: false, nullsFirst: false })
        .order('updated_at', { ascending: false, nullsFirst: false })

      if (error) throw error

      const normalized = (data || []).map(item => ({
        ...item,
        duration_label: getDurationLabel(item.starting_date, item.ending_date),
      }))

      if (!mountedRef.current) return
      setDetailRows(normalized)
    } catch (err) {
      console.error('Error loading goal details:', err)
      if (mountedRef.current) setDetailError(err.message || 'Failed to load goal details')
    } finally {
      if (mountedRef.current) setDetailLoading(false)
    }
  }

  const detailQuarterOptions = useMemo(() => {
    const values = Array.from(new Set(detailRows.map(item => asText(item.quarter)).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b))
    return ['All', ...values]
  }, [detailRows])

  const visibleDetailRows = useMemo(() => {
    const filtered = detailRows.filter(item =>
      detailQuarterFilter === 'All' || asText(item.quarter) === detailQuarterFilter
    )

    const sorted = [...filtered].sort((a, b) => {
      const ta = new Date(a.starting_date || a.updated_at || 0).getTime()
      const tb = new Date(b.starting_date || b.updated_at || 0).getTime()
      return detailSortOrder === 'latest' ? tb - ta : ta - tb
    })

    return sorted
  }, [detailRows, detailQuarterFilter, detailSortOrder])

  const detailStats = useMemo(() => {
    const totalRecords = visibleDetailRows.length
    const totalGoal = visibleDetailRows.reduce((sum, item) => sum + Number(item.monthly_sheet_goal || 0), 0)
    const avgGoal = totalRecords > 0 ? Math.round(totalGoal / totalRecords) : 0
    const withDuration = visibleDetailRows.filter(item => item.duration_label && item.duration_label !== '-').length

    return { totalRecords, totalGoal, avgGoal, withDuration }
  }, [visibleDetailRows])

  return (
    <main className="gm-main">
      <section className="gm-header">
        <div>
          <h2>Goal Master</h2>
          <p>All users and their mapped goals from goals_master</p>
        </div>
        <div className="gm-header-actions">
          <button
            className="gm-add"
            onClick={openCreateForm}
          >
            <i className="fa-solid fa-plus"></i>
            Add New Record
          </button>
          <button
            type="button"
            className="gm-action-header-btn"
            onClick={() => uploadInputRef.current?.click()}
            disabled={uploading}
          >
            <i className={`fa-solid ${uploading ? 'fa-spinner fa-spin' : 'fa-file-arrow-up'}`}></i>
            {uploading ? 'Uploading...' : 'Upload Report'}
          </button>
          <button
            type="button"
            className="gm-action-header-btn"
            onClick={handleDownloadReport}
            disabled={loading || filteredRows.length === 0}
          >
            <i className="fa-solid fa-file-arrow-down"></i>
            Download Report
          </button>
          <button className="gm-refresh" onClick={loadData} disabled={loading}>
            <i className={`fa-solid fa-rotate-right ${loading ? 'fa-spin' : ''}`}></i>
            Refresh
          </button>
          <input
            ref={uploadInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="gm-upload-input"
            onChange={handleUploadReport}
          />
        </div>
      </section>

      {uploadMessage.text && (
        <div className={`gm-upload-message ${uploadMessage.type === 'error' ? 'gm-upload-error' : 'gm-upload-success'}`}>
          {uploadMessage.text}
        </div>
      )}

      <section className="gm-filters">
        <div className="gm-search">
          <i className="fa-solid fa-search"></i>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by employee, manager, or code"
          />
        </div>

        <select
          value={designationFilter}
          onChange={(event) => setDesignationFilter(event.target.value)}
          className="gm-quarter"
        >
          {designationOptions.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </section>

      <section className="gm-table-wrap">
        {loading ? (
          <div className="gm-state"><i className="fa-solid fa-spinner fa-spin"></i> Loading Goal Master data...</div>
        ) : error ? (
          <div className="gm-state gm-error">{error}</div>
        ) : filteredRows.length === 0 ? (
          <div className="gm-state">No rows found.</div>
        ) : (
          <table className="gm-table">
            <thead>
              <tr>
                <th>Employee Code</th>
                <th>Employee Name</th>
                <th>Reporting Manager</th>
                <th>Reporting Manager ID</th>
                <th>Designation</th>
                <th>Monthly Sheet Goal</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr
                  key={row.employee_code || `${row.employee_name}-${row.reporting_manager_id}`}
                  className="gm-row-clickable"
                  onClick={() => handleOpenDetails(row)}
                  title="Click to view goal details"
                >
                  <td>{row.employee_code || '-'}</td>
                  <td>{row.employee_name || '-'}</td>
                  <td>{row.reporting_manager || '-'}</td>
                  <td>{row.reporting_manager_id || '-'}</td>
                  <td>{row.designation || '-'}</td>
                  <td>{Number(row.monthly_sheet_goal || 0).toLocaleString()}</td>
                  <td>
                    <div className="gm-row-actions">
                      <button type="button" className="gm-action-btn gm-action-edit" onClick={(event) => openEditForm(event, row)}>
                        <i className="fa-solid fa-pen"></i>
                        Edit
                      </button>
                      <button type="button" className="gm-action-btn gm-action-delete" onClick={(event) => handleDeleteRecord(event, row)}>
                        <i className="fa-solid fa-trash"></i>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {showAddForm && (
        <div className="gm-modal-backdrop" onClick={() => setShowAddForm(false)}>
          <section className="gm-modal" onClick={(event) => event.stopPropagation()}>
            <div className="gm-modal-header">
              <h3>{editingEmployeeCode ? 'Edit Goal Record' : 'Add Goal Record'}</h3>
              <button
                type="button"
                className="gm-modal-close"
                onClick={() => {
                  setShowAddForm(false)
                  resetForm()
                }}
                aria-label="Close"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form className="gm-add-form" onSubmit={handleAddRecord}>
              <div className="gm-field">
                <label>Employee Code *</label>
                <input
                  value={formData.employee_code}
                  onChange={(event) => handleFormChange('employee_code', event.target.value)}
                  placeholder="e.g. D10234"
                  disabled={Boolean(editingEmployeeCode)}
                  required
                />
              </div>

              <div className="gm-field">
                <label>Employee Name</label>
                <input
                  value={formData.employee_name}
                  onChange={(event) => handleFormChange('employee_name', event.target.value)}
                  placeholder="Employee full name"
                />
              </div>

              <div className="gm-field">
                <label>Reporting Manager</label>
                <input
                  value={formData.reporting_manager}
                  onChange={(event) => handleFormChange('reporting_manager', event.target.value)}
                  placeholder="Manager name"
                />
              </div>

              <div className="gm-field">
                <label>Reporting Manager ID</label>
                <input
                  value={formData.reporting_manager_id}
                  onChange={(event) => handleFormChange('reporting_manager_id', event.target.value)}
                  placeholder="e.g. S10008"
                />
              </div>

              <div className="gm-field">
                <label>Designation</label>
                <input
                  value={formData.designation}
                  onChange={(event) => handleFormChange('designation', event.target.value)}
                  placeholder="ASM / DGO"
                />
              </div>

              <div className="gm-field">
                <label>Monthly Sheet Goal *</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.monthly_sheet_goal}
                  onChange={(event) => handleFormChange('monthly_sheet_goal', event.target.value)}
                  placeholder="e.g. 500"
                  required
                />
              </div>

              <div className="gm-field">
                <label>Quarter</label>
                <input
                  value={formData.quarter}
                  onChange={(event) => handleFormChange('quarter', event.target.value)}
                  placeholder="Q1 / Q2 / Q3 / Q4"
                />
              </div>

              <div className="gm-field">
                <label>Starting Date</label>
                <input
                  type="date"
                  value={formData.starting_date}
                  onChange={(event) => handleFormChange('starting_date', event.target.value)}
                />
              </div>

              <div className="gm-field">
                <label>Ending Date</label>
                <input
                  type="date"
                  value={formData.ending_date}
                  onChange={(event) => handleFormChange('ending_date', event.target.value)}
                />
              </div>

              <div className="gm-form-actions">
                <button type="button" className="gm-btn-secondary" onClick={resetForm} disabled={saving}>
                  Reset
                </button>
                <button type="button" className="gm-btn-secondary" onClick={() => {
                  setShowAddForm(false)
                  resetForm()
                }} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="gm-btn-primary" disabled={saving}>
                  <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`}></i>
                  {saving ? 'Saving...' : (editingEmployeeCode ? 'Update Record' : 'Save Record')}
                </button>
              </div>

              {formError && <div className="gm-form-message gm-form-error">{formError}</div>}
              {formSuccess && <div className="gm-form-message gm-form-success">{formSuccess}</div>}
            </form>
          </section>
        </div>
      )}

      {showDetailModal && (
        <div className="gm-drawer-backdrop" onClick={() => setShowDetailModal(false)}>
          <aside className="gm-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="gm-drawer-header">
              <h3>Goal Details</h3>
              <button
                type="button"
                className="gm-modal-close"
                onClick={() => setShowDetailModal(false)}
                aria-label="Close"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <p className="gm-drawer-subtitle">
              {selectedEmployee?.employee_name || '-'} ({selectedEmployee?.employee_code || '-'})
            </p>

            {detailLoading ? (
              <div className="gm-state"><i className="fa-solid fa-spinner fa-spin"></i> Loading details...</div>
            ) : detailError ? (
              <div className="gm-state gm-error">{detailError}</div>
            ) : detailRows.length === 0 ? (
              <div className="gm-state">No goal records found for this employee.</div>
            ) : (
              <>
                <div className="gm-detail-toolbar">
                  <div className="gm-stat-chips">
                    <span className="gm-chip"><strong>{detailStats.totalRecords}</strong> Records</span>
                    <span className="gm-chip"><strong>{detailStats.totalGoal.toLocaleString()}</strong> Total Goal</span>
                    <span className="gm-chip"><strong>{detailStats.avgGoal.toLocaleString()}</strong> Avg Goal</span>
                    <span className="gm-chip"><strong>{detailStats.withDuration}</strong> With Duration</span>
                  </div>
                  <div className="gm-detail-controls">
                    <select
                      value={detailQuarterFilter}
                      onChange={(event) => setDetailQuarterFilter(event.target.value)}
                      className="gm-quarter"
                    >
                      {detailQuarterOptions.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="gm-btn-secondary"
                      onClick={() => setDetailSortOrder(prev => (prev === 'latest' ? 'oldest' : 'latest'))}
                    >
                      <i className="fa-solid fa-arrow-up-wide-short"></i>
                      {detailSortOrder === 'latest' ? 'Latest First' : 'Oldest First'}
                    </button>
                  </div>
                </div>

                <div className="gm-detail-table-wrap">
                <table className="gm-table gm-detail-table">
                  <thead>
                    <tr>
                      <th>Quarter</th>
                      <th>Starting Date</th>
                      <th>Ending Date</th>
                      <th>Duration</th>
                      <th>Monthly Sheet Goal</th>
                      <th>Designation</th>
                      <th>Reporting Manager</th>
                      <th>Reporting Manager ID</th>
                      <th>Updated At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDetailRows.map((item, index) => (
                      <tr key={`${item.employee_code || 'emp'}-${item.updated_at || index}-${index}`}>
                        <td>{asText(item.quarter) || '-'}</td>
                        <td>{formatDate(item.starting_date)}</td>
                        <td>{formatDate(item.ending_date)}</td>
                        <td>{item.duration_label}</td>
                        <td>{Number(item.monthly_sheet_goal || 0).toLocaleString()}</td>
                        <td>{asText(item.designation) || '-'}</td>
                        <td>{asText(item.reporting_manager) || '-'}</td>
                        <td>{asText(item.reporting_manager_id) || '-'}</td>
                        <td>{formatDate(item.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </main>
  )
}

export default GoalMaster
