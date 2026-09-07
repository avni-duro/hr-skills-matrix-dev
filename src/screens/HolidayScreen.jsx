import SalesDataScreen, { str } from '../components/SalesDataScreen'

const mapRow = (r) => ({
  holiday: str(r['Holiday']),
  festival: str(r['Festival']),
  day: str(r['Day']),
  date: str(r['Date']),
  andhra_pradesh: str(r['Andhra Pradesh']),
  assam: str(r['Assam']),
  bihar: str(r['Bihar']),
  chhattisgarh: str(r['Chhattisgarh']),
  delhi_corporate_office: str(r['Delhi Corporate Office']),
  gujarat: str(r['Gujarat']),
  haryana: str(r['Haryana']),
  hp_tricity: str(r['HP- Tricity']),
  jharkhand: str(r['Jharkhand']),
  karnataka: str(r['Karnataka']),
  kerala: str(r['Kerala']),
  kolkata_head_office: str(r['Kolkata Head Office']),
  madhya_pradesh: str(r['Madhya Pradesh']),
  maharashtra: str(r['Maharashtra']),
  odisha: str(r['Odisha']),
  punjab: str(r['Punjab']),
  rajasthan: str(r['Rajasthan']),
  rajkot_factory: str(r['Rajkot Factory']),
  tamil_nadu: str(r['Tamil Nadu']),
  telangana: str(r['Telangana']),
  uttar_pradesh: str(r['Uttar Pradesh']),
  west_bengal: str(r['West Bengal']),
  western_uttar_pradesh: str(r['Western Uttar Pradesh']),
})

const template = {
  sheetName: 'Sheet1',
  fileName: 'Holiday_Format.xlsx',
  rows: [{
    'Holiday': 'New Year', 'Festival': 'New Year', 'Day': 'Wednesday', 'Date': '1-01-2026',
    'Andhra Pradesh': 'Yes', 'Assam': '', 'Bihar': '', 'Chhattisgarh': '',
    'Delhi Corporate Office': 'Yes', 'Gujarat': '', 'Haryana': '', 'HP- Tricity': '',
    'Jharkhand': '', 'Karnataka': 'Yes', 'Kerala': 'Yes', 'Kolkata Head Office': '',
    'Madhya Pradesh': '', 'Maharashtra': '', 'Odisha': '', 'Punjab': '',
    'Rajasthan': '', 'Rajkot Factory': '', 'Tamil Nadu': 'Yes', 'Telangana': 'Yes',
    'Uttar Pradesh': '', 'West Bengal': 'Yes', 'Western Uttar Pradesh': '',
  }],
}

const columns = [
  { key: 'festival', label: 'Festival' },
  { key: 'day', label: 'Day' },
  { key: 'date', label: 'Date' },
  { key: 'andhra_pradesh', label: 'AP' },
  { key: 'assam', label: 'Assam' },
  { key: 'bihar', label: 'Bihar' },
  { key: 'delhi_corporate_office', label: 'Delhi' },
  { key: 'gujarat', label: 'Gujarat' },
  { key: 'haryana', label: 'Haryana' },
  { key: 'karnataka', label: 'Karnataka' },
  { key: 'kerala', label: 'Kerala' },
  { key: 'maharashtra', label: 'Maharashtra' },
  { key: 'punjab', label: 'Punjab' },
  { key: 'rajasthan', label: 'Rajasthan' },
  { key: 'tamil_nadu', label: 'TN' },
  { key: 'telangana', label: 'Telangana' },
  { key: 'uttar_pradesh', label: 'UP' },
  { key: 'west_bengal', label: 'WB' },
]

export default function HolidayScreen() {
  return (
    <SalesDataScreen
      title="Holiday Calendar"
      description="Upload and view state-wise holiday list"
      sheetType="holiday"
      table="holiday_master"
      uniqueKey={null}
      mapRow={mapRow}
      template={template}
      columns={columns}
      color="#F59E0B"
      icon="fa-solid fa-calendar-days"
    />
  )
}
