import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabaseClient'
import { useNotification } from '../contexts/NotificationContext'
import './ExcelUpload.css'
import './SalesDataDownload.css'

const PAGE_SIZE = 1000

const SHEET_DOWNLOAD_CONFIGS = {
  influencer_claim: {
    label: 'Influencer Claim Stage Details',
    table: 'influencer_claim_details',
    icon: 'fa-solid fa-file-invoice',
    sheetName: 'InfluencerClaimStageDetails',
    fileName: 'InfluencerClaimStageDetails_Data.xlsx',
    allColumns: true,
  },
  influencer_enrollment: {
    label: 'Influencer Enrollment Detail',
    table: 'influencer_enrollment_details',
    icon: 'fa-solid fa-user-plus',
    sheetName: 'InfluencerEnrollmentDetail',
    fileName: 'InfluencerEnrollmentDetail_Data.xlsx',
    allColumns: true,
  },
  influencer_visit: {
    label: 'Influencer Visit Report',
    table: 'influencer_visit_reports',
    icon: 'fa-solid fa-map-location-dot',
    sheetName: 'InfluencerVisitReportNew',
    fileName: 'InfluencerVisitReport_Data.xlsx',
    allColumns: true,
  },
  lead_details: {
    label: 'Lead Details Report',
    table: 'lead_details_reports',
    icon: 'fa-solid fa-bullseye',
    sheetName: 'LeadDetailsReport',
    fileName: 'LeadDetailsReport_Data.xlsx',
    allColumns: true,
  },
  lead_task: {
    label: 'Lead Task Report',
    table: 'lead_task_reports',
    icon: 'fa-solid fa-list-check',
    sheetName: 'LeadTaskReport',
    fileName: 'LeadTaskReport_Data.xlsx',
    allColumns: true,
  },
  m_enrollment: {
    label: 'Master Enrollment (MEnrollment)',
    table: 'm_enrollment_details',
    icon: 'fa-solid fa-address-card',
    sheetName: 'Table',
    fileName: 'MEnrollment_Data.xlsx',
    allColumns: true,
  },
  tier_upgrade: {
    label: 'Tier Upgrade Performance Report',
    table: 'tier_upgrade_performance_report',
    icon: 'fa-solid fa-arrow-up-right-dots',
    sheetName: 'TierUpgradePerformanceReport',
    fileName: 'TierUpgradePerformanceReport_Data.xlsx',
    allColumns: true,
  },
  telecalling_wartask: {
    label: 'TeleCalling Influencer War Task',
    table: 'telecalling_influencer_wartask',
    icon: 'fa-solid fa-phone-volume',
    sheetName: 'TeleCallingInfluencerWartask',
    fileName: 'TeleCallingInfluencerWartask_Data.xlsx',
    allColumns: true,
  },
  monthly_attendance: {
    label: 'Monthly Attendance Report',
    table: 'monthly_attendance_report',
    icon: 'fa-solid fa-user-check',
    sheetName: 'Monthly_Working_Hour',
    fileName: 'Monthly_Attendance_Report_Data.xlsx',
    allColumns: true,
  },
}

async function fetchAllRows(table, columns, allColumns = false) {
  if (allColumns) {
    let all = []
    let from = 0

    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .range(from, from + PAGE_SIZE - 1)

      if (error) throw error
      if (!data || data.length === 0) break

      all = all.concat(data)
      if (data.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }

    return all
  }

  const fields = Array.isArray(columns) ? columns.map((c) => c.field).filter(Boolean) : []
  const selectExpr = ['id', ...new Set(fields)].join(',')

  let all = []
  let lastId = null

  while (true) {
    let query = supabase
      .from(table)
      .select(selectExpr)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE)

    if (lastId) query = query.gt('id', lastId)

    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) break

    all = all.concat(data)
    lastId = data[data.length - 1].id
    if (data.length < PAGE_SIZE) break
  }

  return all
}

function buildSheet(rows, columns) {
  const safeRows = Array.isArray(rows) ? rows : []
  const safeColumns = Array.isArray(columns) ? columns : []

  if (safeColumns.length === 0) {
    const normalizedRows = safeRows.map((row) => {
      const out = {}
      Object.entries(row || {}).forEach(([key, value]) => {
        out[key] = value === null || value === undefined ? '' : value
      })
      return out
    })
    return XLSX.utils.json_to_sheet(normalizedRows)
  }

  const mappedRows = safeRows.map((row) => {
    const out = {}
    safeColumns.forEach((col) => {
      const value = row?.[col.field]
      out[col.header] = value === null || value === undefined ? '' : value
    })
    return out
  })

  // Ensure header row exists even when there is no data.
  if (mappedRows.length === 0) {
    return XLSX.utils.json_to_sheet([], { header: safeColumns.map((c) => c.header) })
  }

  return XLSX.utils.json_to_sheet(mappedRows, {
    header: safeColumns.map((c) => c.header),
    skipHeader: false,
  })
}

