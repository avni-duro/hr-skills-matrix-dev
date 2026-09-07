import SalesDataScreen, { str, num } from '../components/SalesDataScreen'

const mapRow = (r) => ({
  task_date: str(r['Task Date']),
  task_no: str(r['Task No']),
  influencer_market_city: str(r['Influencer Market City']),
  influencer_type: str(r['Influencer Type']),
  influencer_id: str(r['Influencer ID']),
  influencer_name: str(r['Influencer Name']),
  primary_phone_no: str(r['Primary Phone No']),
  secondary_phone_no: str(r['Secondary Phone No']),
  owner_name: str(r['Owner Name']),
  task_priority: str(r['Task Priority']),
  task_description: str(r['Task Description']),
  task_description2: str(r['Task Description2']),
  tele_caller_comment: str(r['Tele caller Comment']),
  status_as_on_today: str(r['Status as on Today']),
  status_change_date: str(r['Status Change date']),
  status_elapse_days: num(r['Status Elapse Days']),
  tele_calling_escalation: str(r['Tele calling Escalation']),
  current_owner_type: str(r['Current Owner Type']),
  current_owner_name: str(r['Current Owner Name']),
  isr_contact_details: str(r['ISR Contact Details']),
  distributor_code: str(r['Distributor Code']),
  distributor_name: str(r['Distributor Name']),
  task_remark: str(r['Task Remark']),
  order_status: str(r['Order Status (ByUser)']),
  so_no: str(r['SO No']),
  so_amount: str(r['SO Amount']),
  so_date: str(r['SO Date']),
  customer_latitude: str(r['CustomerLatitude']),
  customer_longitude: str(r['CustomerLongitude']),
  war_activity_lat: str(r['War Activity Lat']),
  war_activity_long: str(r['War Activity Long']),
  distance_in_km: str(r['Distance In KM']),
  location_compliance: str(r['Location compliance']),
  war_activity_date: str(r['War Activity Date']),
  state: str(r['State']),
  call_type: str(r['Call Type']),
  caller_id: str(r['Caller ID']),
  caller_name: str(r['Caller Name']),
  mapped_isr_name: str(r['Mapped ISR Name']),
  mapped_isr_code: str(r['Mapped ISR Code']),
  influencer_tier: str(r['Influencer Tier']),
})

const template = {
  sheetName: 'TeleCallingInfluencerWartask',
  fileName: 'TeleCallingInfluencerWartask_Format.xlsx',
  rows: [{
    'Task Date': '01 Apr 2026', 'Task No': 'WAR2604000001',
    'Influencer Market City': 'Ajmer', 'Influencer Type': 'Contractor',
    'Influencer ID': '110313', 'Influencer Name': 'Sample Name',
    'Primary Phone No': '9999999999', 'Secondary Phone No': '',
    'Owner Name': '', 'Task Priority': 'P0',
    'Task Description': 'Telecall Escalation Tag', 'Task Description2': '',
    'Tele caller Comment': 'Sample comment',
    'Status as on Today': 'Closure', 'Status Change date': '01-Apr-2026',
    'Status Elapse Days': 5, 'Tele calling Escalation': 'SE Visit required',
    'Current Owner Type': 'DSO', 'Current Owner Name': 'Sample Owner',
    'ISR Contact Details': '9999999999', 'Distributor Code': 'STATE',
    'Distributor Name': 'STATE', 'Task Remark': 'Sample remark',
    'Order Status (ByUser)': 'YES', 'SO No': 'WAR2604000001',
    'State': 'Rajasthan', 'Call Type': 'Call Me',
    'Mapped ISR Name': 'Sample ISR', 'Mapped ISR Code': 'D10464',
    'Influencer Tier': 'Bronze',
  }],
}

const columns = [
  { key: 'task_date', label: 'Task Date' },
  { key: 'task_no', label: 'Task No' },
  { key: 'influencer_name', label: 'Influencer' },
  { key: 'influencer_type', label: 'Type' },
  { key: 'influencer_market_city', label: 'Market City' },
  { key: 'status_as_on_today', label: 'Status' },
  { key: 'task_priority', label: 'Priority' },
  { key: 'tele_calling_escalation', label: 'Escalation' },
  { key: 'current_owner_name', label: 'Owner' },
  { key: 'state', label: 'State' },
  { key: 'call_type', label: 'Call Type' },
  { key: 'mapped_isr_name', label: 'Mapped ISR' },
  { key: 'influencer_tier', label: 'Tier' },
  { key: 'order_status', label: 'Order Status' },
]

export default function TeleCallingScreen() {
  return (
    <SalesDataScreen
      title="TeleCalling Influencer War Task"
      description="Upload and view telecalling influencer war task data"
      sheetType="telecalling_wartask"
      table="telecalling_influencer_wartask"
      uniqueKey={null}
      mapRow={mapRow}
      template={template}
      columns={columns}
      color="#7C3AED"
      icon="fa-solid fa-phone-volume"
    />
  )
}
