import SalesDataScreen, { str, num } from '../components/SalesDataScreen'

const mapRow = (r) => ({
  influencer_code: str(r['Infuencer Code']),
  influencer_name: str(r['Influencer Name']),
  remarks: str(r['Remarks']),
  visit_date: str(r['Visit Date']) || null,
  visit_time: str(r['Visit Time']),
  influencer_location: str(r['Infleuncer Location']),
  district: str(r['District']),
  state: str(r['State']),
  start_outlet_time: str(r['Start Outlet Time']),
  end_outlet_time: str(r['End Outlet Time']),
  time_spent_at_outlet: str(r['Time Spent of Outlet']),
  emp_login: str(r['Emp Login']),
  emp_name: str(r['Emp Name']),
  days_since_last_visit: num(r['Days since last visit']),
  market_city: str(r['Market City']),
  mapped_isr_name: str(r['Mapped ISR Name']),
  mapped_isr_code: str(r['Mapped ISR Code']),
  influencer_tier: str(r['Influencer Tier']),
})

const template = {
  sheetName: 'InfluencerVisitReportNew',
  fileName: 'InfluencerVisitReport_Format.xlsx',
  rows: [{
    'Infuencer Code': 'INF001', 'Influencer Name': 'Sample Name',
    'Visit Date': '01-Jan-2026', 'Visit Time': '10:00 AM',
    'Infleuncer Location': 'Mumbai', 'District': 'Mumbai', 'State': 'Maharashtra',
    'Emp Login': 'EMP001', 'Emp Name': 'Sales Person', 'Market City': 'Mumbai Central',
    'Influencer Tier': 'Bronze', 'Days since last visit': 5,
  }],
}

const columns = [
  { key: 'influencer_code', label: 'Code' },
  { key: 'influencer_name', label: 'Influencer' },
  { key: 'visit_date', label: 'Visit Date' },
  { key: 'visit_time', label: 'Visit Time' },
  { key: 'emp_name', label: 'Employee' },
  { key: 'influencer_location', label: 'Location' },
  { key: 'district', label: 'District' },
  { key: 'state', label: 'State' },
  { key: 'days_since_last_visit', label: 'Days Since Last' },
  { key: 'market_city', label: 'Market City' },
  { key: 'influencer_tier', label: 'Tier' },
]

export default function InfluencerVisitScreen() {
  return (
    <SalesDataScreen
      title="Influencer Visit Report"
      description="Upload and view influencer visit tracking data"
      sheetType="influencer_visit"
      table="influencer_visit_reports"
      uniqueKey={null}
      mapRow={mapRow}
      template={template}
      columns={columns}
      color="#D97706"
      icon="fa-solid fa-map-location-dot"
    />
  )
}
