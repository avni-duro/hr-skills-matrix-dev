import SalesDataScreen, { str, num } from '../components/SalesDataScreen'

const mapRow = (r) => ({
  influencer_id: str(r['Influencer ID']),
  se_name: str(r['SE Name']),
  enrollment_date: str(r['Enrollment Date']) || null,
  influencer_name: str(r['Influencer Name']),
  influencer_type: str(r['Influencer Type']),
  mobile_no: str(r['Mobile No']),
  secondary_number: str(r['Secondary Number']),
  permanent_address: str(r['Permanent Address']),
  village: str(r['Village']),
  city: str(r['City']),
  market_city: str(r['Market City']),
  district: str(r['District']),
  state: str(r['State']),
  pincode: str(r['Pincode']),
  language: str(r['Language']),
  market: str(r['Market']),
  visit_days: str(r['VisitDays']),
  retailer: str(r['Retailer']),
  active_status: str(r['Active Status']),
  kyc_documents: str(r['KYC Documents']),
  last_visited_days: num(r['Last Visited Days']),
  visit_date: str(r['VisitDate']) || null,
  opening_points: num(r['Opening Points']),
  earned_points: num(r['Earned Points']),
  redeemed_points: num(r['Redeemed Points']),
  closing_points: num(r['Closing Points']),
  points_banking_start_date: str(r['Points Banking Start Date']) || null,
  last_login_date: str(r['Last login Date']) || null,
  segment: str(r['Segment']),
  address_city: str(r['Address City']),
  address_district: str(r['Address District']),
  address_state: str(r['Address State']),
  anniversary_date: str(r['Anniversary Date ']) || null,
  enrolled_by_dso_code: str(r['Enrolled By/DSO Code']),
  enrolled_by_dso_name: str(r['Enrolled By/DSO Name']),
  mapped_by_dso_code: str(r['Mapped By/DSO Code']),
  mapped_by_dso_name: str(r['Mapped By/DSO Name']),
  market_city_state: str(r['Market City State']),
  source_name: str(r['Source Name']),
  influencer_tier: str(r[' Influencer Tier']),
  selling_branch: str(r['Selling Branch']),
})

const template = {
  sheetName: 'InfluencerEnrollmentDetail',
  fileName: 'InfluencerEnrollmentDetail_Format.xlsx',
  rows: [{
    'Influencer ID': 'INF001', 'SE Name': 'Sample SE', 'Enrollment Date': '01-Jan-2026',
    'Influencer Name': 'Sample Name', 'Influencer Type': 'Contractor',
    'Mobile No': '9999999999', 'City': 'Mumbai', 'Market City': 'Mumbai Central',
    'District': 'Mumbai', 'State': 'Maharashtra', 'Pincode': '400001',
    'Active Status': 'Active', 'Opening Points': 0, 'Earned Points': 100,
    'Redeemed Points': 0, 'Closing Points': 100, ' Influencer Tier': 'Bronze',
  }],
}

const columns = [
  { key: 'influencer_id', label: 'Influencer ID' },
  { key: 'influencer_name', label: 'Name' },
  { key: 'influencer_type', label: 'Type' },
  { key: 'mobile_no', label: 'Mobile' },
  { key: 'market_city', label: 'Market City' },
  { key: 'district', label: 'District' },
  { key: 'state', label: 'State' },
  { key: 'active_status', label: 'Status' },
  { key: 'earned_points', label: 'Earned Pts' },
  { key: 'closing_points', label: 'Closing Pts' },
  { key: 'influencer_tier', label: 'Tier' },
]

export default function InfluencerEnrollmentScreen() {
  return (
    <SalesDataScreen
      title="Influencer Enrollment Details"
      description="Upload and view influencer enrollment data"
      sheetType="influencer_enrollment"
      table="influencer_enrollment_details"
      uniqueKey="influencer_id"
      mapRow={mapRow}
      template={template}
      columns={columns}
      color="#059669"
      icon="fa-solid fa-user-plus"
    />
  )
}