function SalesDataDownload() {
  const [downloadingKey, setDownloadingKey] = useState('')
  const [downloadingAll, setDownloadingAll] = useState(false)
  const { showNotification } = useNotification()
  const [counts, setCounts] = useState({})
  const [loadingCounts, setLoadingCounts] = useState(true)

  const sheetEntries = useMemo(() => Object.entries(SHEET_DOWNLOAD_CONFIGS), [])

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        setLoadingCounts(true)
        const nextCounts = {}
        for (const [key, cfg] of sheetEntries) {
          const { count } = await supabase
            .from(cfg.table)
            .select('*', { head: true, count: 'exact' })
          nextCounts[key] = count || 0
        }
        setCounts(nextCounts)
      } catch (err) {
        console.error('Count fetch error:', err)
      } finally {
        setLoadingCounts(false)
      }
    }
    fetchCounts()
  }, [sheetEntries])

  const handleDownloadSheet = async (key) => {
    const cfg = SHEET_DOWNLOAD_CONFIGS[key]
    if (!cfg) return

    try {
      setDownloadingKey(key)
      const rows = await fetchAllRows(cfg.table, cfg.columns, cfg.allColumns === true)
      const ws = buildSheet(rows, cfg.columns)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, cfg.sheetName)
      XLSX.writeFile(wb, cfg.fileName)
    } catch (err) {
      console.error(err)
      showNotification(`Failed to download ${cfg.label}: ${err.message}`, 'error')
    } finally {
      setDownloadingKey('')
    }
  }

  const handleDownloadAll = async () => {
    try {
      setDownloadingAll(true)
      const wb = XLSX.utils.book_new()

      for (const [, cfg] of sheetEntries) {
        const rows = await fetchAllRows(cfg.table, cfg.columns, cfg.allColumns === true)
        const ws = buildSheet(rows, cfg.columns)
        XLSX.utils.book_append_sheet(wb, ws, cfg.sheetName)
      }

      XLSX.writeFile(wb, 'SalesData_AllSheets.xlsx')
    } catch (err) {
      console.error(err)
      showNotification(`Failed to download all sheets: ${err.message}`, 'error')
    } finally {
      setDownloadingAll(false)
    }
  }

  return (
    <main className="excel-upload-main">
      <section className="excel-upload-header">
        <div>
          <h2>Sales Data Download</h2>
          <p>Download current uploaded data in Excel format for all Sales Upload sheets</p>
        </div>
      </section>

      <div className="upload-card">
        <div className="sdd-top-actions">
          <h3><i className="fa-solid fa-download"></i> Download Sheets</h3>
          <button
            className="btn-upload sdd-download-all"
            onClick={handleDownloadAll}
            disabled={downloadingAll || downloadingKey !== ''}
          >
            {downloadingAll
              ? <><i className="fa-solid fa-spinner fa-spin"></i> Preparing...</>
              : <><i className="fa-solid fa-file-arrow-down"></i> Download All Sheets</>}
          </button>
        </div>

        <div className="sheet-type-grid">
          {sheetEntries.map(([key, cfg]) => (
            <div key={key} className="sheet-type-btn sdd-card">
              <div className="sdd-card-title">
                <i className={cfg.icon}></i>
                <span>{cfg.label}</span>
              </div>

              <div className="sdd-card-meta">
                <span>{loadingCounts ? 'Rows: ...' : `Rows: ${(counts[key] || 0).toLocaleString()}`}</span>
                <span className="sdd-file-name">{cfg.fileName}</span>
              </div>

              <button
                className="btn-download-format sdd-download-btn"
                onClick={() => handleDownloadSheet(key)}
                disabled={downloadingAll || (downloadingKey !== '' && downloadingKey !== key)}
              >
                {downloadingKey === key
                  ? <><i className="fa-solid fa-spinner fa-spin"></i> Preparing...</>
                  : <><i className="fa-solid fa-download"></i> Download</>}
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

export default SalesDataDownload
