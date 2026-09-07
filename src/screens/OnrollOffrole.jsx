import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import './OnrollOffrole.css'

const TABLES = [
  { id: 'influencer_claim_details', label: 'Influencer Claim Details', column: 'mapped_isr_code' },
  { id: 'influencer_enrollment_details', label: 'Influencer Enrollment Details', column: 'enrolled_by_dso_code' },
  { id: 'influencer_visit_reports', label: 'Influencer Visit Reports', column: 'emp_login' },
  { id: 'lead_details_reports', label: 'Lead Details Reports', column: 'lead_created_by' },
  { id: 'lead_task_reports', label: 'Lead Task Reports', column: 'task_created_by_dso_code' },
  { id: 'm_enrollment_details', label: 'M Enrollment Details', column: 'mapped_isr' },
  { id: 'tier_upgrade_performance_report', label: 'Tier Upgrade Performance Report', column: 'mapped_isr' },
  { id: 'telecalling_influencer_wartask', label: 'Telecalling Influencer Wartask', column: 'mapped_isr_code' },
  { id: 'monthly_attendance_report', label: 'Monthly Attendance Report', column: 'employee_code' },
]

const EMPTY_FORM = {
  oldEmployeeId: '',
  newEmployeeId: '',
  dateOfChange: '',
  selectedTables: TABLES.reduce((acc, t) => ({ ...acc, [t.id]: true }), {}),
}

