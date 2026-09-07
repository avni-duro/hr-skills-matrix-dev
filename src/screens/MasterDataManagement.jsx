import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useNotification } from '../contexts/NotificationContext'
import './MasterDataManagement.css'

const MASTER_CONFIGS = [
  {
    key: 'regions',
    title: 'Regions',
    table: 'regions',
    idField: 'id',
    nameField: 'region_name',
    nameLabel: 'Region Name',
  },
  {
    key: 'branches',
    title: 'Branches',
    table: 'branches',
    idField: 'id',
    nameField: 'branch_name',
    nameLabel: 'Branch Name',
    parentField: 'region_id',
    parentLabel: 'Region',
    parentTable: 'regions',
    parentNameField: 'region_name',
  },
  {
    key: 'sub_branches',
    title: 'Sub Branches',
    table: 'sub_branches',
    idField: 'id',
    nameField: 'sub_branch_name',
    nameLabel: 'Sub Branch Name',
    parentField: 'branch_id',
    parentLabel: 'Branch',
    parentTable: 'branches',
    parentNameField: 'branch_name',
  },
  {
    key: 'departments',
    title: 'Departments',
    table: 'departments',
    idField: 'id',
    nameField: 'department_name',
    nameLabel: 'Department Name',
  },
  {
    key: 'sub_departments',
    title: 'Sub Departments',
    table: 'sub_departments',
    idField: 'id',
    nameField: 'sub_department_name',
    nameLabel: 'Sub Department Name',
    parentField: 'department_id',
    parentLabel: 'Department',
    parentTable: 'departments',
    parentNameField: 'department_name',
  },
  {
    key: 'designations',
    title: 'Designations',
    table: 'designations',
    idField: 'id',
    nameField: 'designation_name',
    nameLabel: 'Designation Name',
  },
]

const EMPTY_FORM = {
  id: null,
  name: '',
  parentId: '',
}

