import { useState, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabaseClient'
import { useNotification } from '../contexts/NotificationContext'
import { useAuth } from '../contexts/AuthContext'
import './SalesDataScreen.css'

// ── Helpers ─────────────────────────────────────────────────
function trimRow(row) {
  const result = {}
  for (const key in row) {
    const trimmedKey = typeof key === 'string' ? key.trim() : key
    const v = row[key]
    result[trimmedKey] = typeof v === 'string' ? v.trim() : v
  }
  return result
}

export function str(v) {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

export function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

export function excelDate(v) {
  if (!v) return null
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    if (!d) return null
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(v).trim()
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

const BATCH_SIZE = 500
const PAGE_SIZE = 1000

/**
 * Reusable Sales Data Screen.
 *
 * Props:
 * - title: string (page heading)
 * - description: string (subtitle)
 * - sheetType: string (key for excel_upload_sessions)
 * - table: string (Supabase table name)
 * - uniqueKey: string | null
 * - mapRow: (row) => object
 * - template: { sheetName, fileName, rows }
 * - columns: [{ key, label, render? }]
 * - color: string (accent color)
 * - icon: string (FontAwesome class)
 */
export default function SalesDataScreen({
  title, description, sheetType, table, uniqueKey,
  mapRow, template, columns, color = '#7C3AED', icon = 'fa-solid fa-file-excel',
}) {
  const { user } = useAuth()
  const fileInputRef = useRef(null)
  const { showNotification } = useNotification()

  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessLoading] = useState(false)
  const [tableData, setTableData] = useState([])
  const [tableLoading, setTableLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [uploadOpen, setUploadOpen] = useState(false)
  const rowsPerPage = 50

  useEffect(() => {
    fetchSessions()
    fetchTableData()
  }, [])

  const fetchSessions = async () => {
    setSessLoading(true)
    const { data } = await supabase
      .from('excel_upload_sessions')
      .select('*')
      .eq('sheet_type', sheetType)
      .order('upload_date', { ascending: false })
      .limit(10)
    if (data) setSessions(data)
    setSessLoading(false)
  }

  const fetchTableData = async () => {
    setTableLoading(true)
    const allData = []
    let from = 0
    let hasMore = true
    while (hasMore) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
      if (error || !data || data.length === 0) { hasMore = false; break }
      allData.push(...data)
      from += PAGE_SIZE
      if (data.length < PAGE_SIZE) hasMore = false
    }
    setTableData(allData)
    setTableLoading(false)
  }

  const downloadFormat = () => {
    if (!template) return
    const ws = XLSX.utils.json_to_sheet(template.rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, template.sheetName)
    XLSX.writeFile(wb, template.fileName)
  }

  const handleFileChange = (e) => {
    const f = e.target.files[0]
    if (!f) return
    setFile(f)
    setResult(null)
  }

  const handleUpload = async () => {
    if (!file) return alert('Please choose an Excel file.')
      if (!file) return showNotification('Please choose an Excel file.', 'warning')
    setUploading(true)
    setProgress(0)
    setResult(null)

    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval: null })

      if (rawRows.length === 0) {
        setResult({ inserted: 0, skipped: 0, errors: ['File is empty or has no data rows.'] })
        setUploading(false)
        return
      }

      const { data: sessionData, error: sessionError } = await supabase
        .from('excel_upload_sessions')
        .insert({
          sheet_type: sheetType,
          file_name: file.name,
          uploaded_by: user?.id || null,
          rows_inserted: 0,
          rows_skipped: 0,
          status: 'partial',
        })
        .select()
        .single()
      if (sessionError) throw sessionError

      const sessionId = sessionData.id
      let totalInserted = 0
      let totalSkipped = 0
      const errors = []

      const allMapped = rawRows
        .map(r => mapRow(trimRow(r)))
        .filter(Boolean)
        .map(row => ({
          ...row,
          upload_session_id: sessionId,
        }))

      const mappedRows = uniqueKey
        ? Object.values(allMapped.reduce((acc, row) => { acc[row[uniqueKey]] = row; return acc }, {}))
        : allMapped

      if (mappedRows.length === 0) {
        await supabase
          .from('excel_upload_sessions')
          .update({
            rows_inserted: 0,
            rows_skipped: rawRows.length,
            status: 'failed',
            error_message: 'No valid rows found. Check column names match the expected format.',
          })
          .eq('id', sessionId)

        setResult({
          inserted: 0,
          skipped: rawRows.length,
          errors: ['No valid rows found. Check column names match the expected format.'],
        })
        setUploading(false)
        return
      }

      const batches = Math.ceil(mappedRows.length / BATCH_SIZE)
      for (let i = 0; i < batches; i++) {
        const batch = mappedRows.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
        let error
        if (uniqueKey) {
          ;({ error } = await supabase.from(table).upsert(batch, { onConflict: uniqueKey, ignoreDuplicates: false }))
        } else {
          ;({ error } = await supabase.from(table).insert(batch))
        }
        if (error) {
          errors.push(`Batch ${i + 1}: ${error.message}`)
          totalSkipped += batch.length
        } else {
          totalInserted += batch.length
        }
        setProgress(Math.round(((i + 1) / batches) * 100))
      }

      await supabase
        .from('excel_upload_sessions')
        .update({
          rows_inserted: totalInserted,
          rows_skipped: totalSkipped,
          status: errors.length === 0 ? 'success' : totalInserted > 0 ? 'partial' : 'failed',
          error_message: errors.length ? errors.slice(0, 3).join(' | ') : null,
        })
        .eq('id', sessionId)

      setResult({ inserted: totalInserted, skipped: totalSkipped, errors })
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await Promise.all([fetchSessions(), fetchTableData()])
    } catch (err) {
      console.error('Upload error:', err)
      setResult({ inserted: 0, skipped: 0, errors: [err.message] })
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteRow = async (id) => {
    if (!confirm('Delete this record?')) return
    await supabase.from(table).delete().eq('id', id)
    fetchTableData()
  }

  const formatDate = (d) => {
    if (!d) return '—'
    return new Date(d).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const statusColor = (s) => ({ success: '#10B981', partial: '#F59E0B', failed: '#EF4444' }[s] || '#6B7280')

  // Filter + paginate
  const filtered = tableData.filter(row => {
    if (!searchTerm) return true
    const q = searchTerm.toLowerCase()
    return columns.some(col => {
      const val = row[col.key]
      return val && String(val).toLowerCase().includes(q)
    })
  })
  const totalPages = Math.ceil(filtered.length / rowsPerPage)
  const pageData = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)

  const handleExportData = () => {
    if (filtered.length === 0) return
    const exportRows = filtered.map(row => {
      const obj = {}
      Object.keys(row).forEach(key => { obj[key] = row[key] ?? '' })
      return obj
    })
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Data')
    XLSX.writeFile(wb, `${sheetType}_data.xlsx`)
  }

  return (
    <main className="sds-main">
      {/* Header */}
      <section className="sds-header">
        <div>
          <h2><i className={icon} style={{ color, marginRight: '0.5rem' }}></i>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="sds-header-actions">
          <div className="sds-header-stats">
            <div className="sds-stat" style={{ borderColor: color }}>
              <span className="sds-stat-num" style={{ color }}>{tableData.length}</span>
              <span className="sds-stat-label">Total Records</span>
            </div>
            <div className="sds-stat" style={{ borderColor: '#10B981' }}>
              <span className="sds-stat-num" style={{ color: '#10B981' }}>{sessions.filter(s => s.status === 'success').length}</span>
              <span className="sds-stat-label">Successful Uploads</span>
            </div>
          </div>
          <button
            className="sds-btn-toggle-upload"
            style={{ borderColor: color, color }}
            onClick={() => setUploadOpen(!uploadOpen)}
          >
            <i className={`fa-solid ${uploadOpen ? 'fa-chevron-up' : 'fa-cloud-arrow-up'}`}></i>
            {uploadOpen ? 'Hide Upload' : 'Upload Data'}
          </button>
        </div>
      </section>

      {/* Collapsible Upload Section */}
      {uploadOpen && (
        <section className="sds-upload-bar">
          <div className="sds-upload-row">
            <div className="sds-card sds-upload-card">
              <h3><i className="fa-solid fa-upload"></i> Upload Excel File</h3>
              <div className="sds-upload-inline">
                <button type="button" className="sds-btn-download" onClick={downloadFormat}>
                  <i className="fa-solid fa-download"></i> Download Template
                </button>
                <div className="sds-file-zone" onClick={() => fileInputRef.current?.click()}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                  {file ? (
                    <div className="sds-file-selected">
                      <i className="fa-solid fa-file-excel"></i>
                      <span className="sds-file-name">{file.name}</span>
                      <span className="sds-file-size">{(file.size / 1024).toFixed(1)} KB</span>
                    </div>
                  ) : (
                    <div className="sds-file-placeholder">
                      <i className="fa-solid fa-cloud-arrow-up" style={{ color }}></i>
                      <span>Click to browse .xlsx / .xls</span>
                    </div>
                  )}
                </div>
                <button
                  className="sds-btn-upload"
                  style={{ background: color }}
                  onClick={handleUpload}
                  disabled={uploading || !file}
                >
                  {uploading
                    ? <><i className="fa-solid fa-spinner fa-spin"></i> Uploading…</>
                    : <><i className="fa-solid fa-upload"></i> Upload</>}
                </button>
              </div>

              {uploading && (
                <div className="sds-progress-wrap">
                  <div className="sds-progress-bar">
                    <div className="sds-progress-fill" style={{ width: `${progress}%`, background: color }}></div>
                  </div>
                  <span style={{ color }}>{progress}%</span>
                </div>
              )}

              {result && (
                <div className={`sds-result ${result.errors.length === 0 ? 'success' : result.inserted > 0 ? 'partial' : 'failed'}`}>
                  <div className="sds-result-stats">
                    <span><i className="fa-solid fa-check-circle"></i> {result.inserted} rows uploaded</span>
                    {result.skipped > 0 && <span><i className="fa-solid fa-triangle-exclamation"></i> {result.skipped} skipped</span>}
                  </div>
                  {result.errors.length > 0 && (
                    <ul className="sds-result-errors">
                      {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="sds-card sds-sessions-card">
              <div className="sds-sessions-header">
                <h3><i className="fa-solid fa-clock-rotate-left"></i> Recent Uploads</h3>
                <button className="sds-btn-refresh" onClick={fetchSessions} disabled={sessionsLoading}>
                  <i className={`fa-solid fa-rotate-right${sessionsLoading ? ' fa-spin' : ''}`}></i>
                </button>
              </div>
              {sessions.length === 0 ? (
                <p className="sds-empty-text">No uploads yet.</p>
              ) : (
                <div className="sds-sessions-list">
                  {sessions.slice(0, 5).map(s => (
                    <div key={s.id} className="sds-session-row">
                      <i className={icon} style={{ color }}></i>
                      <div className="sds-session-info">
                        <div className="sds-session-file">{s.file_name}</div>
                        <div className="sds-session-meta">{s.rows_inserted} rows · {formatDate(s.upload_date)}</div>
                      </div>
                      <span className="sds-status-pill" style={{ background: statusColor(s.status) + '22', color: statusColor(s.status) }}>
                        {s.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Full-width Data Report */}
      <section className="sds-card sds-data-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="sds-data-toolbar">
          <h3 style={{ margin: 0 }}><i className={icon} style={{ color }}></i> Data Report</h3>
          <div className="sds-toolbar-right">
            <div className="sds-search-box">
              <i className="fa-solid fa-search"></i>
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1) }}
              />
            </div>
            <button className="sds-btn-export" onClick={handleExportData} disabled={filtered.length === 0}>
              <i className="fa-solid fa-file-export"></i> Export
            </button>
            <button className="sds-btn-refresh" onClick={fetchTableData} disabled={tableLoading}>
              <i className={`fa-solid fa-rotate-right${tableLoading ? ' fa-spin' : ''}`}></i>
            </button>
          </div>
        </div>

        <div className="sds-record-count">
          Showing {pageData.length} of {filtered.length} records
        </div>

        <div className="sds-table-wrap" style={{ flex: 1, minHeight: 0 }}>
          {tableLoading ? (
            <div className="sds-empty"><i className="fa-solid fa-spinner fa-spin"></i> Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="sds-empty">
              <i className={icon} style={{ color }}></i>
              <p>No data yet. Upload a sheet to populate this table.</p>
            </div>
          ) : (
            <table className="sds-data-table">
              <thead>
                <tr>
                  <th>#</th>
                  {columns.map(col => <th key={col.key}>{col.label}</th>)}
                  <th>Uploaded</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageData.map((row, i) => (
                  <tr key={row.id}>
                    <td>{(currentPage - 1) * rowsPerPage + i + 1}</td>
                    {columns.map(col => (
                      <td key={col.key}>
                        {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                      </td>
                    ))}
                    <td className="sds-muted">{formatDate(row.created_at)}</td>
                    <td>
                      <button className="sds-btn-del" onClick={() => handleDeleteRow(row.id)} title="Delete">
                        <i className="fa-solid fa-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="sds-pagination">
            <button disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
              <i className="fa-solid fa-chevron-left"></i>
            </button>
            <span>Page {currentPage} of {totalPages}</span>
            <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
              <i className="fa-solid fa-chevron-right"></i>
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
