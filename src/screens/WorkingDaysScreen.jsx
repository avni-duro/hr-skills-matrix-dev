import SalesDataScreen, { str, num } from '../components/SalesDataScreen'

const mapRow = (r) => ({
  month: str(r['Month']),
  state: str(r['State']),
  working_days: num(r['Working Days']),
})

const template = {
  sheetName: 'Working_Days',
  fileName: 'Working_Days_Format.xlsx',
  rows: [{
    'Month': 'January', 'State': 'Andhra Pradesh', 'Working Days': 26,
  }, {
    'Month': 'February', 'State': 'Andhra Pradesh', 'Working Days': 23,
  }],
}

const columns = [
  { key: 'month', label: 'Month' },
  { key: 'state', label: 'State' },
  { key: 'working_days', label: 'Working Days' },
]

export default function WorkingDaysScreen() {
  return (
    <SalesDataScreen
      title="Working Days Report"
      description="Upload and view state-wise monthly working days data"
      sheetType="working_days_report"
      table="working_days_report"
      uniqueKey={null}
      mapRow={mapRow}
      template={template}
      columns={columns}
      color="#0D9488"
      icon="fa-solid fa-calendar-week"
    />
  )
}
