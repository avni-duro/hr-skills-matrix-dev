import SalesDataScreen, { str } from '../components/SalesDataScreen'

const mapRow = (r) => ({
  name: str(r['Name']),
  employee_id: str(r['Employee ID']),
  login_id: str(r['Login ID']),
  mobile_no: str(r['Mobile No']),
  state: str(r['State']),
  district: str(r['District']),
  area_manager: str(r['Area Manager']),
  branch: str(r['Branch']),
  latitude: str(r['Lattitude']),
  longitude: str(r['Longitude']),
  attendance_location: str(r['Attendance Location']),
  attendance_date: str(r['Attendance Date']),
  attendance_time: str(r['Attendance Time']),
  end_day_time: str(r['End Day Time']),
  end_day_lat: str(r['End Day Lat']),
  end_day_long: str(r['End Day Long']),
  end_day_location: str(r['End Day Location']),
  work_hrs: str(r['Work Hrs']),
  leave_type: str(r['Leave Type']),
  attendance_reason: str(r['Attendance Reason']),
  attendance_status: str(r['Attendance Status']),
  attendance_remark: str(r['Attendance Remark']),
  payroll_company: str(r['Payroll Comapany']),
})

const template = {
  sheetName: 'AttendanceReportV2',
  fileName: 'AttendanceReport_Format.xlsx',
  rows: [{
    'Name': 'Sample Name', 'Employee ID': 'S10001', 'Login ID': 'S10001',
    'Mobile No': '9999999999', 'State': 'PUNJAB', 'District': 'LUDHIANA',
    'Area Manager': 'Manager Name', 'Branch': 'Branch Name',
    'Lattitude': '30.9191', 'Longitude': '75.8774',
    'Attendance Location': 'Sample Location, City, State',
    'Attendance Date': '15-Apr-2026', 'Attendance Time': '9:00AM',
    'End Day Time': '6:00PM', 'End Day Lat': '30.9191', 'End Day Long': '75.8774',
    'End Day Location': 'Sample Location', 'Work Hrs': '9',
    'Leave Type': '', 'Attendance Reason': 'MARKET VISIT',
    'Attendance Status': 'Present', 'Attendance Remark': '',
    'Payroll Comapany': 'Customer',
  }],
}

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'employee_id', label: 'Emp ID' },
  { key: 'state', label: 'State' },
  { key: 'district', label: 'District' },
  { key: 'area_manager', label: 'Area Manager' },
  { key: 'branch', label: 'Branch' },
  { key: 'attendance_date', label: 'Date' },
  { key: 'attendance_time', label: 'Time' },
  { key: 'attendance_status', label: 'Status' },
  { key: 'attendance_reason', label: 'Reason' },
  { key: 'leave_type', label: 'Leave Type' },
  { key: 'work_hrs', label: 'Work Hrs' },
  { key: 'payroll_company', label: 'Payroll Co.' },
]

export default function AttendanceReportScreen() {
  return (
    <SalesDataScreen
      title="Attendance Report"
      description="Upload and view employee attendance data"
      sheetType="attendance_report"
      table="attendance_report"
      uniqueKey={null}
      mapRow={mapRow}
      template={template}
      columns={columns}
      color="#6366F1"
      icon="fa-solid fa-clipboard-user"
    />
  )
}
