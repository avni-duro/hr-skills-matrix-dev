import SalesDataScreen, { str, excelDate } from '../components/SalesDataScreen'

const mapRow = (r) => ({
  lead_id: str(r['Lead ID']),
  lead_status: str(r['Lead Status']),
  task_type: str(r['Task Type']),
  task_assign_to_dso_code: str(r['Task Assign To/DSO Code']),
  task_assign_to_dso_name: str(r['Task Assign To/DSO Name']),
  task_created_by_dso_code: str(r['Task Created By /DSO Code']),
  task_created_by_dso_name: str(r['Task Created By/DSO Name']),
  purpose: str(r['Purpose']),
  task_created_on: excelDate(r['Task Created On']),
  schedule_date: excelDate(r['Schedule Date']),
  contact_person: str(r['Contact Person']),
  contact_no: str(r['Contact No']),
  discussion_point: str(r['Discussion Point']),
  task_last_updated_date: excelDate(r['Task Last Updated Date']),
  task_status: str(r['Task Status']),
  remark: str(r['Remark']),
  district: str(r['District']),
  state: str(r['State']),
  task_location_remark: str(r['Task location remark']),
  market_city: str(r['Market City']),
})

const template = {
  sheetName: 'LeadTaskReport',
  fileName: 'LeadTaskReport_Format.xlsx',
  rows: [{
    'Lead ID': 'LEAD001', 'Lead Status': 'Open',
    'Task Type': 'Call', 'Task Assign To/DSO Code': 'EMP001',
    'Task Assign To/DSO Name': 'Sales Person', 'Purpose': 'Follow Up',
    'Task Created On': '01-Jan-2026', 'Schedule Date': '02-Jan-2026',
    'Contact Person': 'Customer Name', 'Contact No': '9999999999',
    'Task Status': 'Pending', 'District': 'Mumbai', 'State': 'Maharashtra',
    'Market City': 'Mumbai Central',
  }],
}

const columns = [
  { key: 'lead_id', label: 'Lead ID' },
  { key: 'lead_status', label: 'Lead Status' },
  { key: 'task_type', label: 'Task Type' },
  { key: 'task_assign_to_dso_name', label: 'Assigned To' },
  { key: 'purpose', label: 'Purpose' },
  { key: 'task_created_on', label: 'Created On' },
  { key: 'schedule_date', label: 'Scheduled' },
  { key: 'contact_person', label: 'Contact' },
  { key: 'task_status', label: 'Task Status' },
  { key: 'district', label: 'District' },
  { key: 'market_city', label: 'Market City' },
]

export default function LeadTaskScreen() {
  return (
    <SalesDataScreen
      title="Lead Task Report"
      description="Upload and view lead task tracking data"
      sheetType="lead_task"
      table="lead_task_reports"
      uniqueKey={null}
      mapRow={mapRow}
      template={template}
      columns={columns}
      color="#DC2626"
      icon="fa-solid fa-list-check"
    />
  )
}
