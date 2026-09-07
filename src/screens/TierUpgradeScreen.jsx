import SalesDataScreen, { str, num } from '../components/SalesDataScreen'

const mapRow = (r) => ({
  dmi_id: str(r['DMI ID']),
  dmi_name: str(r['DMI Name']),
  dmi_market_city: str(r['DMI Market City']),
  district: str(r['District']),
  state: str(r['State']),
  tier_change_date: str(r['Tier Change Date']),
  previous_tier: str(r['Previous Tier']),
  new_tier: str(r['New Tier']),
  change_type: str(r['Change Type']),
  reason_for_change: str(r['Reason for Change']),
  changed_by: str(r['Changed By']),
  effective_from: str(r['Effective From']),
  account_status: str(r['Account Status']),
  tier_change_frequency: num(r['Tier Change Frequency']),
  mapped_isr: str(r['Mapped ISR']),
  fy_claimpoint: num(r['FY CLAIMPOINT']),
  fy_tierpoints: num(r['FY TIERPOINTS']),
})

const template = {
  sheetName: 'TierUpgradePerformanceReport',
  fileName: 'TierUpgradePerformanceReport_Format.xlsx',
  rows: [{
    'DMI ID': '314102', 'DMI Name': 'Sample Name', 'DMI Market City': 'Delhi',
    'District': 'Central Delhi', 'State': 'Delhi', 'Tier Change Date': '01 Apr 2026',
    'Previous Tier': 'Gold', 'New Tier': 'Silver', 'Change Type': 'Tier Downgrade',
    'Reason for Change': 'Compliance', 'Changed By': 'System', 'Effective From': '4/1/2026',
    'Account Status': 'Active', 'Tier Change Frequency': 1, 'Mapped ISR': 'D10535 | Sample ISR',
    'FY CLAIMPOINT': 353, 'FY TIERPOINTS': 53,
  }],
}

const columns = [
  { key: 'dmi_id', label: 'DMI ID' },
  { key: 'dmi_name', label: 'DMI Name' },
  { key: 'dmi_market_city', label: 'Market City' },
  { key: 'district', label: 'District' },
  { key: 'state', label: 'State' },
  { key: 'tier_change_date', label: 'Change Date' },
  { key: 'previous_tier', label: 'Previous Tier' },
  { key: 'new_tier', label: 'New Tier' },
  { key: 'change_type', label: 'Change Type' },
  { key: 'reason_for_change', label: 'Reason' },
  { key: 'account_status', label: 'Status' },
  { key: 'tier_change_frequency', label: 'Frequency' },
  { key: 'mapped_isr', label: 'Mapped ISR' },
  { key: 'fy_claimpoint', label: 'FY Claim Points' },
  { key: 'fy_tierpoints', label: 'FY Tier Points' },
]

export default function TierUpgradeScreen() {
  return (
    <SalesDataScreen
      title="Tier Upgrade Performance Report"
      description="Upload and view DMI tier change performance data"
      sheetType="tier_upgrade"
      table="tier_upgrade_performance_report"
      uniqueKey={null}
      mapRow={mapRow}
      template={template}
      columns={columns}
      color="#E11D48"
      icon="fa-solid fa-arrow-up-right-dots"
    />
  )
}
