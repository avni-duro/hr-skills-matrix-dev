import SalesDataScreen, { str, excelDate } from '../components/SalesDataScreen'

const normalizeHeaderText = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '')

const pickByNormalizedHeader = (row, aliases = []) => {
  if (!row || typeof row !== 'object') return null
  const wanted = new Set(aliases.map(normalizeHeaderText).filter(Boolean))
  if (wanted.size === 0) return null

  for (const key of Object.keys(row)) {
    if (wanted.has(normalizeHeaderText(key))) return row[key]
  }
  return null
}

const mapRow = (r) => {
  const employeeCode = str(
    pickByNormalizedHeader(r, ['employeecode', 'employeecodeid', 'employeeid', 'employeeno', 'empcode'])
  )
  const attendanceDate = excelDate(
    pickByNormalizedHeader(r, ['attendancedate', 'attendanceon', 'date'])
  )
  if (!employeeCode || !attendanceDate) return null

  return {
    record_key: `${employeeCode}_${attendanceDate}`,
    employee_code: employeeCode,
    full_name: str(pickByNormalizedHeader(r, ['fullname'])),
    employment_status: str(pickByNormalizedHeader(r, ['employmentstatus'])),
    company: str(pickByNormalizedHeader(r, ['company'])),
    business_unit: str(pickByNormalizedHeader(r, ['businessunit'])),
    department: str(pickByNormalizedHeader(r, ['department'])),
    designation: str(pickByNormalizedHeader(r, ['designation'])),
    branch: str(pickByNormalizedHeader(r, ['branch'])),
    sub_branch: str(pickByNormalizedHeader(r, ['subbranch'])),
    attendance_date: attendanceDate,
    working_hour: str(pickByNormalizedHeader(r, ['workinghour', 'workinghours'])),
    shift_code: str(pickByNormalizedHeader(r, ['shiftcode'])),
    shift_timings: str(pickByNormalizedHeader(r, ['shifttimings', 'shifttiming'])),
    attendance_status: str(
      pickByNormalizedHeader(r, ['attendancestatus', 'status'])
    ),
    checkin_timings: str(
      pickByNormalizedHeader(r, ['checkintimings', 'punchclockingtime', 'punchclockingtim', 'punchclockingtimings'])
    ),
  }
}

const template = {
  sheetName: 'Monthly_Working_Hour',
  fileName: 'Monthly_Attendance_Report_Format.xlsx',
  rows: [{
    'Employee Code': 'D01929',
    'Full name': 'Sample User',
    'Employment status': 'Active',
    'Company': 'Duroply Industries Limited',
    'Business Unit': 'Plywood',
    'Department': 'Sales',
    'Designation': 'Branch Manager',
    'Branch': 'ANDHRA PRADESH',
    'Sub branch': 'Vijayawada',
    'Attendance date': '2026-03-31',
    'Working hour': '08:00',
    'Shift code': 'GN- KOL',
    'Shift timings': '10:00 | 18:00',
    'Attendance status': 'P | P',
    'Checkin timings': '10:00 | 18:00',
  }],
}

const columns = [
  { key: 'employee_code', label: 'Employee Code' },
  { key: 'full_name', label: 'Full Name' },
  { key: 'branch', label: 'Branch' },
  { key: 'sub_branch', label: 'Sub Branch' },
  { key: 'attendance_date', label: 'Attendance Date' },
  { key: 'working_hour', label: 'Working Hour' },
  { key: 'shift_code', label: 'Shift Code' },
  { key: 'attendance_status', label: 'Attendance Status' },
  { key: 'checkin_timings', label: 'Checkin Timings' },
]

export default function MonthlyAttendanceScreen() {
  return (
    <SalesDataScreen
      title="Monthly Attendance Report"
      description="Upload daily attendance updates and auto-update existing employee/date records"
      sheetType="monthly_attendance"
      table="monthly_attendance_report"
      uniqueKey="record_key"
      mapRow={mapRow}
      template={template}
      columns={columns}
      color="#0F766E"
      icon="fa-solid fa-user-check"
    />
  )
}
