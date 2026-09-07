import SalesDataScreen, { str, num, excelDate } from '../components/SalesDataScreen'

const mapRow = (r) => ({
  lead_code: str(r['Lead Code']),
  created_date: excelDate(r['Created Date']),
  project_name: str(r['Project Name']),
  latitude: num(r['Latitude']),
  longitude: num(r['Longitude']),
  address: str(r['Adress']),
  landmark: str(r['Landmark']),
  locality: str(r['Locality']),
  sub_locality: str(r['Sub Locality']),
  city: str(r['City']),
  district: str(r['District']),
  sub_district: str(r['Sub District']),
  state: str(r['State']),
  pincode: str(r['Pincode']),
  source_of_lead: str(r['Source Of Lead']),
  type_of_project: str(r['Type Of Project']),
  lead_stage: str(r['Lead Stage']),
  lead_status: str(r['Lead Status']),
  decision_maker: str(r['Decision Maker']),
  expected_maturity_date: excelDate(r['Expected Maturity Date']),
  linked_dealer: str(r['Linked Dealer']),
  linked_influencer: str(r['Linked Influencer']),
  linked_architect: str(r['Linked Architect']),
  type_of_contact: str(r['Type Of Contact']),
  no_of_pending_tasks: num(r['No. Of Pending Task']),
  no_of_completed_tasks: num(r['No. Of Completed Task']),
  pending_task_assigned_to: str(r['Pending Task Assigned To']),
  latest_task_type: str(r['Latest Task Type']),
  latest_task_scheduled_date: excelDate(r['Latest Task Scheduled Date']),
  latest_task_status: str(r['Latest Task Status']),
  latest_task_assign_to: str(r['Latest Task Assign To']),
  lead_last_update_date: excelDate(r['Lead Last Update Date']),
  lead_created_by: str(r['Lead Created By']),
  task_created_by: str(r['Task Created By']),
  contact_type: str(r['Contact type']),
  contact_person: str(r['Contact Person']),
  mobile_no: str(r['Mobile No']),
  whatsapp_no: str(r['WhatsApp No']),
  email_id: str(r['Email ID']),
  old_lead_status: str(r['Old Lead Status']),
  ageing: num(r['Ageing']),
  market_city: str(r['Market City']),
  lead_assign_to: str(r['Lead Assign To']),
  lead_assign_date: excelDate(r['Lead Assign Date']),
  lead_status_changed_on: excelDate(r['Lead Status Changed On']),
  on_site_location: str(r['Are you standing on site location']),
})

const template = {
  sheetName: 'LeadDetailsReport',
  fileName: 'LeadDetailsReport_Format.xlsx',
  rows: [{
    'Lead Code': 'LEAD001', 'Created Date': '01-Jan-2026', 'Project Name': 'Sample Project',
    'City': 'Mumbai', 'District': 'Mumbai', 'State': 'Maharashtra', 'Pincode': '400001',
    'Source Of Lead': 'Influencer', 'Type Of Project': 'Residential',
    'Lead Stage': 'Prospect', 'Lead Status': 'Open',
    'Lead Created By': 'EMP001', 'Market City': 'Mumbai Central',
  }],
}

const columns = [
  { key: 'lead_code', label: 'Lead Code' },
  { key: 'created_date', label: 'Created Date' },
  { key: 'project_name', label: 'Project' },
  { key: 'city', label: 'City' },
  { key: 'district', label: 'District' },
  { key: 'state', label: 'State' },
  { key: 'source_of_lead', label: 'Source' },
  { key: 'type_of_project', label: 'Project Type' },
  { key: 'lead_stage', label: 'Stage' },
  { key: 'lead_status', label: 'Status' },
  { key: 'lead_created_by', label: 'Created By' },
]

export default function LeadDetailsScreen() {
  return (
    <SalesDataScreen
      title="Lead Details Report"
      description="Upload and view lead details from the sales team"
      sheetType="lead_details"
      table="lead_details_reports"
      uniqueKey="lead_code"
      mapRow={mapRow}
      template={template}
      columns={columns}
      color="#2563EB"
      icon="fa-solid fa-bullseye"
    />
  )
}
