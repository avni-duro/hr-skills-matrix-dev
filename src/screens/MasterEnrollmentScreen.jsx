import SalesDataScreen, { str, excelDate } from '../components/SalesDataScreen'

const mapRow = (r) => ({
  account_no: str(r['AccountNo']),
  salutation: str(r['SALUTATION']),
  first_name: str(r['First Name*']),
  middle_name: str(r['Middle Name']),
  last_name: str(r['Last Name*']),
  date_of_birth: excelDate(r['Date Of Birth*']),
  gender: str(r['Gender*']),
  dealer: str(r['DEALER']),
  enrolled_by: str(r['Enrolled By']),
  enrolment_date: excelDate(r['Enrolment Date*']),
  mapped_by: str(r['Mapped By']),
  mapping_date: excelDate(r['Mapping Date']),
  market_city: str(r['Market City']),
  mapped_isr: str(r['Mapped ISR*']),
  mobile_no: str(r['Mobile No*']),
  whatsapp_no: str(r['WhatsApp_No']),
  is_own_firm: String(r['Is Own Firm*'] ?? ''),
  email_id: str(r['Email Id']),
  firm_name: str(r['Firm Name*']),
  firm_address: str(r['Firm Address*']),
  permanent_address: str(r['Permanent Address*']),
  village: str(r['Village']),
  city: str(r['City']),
  state: str(r['State*']),
  district: str(r['District*']),
  landmark: str(r['Landmark']),
  area: str(r['Area']),
  sub_area: str(r['Sub Area']),
  pincode: str(r['Pincode']),
  influencer_area: str(r['Influencer Area']),
  area_type: str(r['Area Type']),
  visit_day: str(r['Visit_Day']),
  link_retailer: str(r['Link Retailer']),
  languages: str(r['Languages']),
  bank_name: str(r['Bank Name']),
  ifsc_code: str(r['IFSC Code']),
  bank_account_number: str(r['Account Number']),
  account_holder_name: str(r['Account Holder Name']),
  branch_name: str(r['Branch Name']),
  documents: str(r['Documents']),
  document_no: str(r['Document No']),
  is_active: String(r['ISACTIVE*'] ?? ''),
  enrolled: str(r['Enrolled']),
  tele_verification: str(r['Tele Verification']),
  tele_verification_by: str(r['Tele Verification By']),
  tele_verification_remark: str(r['Tele Verification Remark']),
  physical_verification: str(r['Physical Verification']),
  physical_verification_by: str(r['Physical Verification By']),
  physical_verification_remark: str(r['Physical Verification Remark']),
  tier: str(r['Tier']),
})

const template = {
  sheetName: 'Table',
  fileName: 'MEnrollment_Format.xlsx',
  rows: [{
    'AccountNo': '104235', 'SALUTATION': 'Mr.', 'First Name*': 'Sample',
    'Last Name*': 'Name', 'Date Of Birth*': '01-Jan-1990', 'Gender*': 'Male',
    'Mobile No*': '9999999999', 'Firm Name*': 'Sample Firm',
    'Firm Address*': 'Sample Address', 'Permanent Address*': 'Sample Address',
    'City': 'Mumbai', 'State*': 'Maharashtra', 'District*': 'Mumbai',
    'Pincode': '400001', 'ISACTIVE*': 'True', 'Enrolled': 'Yes', 'Tier': 'Base Tier',
  }],
}

const columns = [
  { key: 'account_no', label: 'Account No' },
  { key: 'first_name', label: 'First Name' },
  { key: 'last_name', label: 'Last Name' },
  { key: 'mobile_no', label: 'Mobile' },
  { key: 'market_city', label: 'Market City' },
  { key: 'city', label: 'City' },
  { key: 'district', label: 'District' },
  { key: 'state', label: 'State' },
  { key: 'is_active', label: 'Active' },
  { key: 'enrolled', label: 'Enrolled' },
  { key: 'tier', label: 'Tier' },
]

export default function MasterEnrollmentScreen() {
  return (
    <SalesDataScreen
      title="Master Enrollment (MEnrollment)"
      description="Upload and view master enrollment data"
      sheetType="m_enrollment"
      table="m_enrollment_details"
      uniqueKey={null}
      mapRow={mapRow}
      template={template}
      columns={columns}
      color="#0891B2"
      icon="fa-solid fa-address-card"
    />
  )
}