export default function MasterDataManagement() {
  const { showNotification } = useNotification()
  const [activeKey, setActiveKey] = useState(MASTER_CONFIGS[0].key)
  const [rows, setRows] = useState([])
  const [parentOptions, setParentOptions] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [formData, setFormData] = useState(EMPTY_FORM)

  const activeConfig = useMemo(
    () => MASTER_CONFIGS.find((item) => item.key === activeKey) || MASTER_CONFIGS[0],
    [activeKey]
  )

  const loadRows = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const cfg = activeConfig

      let parentMap = new Map()
      let parentData = []

      if (cfg.parentTable) {
        const { data: parentRows, error: parentErr } = await supabase
          .from(cfg.parentTable)
          .select(`id, ${cfg.parentNameField}`)
          .order(cfg.parentNameField, { ascending: true })

        if (parentErr) throw parentErr

        parentData = Array.isArray(parentRows) ? parentRows : []
        parentMap = new Map(
          parentData.map((item) => [String(item.id), item[cfg.parentNameField] || `ID ${item.id}`])
        )
      }

      const { data, error: fetchErr } = await supabase
        .from(cfg.table)
        .select('*')
        .order(cfg.idField, { ascending: true })

      if (fetchErr) throw fetchErr

      const mappedRows = (Array.isArray(data) ? data : []).map((row) => ({
        id: row[cfg.idField],
        name: row[cfg.nameField],
        parentId: cfg.parentField ? row[cfg.parentField] : null,
        parentName:
          cfg.parentField && row[cfg.parentField] !== null && row[cfg.parentField] !== undefined
            ? parentMap.get(String(row[cfg.parentField])) || `ID ${row[cfg.parentField]}`
            : '-',
      }))

      setRows(mappedRows)
      setParentOptions(parentData)
    } catch (err) {
      setError(err.message || 'Failed to load data')
      setRows([])
      setParentOptions([])
    } finally {
      setLoading(false)
    }
  }, [activeConfig])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return rows

    return rows.filter((row) => {
      return (
        (row.name || '').toLowerCase().includes(query) ||
        String(row.id || '').toLowerCase().includes(query) ||
        (row.parentName || '').toLowerCase().includes(query)
      )
    })
  }, [rows, search])

  const openCreateModal = () => {
    setFormData(EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  const openEditModal = (row) => {
    setFormData({
      id: row.id,
      name: row.name || '',
      parentId: row.parentId ? String(row.parentId) : '',
    })
    setFormError('')
    setModalOpen(true)
  }

  const closeModal = () => {
    if (submitting) return
    setModalOpen(false)
    setFormError('')
    setFormData(EMPTY_FORM)
  }

  const onChangeForm = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const onSubmit = async (e) => {
    e.preventDefault()

    const trimmedName = (formData.name || '').trim()
    if (!trimmedName) {
      setFormError(`${activeConfig.nameLabel} is required`)
      return
    }

    if (activeConfig.parentField && !formData.parentId) {
      setFormError(`${activeConfig.parentLabel} is required`)
      return
    }

    setSubmitting(true)
    setFormError('')

    try {
      const payload = {
        [activeConfig.nameField]: trimmedName,
      }

      if (activeConfig.parentField) {
        payload[activeConfig.parentField] = Number(formData.parentId)
      }

      if (formData.id) {
        const { error: updateErr } = await supabase
          .from(activeConfig.table)
          .update(payload)
          .eq(activeConfig.idField, formData.id)

        if (updateErr) throw updateErr
        showNotification(`${activeConfig.title.slice(0, -1)} updated successfully`, 'success')
      } else {
        const { error: insertErr } = await supabase
          .from(activeConfig.table)
          .insert([payload])

        if (insertErr) throw insertErr
        showNotification(`${activeConfig.title.slice(0, -1)} created successfully`, 'success')
      }

      closeModal()
      await loadRows()
    } catch (err) {
      setFormError(err.message || 'Failed to save record')
    } finally {
      setSubmitting(false)
    }
  }

  const onDelete = async (row) => {
    const ok = window.confirm(`Delete ${row.name}? This action cannot be undone.`)
    if (!ok) return

    try {
      const { error: deleteErr } = await supabase
        .from(activeConfig.table)
        .delete()
        .eq(activeConfig.idField, row.id)

      if (deleteErr) throw deleteErr

      showNotification(`${activeConfig.title.slice(0, -1)} deleted successfully`, 'success')
      await loadRows()
    } catch (err) {
      showNotification(err.message || 'Delete failed', 'error')
    }
  }

  return (
    <main className="master-main">
      <div className="master-header">
        <div>
          <h1>Master Data Management</h1>
          <p>Create, edit, and delete master data records</p>
        </div>
      </div>

      <section className="master-tabs">
        {MASTER_CONFIGS.map((cfg) => (
          <button
            key={cfg.key}
            type="button"
            onClick={() => {
              setActiveKey(cfg.key)
              setSearch('')
            }}
            className={`master-tab ${activeKey === cfg.key ? 'active' : ''}`}
          >
            {cfg.title}
          </button>
        ))}
      </section>

      <section className="master-card">
        <div className="master-toolbar">
          <input
            type="search"
            placeholder={`Search ${activeConfig.title.toLowerCase()}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <button type="button" className="master-btn-primary" onClick={openCreateModal}>
            <i className="fa-solid fa-plus"></i>
            Add {activeConfig.title.slice(0, -1)}
          </button>
        </div>

        {loading ? (
          <div className="master-state"><i className="fa-solid fa-spinner fa-spin"></i> Loading {activeConfig.title}...</div>
        ) : error ? (
          <div className="master-error">{error}</div>
        ) : filteredRows.length === 0 ? (
          <div className="master-state">No records found.</div>
        ) : (
          <div className="master-table-wrap">
            <table className="master-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{activeConfig.nameLabel}</th>
                  {activeConfig.parentField && <th>{activeConfig.parentLabel}</th>}
                  <th className="actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.name}</td>
                    {activeConfig.parentField && <td>{row.parentName}</td>}
                    <td className="actions">
                      <button type="button" className="master-icon-btn" onClick={() => openEditModal(row)}>
                        <i className="fa-solid fa-pen"></i>
                      </button>
                      <button type="button" className="master-icon-btn delete" onClick={() => onDelete(row)}>
                        <i className="fa-solid fa-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalOpen && (
        <div className="master-modal-backdrop" onClick={closeModal}>
          <div className="master-modal" onClick={(e) => e.stopPropagation()}>
            <div className="master-modal-header">
              <h3>{formData.id ? 'Edit' : 'Add'} {activeConfig.title.slice(0, -1)}</h3>
              <button type="button" className="master-close-btn" onClick={closeModal}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={onSubmit} className="master-form">
              <div className="master-form-group">
                <label htmlFor="name">{activeConfig.nameLabel}</label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={onChangeForm}
                  placeholder={`Enter ${activeConfig.nameLabel.toLowerCase()}`}
                  required
                />
              </div>

              {activeConfig.parentField && (
                <div className="master-form-group">
                  <label htmlFor="parentId">{activeConfig.parentLabel}</label>
                  <select
                    id="parentId"
                    name="parentId"
                    value={formData.parentId}
                    onChange={onChangeForm}
                    required
                  >
                    <option value="">Select {activeConfig.parentLabel}</option>
                    {parentOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item[activeConfig.parentNameField]}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {formError && <div className="master-error">{formError}</div>}

              <div className="master-form-actions">
                <button type="button" className="master-btn-secondary" onClick={closeModal} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="master-btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
