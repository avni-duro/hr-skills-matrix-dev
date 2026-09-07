import SalesDataScreen, { str, num, excelDate } from '../components/SalesDataScreen'

const mapRow = (r) => ({
  parent_claim_no: str(r['Parent Claim No']),
  claim_no: str(r['Claim No']),
  claim_date: excelDate(r['Claim Date']),
  account_number: str(r['Account Number']),
  influencer_name: str(r['Influencer Name']),
  influencer_type: str(r['Influencer Type']),
  influencer_market_city: str(r['Influencer Market City']),
  mobile_no: str(r['Mobile No']),
  pincode: str(r['Pincode']),
  influencer_city: str(r['Influencer City']),
  influencer_district: str(r['Influencer District']),
  influencer_state: str(r['Influencer State']),
  mapped_isr_code: str(r['Mapped ISR CODE']),
  claim_approved_by: str(r['Claim Approved by Code & Name']),
  dealer_district: str(r['Dealer District']),
  dealer_state: str(r['Dealer State']),
  customer_name: str(r['Customer Name']),
  customer_mobile_no: str(r['Customer Mobile No']),
  site_address: str(r['Site Address']),
  purchase_date: str(r['Purchase Date']),
  invoice_no: str(r['Invoice No']),
  product_code: str(r['Product Code']),
  dealer_name: str(r['Dealer Name']),
  dealer_code: str(r['Dealer Code']),
  dealer_gst: str(r['Dealer GST']),
  distributor_name: str(r['Distributor Name']),
  distributor_code: str(r['Distributor Code']),
  base_point_per_sheet: num(r['Base Point/1 Sheets']),
  claimed_qty_sheets: num(r['Claimed Qty(Sheets)']),
  approved_qty: num(r['Approved Qty']),
  approved_points: num(r['Approved Points']),
  status: str(r['Status']),
  status_date: excelDate(r['Status Date']),
  se_approved_qty: num(r['SE Approved Qty(Sheets)']),
  se_verification_status: str(r['SE Verification Status ']),
  se_verification_by: str(r['SE Verification By']),
  se_verification_on: str(r['SE Verification On']) || null,
  se_verification_remark: str(r['SE Verification Remark']),
  se_rejection_reason: str(r['SE Verification Rejection Reas']),
  state_head_name: str(r['State Head Name']),
  state_head_approved_qty: num(r['State Head Approved Qty(Sheets)']),
  state_head_verification_status: str(r['State Head Verification Status ']),
  state_head_site_visit_required: str(r['State Head Site Visit Required']),
  state_head_site_visited: str(r['State Head Site Visited']),
  state_head_verification_by: str(r['State Head Verification By']),
  state_head_verification_on: str(r['State Head Verification On']) || null,
  state_head_verification_remark: str(r['State Head Verification Remark']),
  state_head_rejection_reason: str(r['State Head Verification Rejection Rea']),
  lvl3_approved_by: str(r['LVL3 Approved By']),
  lvl3_status: str(r['LVL3 Status']),
  lvl3_approved_qty: num(r['LVL3 Approved Qty']),
  lvl3_remark: str(r['LVL3 Remark']),
  lvl3_rejection_remark: str(r['LVL3 Rejection Remark']),
  sales_data_not_available: str(r['Sales Data Not Available']),
  dealer_volume_bank_exhausted: str(r['Dealer Volume Bank Exhausted']),
  war_task_no: str(r['War Task No']),
  war_task_description: str(r['War Task Description']),
  war_task_date: str(r['War Task Date']) || null,
  war_task_assign_to: str(r['War Task Assign To']),
  war_task_status: str(r['War Task Status']),
  war_task_status_date: str(r['War Task Status Date']) || null,
  submitted_by: str(r['Submitted By']),
  source: str(r['Source']),
  total_attempts: num(r['Total Attempts Till Date']),
  last_attempt_date: str(r['Last Attempt Date']),
  market_city_state: str(r['Market City State']),
  war_task_generated: str(r['War Task Generated']),
  war_task_assigned: str(r['War Task Assigned']),
  influencer_tier: str(r['Influencer Tier']),
  lead_number: str(r['Lead Number']),
  site_name: str(r['Site Name']),
})

const template = {
  sheetName: 'InfluencerClaimStageDetails',
  fileName: 'InfluencerClaimStageDetails_Format.xlsx',
  rows: [{
    'Parent Claim No': 'C26100', 'Claim No': 'C26100-1', 'Claim Date': '01-Jan-2026',
    'Account Number': '604084', 'Influencer Name': 'Sample Name', 'Influencer Type': 'Contractor',
    'Influencer Market City': 'Mumbai', 'Mobile No': '9999999999', 'Pincode': '400001',
    'Product Code': 'PW_DURO PUMAPLY', 'Dealer Name': 'Sample Dealer', 'Dealer Code': 'CC0001',
    'Claimed Qty(Sheets)': 50, 'Approved Qty': 50, 'Approved Points': 650,
    'Status': 'Approved', 'Influencer Tier': 'Bronze',
  }],
}

const columns = [
  { key: 'claim_no', label: 'Claim No' },
  { key: 'claim_date', label: 'Claim Date' },
  { key: 'influencer_name', label: 'Influencer' },
  { key: 'influencer_type', label: 'Type' },
  { key: 'influencer_market_city', label: 'Market City' },
  { key: 'product_code', label: 'Product' },
  { key: 'claimed_qty_sheets', label: 'Claimed Qty' },
  { key: 'approved_qty', label: 'Approved Qty' },
  { key: 'approved_points', label: 'Points' },
  { key: 'status', label: 'Status' },
  { key: 'influencer_tier', label: 'Tier' },
]

export default function InfluencerClaimScreen() {
  return (
    <SalesDataScreen
      title="Influencer Claim Stage Details"
      description="Upload and view influencer claim data with approval stages"
      sheetType="influencer_claim"
      table="influencer_claim_details"
      uniqueKey="claim_no"
      mapRow={mapRow}
      template={template}
      columns={columns}
      color="#7C3AED"
      icon="fa-solid fa-file-invoice"
    />
  )
}