function formatDate(dateText) {
  if (!dateText) return '-'
  const d = new Date(dateText)
  if (Number.isNaN(d.getTime())) return dateText
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function OnrollOffrole() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [successSummary, setSuccessSummary] = useState(null)

  const loadRows = useCallback(async () => {
    try {
      setLoading(true)
      setError('')

      const { data, error } = await supabase
        .from('employee_id_change_log')
        .select('id, employee_name, old_employee_id, new_employee_id, date_of_change, created_at')
        .order('date_of_change', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) throw error
      setRows(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'Failed to load Onroll-Offrole report')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  const reportRows = useMemo(() => rows.map((row) => ({
    id: row.id,
    employeeName: row.employee_name || '-',
    oldEmployeeId: row.old_employee_id || '-',
    newEmployeeId: row.new_employee_id || '-',
    dateOfChange: row.date_of_change || '',
  })), [rows])

  const openModal = () => {
    setFormData(EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  const closeModal = () => {
    if (submitting) return
    setModalOpen(false)
    setFormError('')
    setFormData(EMPTY_FORM)
  }

  const onInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const onTableToggle = (tableId) => {
    setFormData(prev => ({
      ...prev,
      selectedTables: {
        ...prev.selectedTables,
        [tableId]: !prev.selectedTables[tableId],
      }
    }))
  }

  const toggleAllTables = (checked) => {
    setFormData(prev => ({
      ...prev,
      selectedTables: TABLES.reduce((acc, t) => ({ ...acc, [t.id]: checked }), {}),
    }))
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setFormError('')

    const oldEmployeeId = formData.oldEmployeeId.trim()
    const newEmployeeId = formData.newEmployeeId.trim()
    const dateOfChange = formData.dateOfChange

    if (!oldEmployeeId || !newEmployeeId || !dateOfChange) {
      setFormError('All fields are required')
      return
    }

    if (oldEmployeeId.toLowerCase() === newEmployeeId.toLowerCase()) {
      setFormError('Old Employee ID and New Employee ID cannot be the same')
      return
    }

    const selectedTablesList = Object.entries(formData.selectedTables)
      .filter(([_, selected]) => selected)
      .map(([tableId, _]) => tableId)

    if (selectedTablesList.length === 0) {
      setFormError('Please select at least one table to update')
      return
    }

    try {
      setSubmitting(true)

      const { data: userRow, error: userError } = await supabase
        .from('users')
        .select('full_name')
        .eq('employee_id', oldEmployeeId)
        .maybeSingle()

      if (userError) throw userError

      const { data: rpcData, error: rpcError } = await supabase.rpc('propagate_employee_id_change', {
        p_old_employee_id: oldEmployeeId,
        p_new_employee_id: newEmployeeId,
        p_date_of_change: dateOfChange,
        p_employee_name: userRow?.full_name || null,
        p_selected_tables: selectedTablesList,
      })

      if (rpcError) throw rpcError

      setSuccessSummary(rpcData)
      setFormData(EMPTY_FORM)
      await loadRows()
    } catch (err) {
      setFormError(err.message || 'Failed to update employee ID')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="oor-main">
      <div className="oor-header">
        <div>
          <h1>Onroll-Offrole</h1>
          <p>Employee ID change report</p>
        </div>
        <button className="oor-btn-primary" onClick={openModal}>
          <i className="fa-solid fa-pen-to-square"></i>
          Update Employee ID
        </button>
      </div>

      <section className="oor-card">
        {loading ? (
          <div className="oor-state"><i className="fa-solid fa-spinner fa-spin"></i> Loading report...</div>
        ) : error ? (
          <div className="oor-error">{error}</div>
        ) : reportRows.length === 0 ? (
          <div className="oor-state">No records found.</div>
        ) : (
          <div className="oor-table-wrap">
            <table className="oor-table">
              <thead>
                <tr>
                  <th>Employee Name</th>
                  <th>Old Employee ID</th>
                  <th>New Employee ID</th>
                  <th>Date Of Change</th>
                </tr>
              </thead>
              <tbody>
                {reportRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.employeeName}</td>
                    <td>{row.oldEmployeeId}</td>
                    <td>{row.newEmployeeId}</td>
                    <td>{formatDate(row.dateOfChange)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalOpen && (
        <div className="oor-modal-backdrop" onClick={closeModal}>
          <div className="oor-modal" onClick={(e) => e.stopPropagation()}>
            <div className="oor-modal-header">
              <h3>Update Employee ID</h3>
              <button className="oor-close-btn" onClick={closeModal}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form className="oor-form" onSubmit={onSubmit}>
              <div className="oor-form-group">
                <label htmlFor="oldEmployeeId">Old Employee ID</label>
                <input
                  id="oldEmployeeId"
                  name="oldEmployeeId"
                  type="text"
                  value={formData.oldEmployeeId}
                  onChange={onInputChange}
                  placeholder="Enter old employee ID"
                  required
                />
              </div>

              <div className="oor-form-group">
                <label htmlFor="newEmployeeId">New Employee ID</label>
                <input
                  id="newEmployeeId"
                  name="newEmployeeId"
                  type="text"
                  value={formData.newEmployeeId}
                  onChange={onInputChange}
                  placeholder="Enter new employee ID"
                  required
                />
              </div>

              <div className="oor-form-group">
                <label htmlFor="dateOfChange">Date of Change</label>
                <input
                  id="dateOfChange"
                  name="dateOfChange"
                  type="date"
                  value={formData.dateOfChange}
                  onChange={onInputChange}
                  required
                />
              </div>

              <div className="oor-form-group">
                <label>Tables to Update</label>
                <div className="oor-tables-section">
                  <div className="oor-table-header">
                    <label className="oor-checkbox-label">
                      <input
                        type="checkbox"
                        checked={TABLES.every(t => formData.selectedTables[t.id])}
                        onChange={(e) => toggleAllTables(e.target.checked)}
                      />
                      <span><strong>Select All</strong></span>
                    </label>
                  </div>
                  <div className="oor-tables-list">
                    {TABLES.map(table => (
                      <label key={table.id} className="oor-checkbox-label">
                        <input
                          type="checkbox"
                          checked={formData.selectedTables[table.id] || false}
                          onChange={() => onTableToggle(table.id)}
                        />
                        <span>{table.label}</span>
                        <span className="oor-column-name">({table.column})</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {formError && <div className="oor-error">{formError}</div>}

              <div className="oor-form-actions">
                <button type="button" className="oor-btn-secondary" onClick={closeModal} disabled={submitting}>Cancel</button>
                <button type="submit" className="oor-btn-primary" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {successSummary && (
        <div className="oor-modal-backdrop" onClick={() => setSuccessSummary(null)}>
          <div className="oor-modal" onClick={(e) => e.stopPropagation()}>
            <div className="oor-modal-header">
              <h3>Employee ID Updated Successfully</h3>
              <button className="oor-close-btn" onClick={() => setSuccessSummary(null)}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="oor-success-content">
              <div className="oor-success-info">
                <p><strong>Old Employee ID:</strong> {successSummary.old_employee_id}</p>
                <p><strong>New Employee ID:</strong> {successSummary.new_employee_id}</p>
                <p><strong>Date of Change:</strong> {formatDate(successSummary.date_of_change)}</p>
              </div>

              <h4>Tables Updated:</h4>
              <table className="oor-updated-tables">
                <thead>
                  <tr>
                    <th>Table Name</th>
                    <th>Column</th>
                    <th>Records Updated</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>influencer_claim_details</td>
                    <td>mapped_isr_code</td>
                    <td>{successSummary.updated_counts?.influencer_claim_details_mapped_isr_code ?? 0}</td>
                  </tr>
                  <tr>
                    <td>influencer_enrollment_details</td>
                    <td>enrolled_by_dso_code</td>
                    <td>{successSummary.updated_counts?.influencer_enrollment_details_enrolled_by_dso_code ?? 0}</td>
                  </tr>
                  <tr>
                    <td>influencer_visit_reports</td>
                    <td>emp_login</td>
                    <td>{successSummary.updated_counts?.influencer_visit_reports_emp_login ?? 0}</td>
                  </tr>
                  <tr>
                    <td>lead_details_reports</td>
                    <td>lead_created_by</td>
                    <td>{successSummary.updated_counts?.lead_details_reports_lead_created_by ?? 0}</td>
                  </tr>
                  <tr>
                    <td>lead_task_reports</td>
                    <td>task_created_by_dso_code</td>
                    <td>{successSummary.updated_counts?.lead_task_reports_task_created_by_dso_code ?? 0}</td>
                  </tr>
                  <tr>
                    <td>m_enrollment_details</td>
                    <td>mapped_isr</td>
                    <td>{successSummary.updated_counts?.m_enrollment_details_mapped_isr ?? 0}</td>
                  </tr>
                  <tr>
                    <td>tier_upgrade_performance_report</td>
                    <td>mapped_isr</td>
                    <td>{successSummary.updated_counts?.tier_upgrade_performance_report_mapped_isr ?? 0}</td>
                  </tr>
                  <tr>
                    <td>telecalling_influencer_wartask</td>
                    <td>mapped_isr_code</td>
                    <td>{successSummary.updated_counts?.telecalling_influencer_wartask_mapped_isr_code ?? 0}</td>
                  </tr>
                  <tr>
                    <td>monthly_attendance_report</td>
                    <td>employee_code</td>
                    <td>{successSummary.updated_counts?.monthly_attendance_report_employee_code ?? 0}</td>
                  </tr>
                  <tr>
                    <td>employee_id_change_log</td>
                    <td>-</td>
                    <td>{successSummary.updated_counts.employee_id_change_log_inserted}</td>
                  </tr>
                </tbody>
              </table>

              <div className="oor-form-actions">
                <button type="button" className="oor-btn-primary" onClick={() => setSuccessSummary(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
