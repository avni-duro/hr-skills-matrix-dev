import { useState, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import './ExcelUpload.css'

// ── Sheet config ────────────────────────────────────────────
// Maps each sheet type to: table name, unique key column, and a
// function that converts a raw XLSX row object → DB row object.
const SHEET_CONFIGS = {
  influencer_claim: {
    label: 'Influencer Claim Stage Details',
    table: 'influencer_claim_details',
    uniqueKey: 'claim_no',
    icon: 'fa-solid fa-file-invoice',
    mapRow: (r) => ({
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
    }),
  },

  influencer_enrollment: {
    label: 'Influencer Enrollment Detail',
    table: 'influencer_enrollment_details',
    uniqueKey: 'influencer_id',
    icon: 'fa-solid fa-user-plus',
    mapRow: (r) => ({
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
      influencer_tier: str(r['Influencer Tier'] ?? r[' Influencer Tier'] ?? r['Influencer Tier '] ?? r['INFLUENCER TIER']),
      selling_branch: str(r['Selling Branch']),
    }),
  },

  influencer_visit: {
    label: 'Influencer Visit Report',
    table: 'influencer_visit_reports',
    uniqueKey: null, // no natural unique key — always insert
    icon: 'fa-solid fa-map-location-dot',
    mapRow: (r) => ({
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
    }),
  },

  lead_details: {
    label: 'Lead Details Report',
    table: 'lead_details_reports',
    uniqueKey: 'lead_code',
    icon: 'fa-solid fa-bullseye',
    mapRow: (r) => ({
      lead_code: str(r['Lead Code']),
      created_date: excelDate(r['Created Date']),
      project_name: str(r['Project Name']),
      latitude: num(r['Latitude']),
      longitude: num(r['Longitude']),
      address: str(r['Adress']),
      landmark: str(r['Landmark']),
      locality: str(r['Locality']),
      sub_locality: str(r['Sub Locality']),
      city: str(r['City']),
      district: str(r['District']),
      sub_district: str(r['Sub District']),
      state: str(r['State']),
      pincode: str(r['Pincode']),
      source_of_lead: str(r['Source Of Lead']),
      type_of_project: str(r['Type Of Project']),
      lead_stage: str(r['Lead Stage']),
      lead_status: str(r['Lead Status']),
      decision_maker: str(r['Decision Maker']),
      expected_maturity_date: excelDate(r['Expected Maturity Date']),
      linked_dealer: str(r['Linked Dealer']),
      linked_influencer: str(r['Linked Influencer']),
      linked_architect: str(r['Linked Architect']),
      type_of_contact: str(r['Type Of Contact']),
      no_of_pending_tasks: num(r['No. Of Pending Task']),
      no_of_completed_tasks: num(r['No. Of Completed Task']),
      pending_task_assigned_to: str(r['Pending Task Assigned To']),
      latest_task_type: str(r['Latest Task Type']),
      latest_task_scheduled_date: excelDate(r['Latest Task Scheduled Date']),
      latest_task_status: str(r['Latest Task Status']),
      latest_task_assign_to: str(r['Latest Task Assign To']),
      lead_last_update_date: excelDate(r['Lead Last Update Date']),
      lead_created_by: str(r['Lead Created By']),
      task_created_by: str(r['Task Created By']),
      contact_type: str(r['Contact type']),
      contact_person: str(r['Contact Person']),
      mobile_no: str(r['Mobile No']),
      whatsapp_no: str(r['WhatsApp No']),
      email_id: str(r['Email ID']),
      old_lead_status: str(r['Old Lead Status']),
      ageing: num(r['Ageing']),
      market_city: str(r['Market City']),
      lead_assign_to: str(r['Lead Assign To']),
      lead_assign_date: excelDate(r['Lead Assign Date']),
      lead_status_changed_on: excelDate(r['Lead Status Changed On']),
      on_site_location: str(r['Are you standing on site location']),
    }),
  },

  lead_task: {
    label: 'Lead Task Report',
    table: 'lead_task_reports',
    uniqueKey: null,
    icon: 'fa-solid fa-list-check',
    mapRow: (r) => ({
        lead_id: str(pickByNormalizedHeader(r, ['lead id', 'lead_id'])),
        lead_status: str(pickByNormalizedHeader(r, ['lead status', 'lead_status'])),
      task_type: str(r['Task Type']),
      task_assign_to_dso_code: str(r['Task Assign To/DSO Code']),
      task_assign_to_dso_name: str(r['Task Assign To/DSO Name']),
      task_created_by_dso_code: str(r['Task Created By /DSO Code']),
      task_created_by_dso_name: str(r['Task Created By/DSO Name']),
      purpose: str(r['Purpose']),
      task_created_on: str(r['Task Created On']) || null,
      schedule_date: str(r['Schedule Date']) || null,
      contact_person: str(r['Contact Person']),
      contact_no: str(r['Contact No']),
      discussion_point: str(r['Discussion Point']),
      task_last_updated_date: str(r['Task Last Updated Date']) || null,
      task_status: str(r['Task Status']),
      remark: str(r['Remark']),
      district: str(r['District']),
      state: str(r['State']),
      task_location_remark: str(r['Task location remark']),
      market_city: str(r['Market City']),
    }),
  },

  m_enrollment: {
    label: 'Master Enrollment (MEnrollment)',
    table: 'm_enrollment_details',
    uniqueKey: null,
    icon: 'fa-solid fa-address-card',
    mapRow: (r) => ({
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
    }),
  },

  tier_upgrade: {
    label: 'Tier Upgrade Performance Report',
    table: 'tier_upgrade_performance_report',
    uniqueKey: null,
    icon: 'fa-solid fa-arrow-up-right-dots',
    mapRow: (r) => ({
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
    }),
  },

  telecalling_wartask: {
    label: 'TeleCalling Influencer War Task',
    table: 'telecalling_influencer_wartask',
    uniqueKey: null,
    icon: 'fa-solid fa-phone-volume',
    mapRow: (r) => ({
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
    }),
  },

  monthly_attendance: {
    label: 'Monthly Attendance Report',
    table: 'monthly_attendance_report',
    uniqueKey: 'record_key',
    icon: 'fa-solid fa-user-check',
    mapRow: (r) => {
      const employeeCode = str(
        pickByNormalizedHeader(r, [
          'employeecode', 'employeecodeid', 'employeeid', 'employeeno', 'empcode',
        ])
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
    },
  },
}

// ── Format templates ─────────────────────────────────────────────────
const SHEET_TEMPLATES = {
  influencer_claim: {
    sheetName: 'InfluencerClaimStageDetails',
    fileName: 'InfluencerClaimStageDetails_Format.xlsx',
    rows: [{
      'Parent Claim No': 'C26100', 'Claim No': 'C26100-1', 'Claim Date': '01-Jan-2026',
      'Account Number': '604084', 'Influencer Name': 'Sample Name', 'Influencer Type': 'Contractor',
      'Influencer Market City': 'Mumbai', 'Mobile No': '9999999999', 'Pincode': '400001',
      'Influencer City': 'Mumbai_T', 'Influencer District': 'Mumbai', 'Influencer State': 'Maharashtra',
      'Mapped ISR CODE': 'D10001', 'Product Code': 'PW_DURO PUMAPLY',
      'Dealer Name': 'Sample Dealer', 'Dealer Code': 'CC0001',
      'Claimed Qty(Sheets)': 50, 'Approved Qty': 50, 'Approved Points': 650,
      'Status': 'Approved', 'Influencer Tier': 'Bronze',
    }],
  },
  influencer_enrollment: {
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
  },
  influencer_visit: {
    sheetName: 'InfluencerVisitReportNew',
    fileName: 'InfluencerVisitReport_Format.xlsx',
    rows: [{
      'Infuencer Code': 'INF001', 'Influencer Name': 'Sample Name',
      'Visit Date': '01-Jan-2026', 'Visit Time': '10:00 AM',
      'Infleuncer Location': 'Mumbai', 'District': 'Mumbai', 'State': 'Maharashtra',
      'Emp Login': 'EMP001', 'Emp Name': 'Sales Person', 'Market City': 'Mumbai Central',
      'Influencer Tier': 'Bronze', 'Days since last visit': 5,
    }],
  },
  lead_details: {
    sheetName: 'LeadDetailsReport',
    fileName: 'LeadDetailsReport_Format.xlsx',
    rows: [{
      'Lead Code': 'LEAD001', 'Created Date': '01-Jan-2026', 'Project Name': 'Sample Project',
      'City': 'Mumbai', 'District': 'Mumbai', 'State': 'Maharashtra', 'Pincode': '400001',
      'Source Of Lead': 'Influencer', 'Type Of Project': 'Residential',
      'Lead Stage': 'Prospect', 'Lead Status': 'Open',
      'Lead Created By': 'EMP001', 'Market City': 'Mumbai Central',
    }],
  },
  lead_task: {
    sheetName: 'LeadTaskReport',
    fileName: 'LeadTaskReport_Format.xlsx',
    rows: [{
      'Lead ID': 'LEAD001', 'Lead Status': 'Open',
      'Task Type': 'Call', 'Task Assign To/DSO Code': 'EMP001',
      'Task Assign To/DSO Name': 'Sales Person', 'Purpose': 'Follow Up',
      'Task Created On': '01-Jan-2026', 'Schedule Date': '02-Jan-2026',
      'Contact Person': 'Customer Name', 'Contact No': '9999999999',
      'Task Status': 'Pending', 'District': 'Mumbai', 'State': 'Maharashtra',
      'Market City': 'Mumbai Central',
    }],
  },
  m_enrollment: {
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
  },
  tier_upgrade: {
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
  },
  telecalling_wartask: {
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
  },
  monthly_attendance: {
    sheetName: 'Monthly_Working_Hour',
    fileName: 'Monthly_Attendance_Report_Format.xlsx',
    rows: [{
      'Employee Code': 'D01929', 'Full name': 'Sample User',
      'Employment status': 'Active', 'Company': 'Duroply Industries Limited',
      'Business Unit': 'Plywood', 'Department': 'Sales',
      'Designation': 'Branch Manager', 'Branch': 'ANDHRA PRADESH',
      'Sub branch': 'Vijayawada', 'Attendance date': '2026-03-31',
      'Working hour': '08:00', 'Shift code': 'GN- KOL',
      'Shift timings': '10:00 | 18:00', 'Attendance status': 'P | P',
      'Checkin timings': '10:00 | 18:00',
    }],
  },
}

// ── Helpers ─────────────────────────────────────────────────
// Trims leading/trailing whitespace from all string keys and values in a row
function trimRow(row) {
  const result = {}
  for (const key in row) {
    const trimmedKey = typeof key === 'string' ? key.trim() : key
    const v = row[key]
    result[trimmedKey] = typeof v === 'string' ? v.trim() : v
  }
  return result
}
function str(v) {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}
function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}
function excelDate(v) {
  if (!v) return null
  if (typeof v === 'number') {
    // Excel serial date → JS Date
    const d = XLSX.SSF.parse_date_code(v)
    if (!d) return null
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(v).trim()
  if (!s) return null
  // Handle dd-mm-yyyy / dd/mm/yyyy explicitly because Date parsing is inconsistent.
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/)
  if (m) {
    const dd = Number(m[1])
    const mm = Number(m[2])
    const yyyy = Number(m[3])
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
    }
  }
  // Try parse common formats
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function normalizeHeaderText(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function pickByNormalizedHeader(row, aliases = []) {
  if (!row || typeof row !== 'object') return null
  const wanted = new Set(aliases.map(normalizeHeaderText).filter(Boolean))
  if (wanted.size === 0) return null

  for (const key of Object.keys(row)) {
    if (wanted.has(normalizeHeaderText(key))) return row[key]
  }
  return null
}

function normalizeTierKey(v) {
  return String(v || '').trim().toLowerCase()
}

function chunkArray(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function normKey(v) {
  return String(v || '').trim().toLowerCase()
}

function pickParentMasterMappedIsr(parentClaimNo, rows = []) {
  const parent = String(parentClaimNo || '').trim()
  if (!parent || rows.length === 0) return null

  const preferredClaimNo = `${parent}-1`.toLowerCase()
  const preferredRow = rows.find((r) => normKey(r.claim_no) === preferredClaimNo && str(r.mapped_isr_code))
  if (preferredRow) return str(preferredRow.mapped_isr_code)

  const anyMappedRow = rows.find((r) => str(r.mapped_isr_code))
  return anyMappedRow ? str(anyMappedRow.mapped_isr_code) : null
}

async function applyInfluencerClaimMappedIsrRules(uploadRows) {
  const parentClaimNos = [...new Set(uploadRows.map((r) => str(r.parent_claim_no)).filter(Boolean))]
  if (parentClaimNos.length === 0) return uploadRows

  const existingRows = []
  const parentChunks = chunkArray(parentClaimNos, 500)
  for (const parentChunk of parentChunks) {
    const { data, error } = await supabase
      .from('influencer_claim_details')
      .select('parent_claim_no, claim_no, mapped_isr_code')
      .in('parent_claim_no', parentChunk)

    if (error) throw error
    if (Array.isArray(data) && data.length) existingRows.push(...data)
  }

  if (existingRows.length === 0) {
    // Parent claim not present in DB at all, so use uploaded mapped_isr_code.
    return uploadRows
  }

  const byParent = new Map()
  const byClaim = new Map()

  for (const row of existingRows) {
    const parentKey = normKey(row.parent_claim_no)
    const claimKey = normKey(row.claim_no)
    if (!byParent.has(parentKey)) byParent.set(parentKey, [])
    byParent.get(parentKey).push(row)
    if (claimKey && !byClaim.has(claimKey)) byClaim.set(claimKey, row)
  }

  const parentMasterMapped = new Map()
  for (const [parentKey, rows] of byParent.entries()) {
    parentMasterMapped.set(parentKey, pickParentMasterMappedIsr(rows[0]?.parent_claim_no, rows))
  }

  return uploadRows.map((row) => {
    const parentKey = normKey(row.parent_claim_no)
    const claimKey = normKey(row.claim_no)

    const parentMapped = parentMasterMapped.get(parentKey)
    if (parentMapped) {
      return { ...row, mapped_isr_code: parentMapped }
    }

    const existingClaim = byClaim.get(claimKey)
    const existingClaimMapped = str(existingClaim?.mapped_isr_code)
    if (existingClaimMapped) {
      return { ...row, mapped_isr_code: existingClaimMapped }
    }

    return row
  })
}

function parseMonthlyAttendanceRows(ws) {
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  if (!Array.isArray(matrix) || matrix.length === 0) return []

  const headerIdx = matrix.findIndex((row, idx) => {
    if (idx > 30 || !Array.isArray(row)) return false
    const normalized = row.map(normalizeHeaderText).filter(Boolean)
    const hasEmployee = normalized.some(h =>
      ['employeecode', 'employeeid', 'employeeno', 'empcode', 'employeecodeid'].includes(h)
    )
    const hasAttendanceDate = normalized.some(h =>
      ['attendancedate', 'date', 'attendanceon'].includes(h)
    )
    return hasEmployee && hasAttendanceDate
  })

  if (headerIdx === -1) return []

  const headers = (matrix[headerIdx] || []).map(h => (h === null || h === undefined ? '' : String(h).trim()))
  const out = []

  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i]
    if (!Array.isArray(row)) continue
    const obj = {}
    let hasAnyValue = false
    headers.forEach((h, colIdx) => {
      if (!h) return
      const val = row[colIdx] ?? null
      if (val !== null && val !== '') hasAnyValue = true
      obj[h] = val
    })
    if (hasAnyValue) out.push(obj)
  }

  return out
}

const BATCH_SIZE = 500

// ── Component ────────────────────────────────────────────────
function ExcelUpload() {
  const { user } = useAuth()
  const fileInputRef = useRef(null)
  const { showNotification } = useNotification()

  const [selectedType, setSelectedType] = useState('')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null) // { inserted, skipped, errors }
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessLoading] = useState(false)

  // Load recent upload sessions on mount
  useEffect(() => {
    fetchSessions()
  }, [])

  const fetchSessions = async () => {
    setSessLoading(true)
    const { data } = await supabase
      .from('excel_upload_sessions')
      .select('*')
      .order('upload_date', { ascending: false })
      .limit(30)
    if (data) setSessions(data)
    setSessLoading(false)
  }

  const handleFileChange = (e) => {
    const f = e.target.files[0]
    if (!f) return
    setFile(f)
    setResult(null)
  }

  const handleUpload = async () => {
    if (!selectedType) return showNotification('Please select a sheet type.', 'warning')
    if (!file) return showNotification('Please choose an Excel file.', 'warning')

    const config = SHEET_CONFIGS[selectedType]
    setUploading(true)
    setProgress(0)
    setResult(null)

    try {
      // 1. Parse Excel
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rawRows = selectedType === 'monthly_attendance'
        ? parseMonthlyAttendanceRows(ws)
        : XLSX.utils.sheet_to_json(ws, { defval: null })

      if (rawRows.length === 0) {
        setResult({ inserted: 0, skipped: 0, errors: ['File is empty or has no data rows.'] })
        setUploading(false)
        return
      }

      // 2. Create upload session record
      const { data: sessionData, error: sessionError } = await supabase
        .from('excel_upload_sessions')
        .insert({
          sheet_type: selectedType,
          file_name: file.name,
          uploaded_by: user?.id || null,
          rows_inserted: 0,
          rows_skipped: 0,
          status: 'partial',
        })
        .select()
        .single()
      if (sessionError) throw sessionError

      const sessionId = sessionData.id
      let totalInserted = 0
      let totalSkipped = 0
      const errors = []

      // 3. Map rows (trim all string values/keys before mapping)
      const allMappedRows = rawRows
        .map(r => {
          const mapped = config.mapRow(trimRow(r))
          if (!mapped) return null
          return { ...mapped, upload_session_id: sessionId }
        })
        .filter(Boolean)

      // Deduplicate upload rows before DB write.
      // For sheets with a uniqueKey, last row wins.
      const mappedRows = config.uniqueKey
          ? Object.values(
              allMappedRows.reduce((acc, row) => { acc[row[config.uniqueKey]] = row; return acc }, {})
            )
          : allMappedRows

      if (mappedRows.length === 0) {
        const msg = 'No valid rows found. Please verify required columns (e.g. Employee Code, Attendance date) and date format.'
        await supabase
          .from('excel_upload_sessions')
          .update({
            rows_inserted: 0,
            rows_skipped: rawRows.length,
            status: 'failed',
            error_message: msg,
          })
          .eq('id', sessionId)

        setResult({ inserted: 0, skipped: rawRows.length, errors: [msg] })
        await fetchSessions()
        setUploading(false)
        return
      }

      // 4. Apply sheet-specific rules before DB write.
      const rowsToWrite = selectedType === 'influencer_claim'
        ? await applyInfluencerClaimMappedIsrRules(mappedRows)
        : mappedRows

      // 5. Upsert/insert in batches
      const batches = Math.ceil(rowsToWrite.length / BATCH_SIZE)
      for (let i = 0; i < batches; i++) {
        const batch = rowsToWrite.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)

        let error
        if (config.uniqueKey) {
          // Upsert: update existing rows with same unique key, insert new
          ;({ error } = await supabase
            .from(config.table)
            .upsert(batch, { onConflict: config.uniqueKey, ignoreDuplicates: false }))
        } else {
          // No unique key: plain insert (visit reports, task reports — always new rows)
          ;({ error } = await supabase.from(config.table).insert(batch))
        }

        if (error) {
          errors.push(`Batch ${i + 1}: ${error.message}`)
          totalSkipped += batch.length
        } else {
          totalInserted += batch.length
        }

        setProgress(Math.round(((i + 1) / batches) * 100))
      }

      // 6. Update session with final counts
      await supabase
        .from('excel_upload_sessions')
        .update({
          rows_inserted: totalInserted,
          rows_skipped: totalSkipped,
          status: errors.length === 0 ? 'success' : totalInserted > 0 ? 'partial' : 'failed',
          error_message: errors.length ? errors.slice(0, 3).join(' | ') : null,
        })
        .eq('id', sessionId)

      setResult({ inserted: totalInserted, skipped: totalSkipped, errors })
      await fetchSessions()

      // Reset file input
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      console.error('Upload error:', err)
      setResult({ inserted: 0, skipped: 0, errors: [err.message] })
    } finally {
      setUploading(false)
    }
  }

  const formatDate = (d) => {
    if (!d) return '—'
    return new Date(d).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const statusColor = (s) => ({ success: '#10B981', partial: '#F59E0B', failed: '#EF4444' }[s] || '#6B7280')

  const downloadFormat = (type) => {
    const tpl = SHEET_TEMPLATES[type]
    if (!tpl) return
    const ws = XLSX.utils.json_to_sheet(tpl.rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, tpl.sheetName)
    XLSX.writeFile(wb, tpl.fileName)
  }

  return (
    <main className="excel-upload-main">
      <section className="excel-upload-header">
        <div>
          <h2>Sales Data Upload</h2>
          <p>Upload daily Excel reports from the sales team</p>
        </div>
      </section>

      {/* Upload Card */}
      <div className="upload-card">
        <h3><i className="fa-solid fa-upload"></i> Upload Excel File</h3>

        {/* Sheet type selector */}
        <div className="upload-form">
          <div className="form-group">
            <label>Sheet Type *</label>
            <div className="sheet-type-grid">
              {Object.entries(SHEET_CONFIGS).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  className={`sheet-type-btn${selectedType === key ? ' selected' : ''}`}
                  onClick={() => { setSelectedType(key); setResult(null); setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                >
                  <i className={cfg.icon}></i>
                  <span>{cfg.label}</span>
                </button>
              ))}
            </div>
          </div>

          {selectedType && (
            <div className="form-group">
              <label>Choose File *</label>
              <button
                type="button"
                className="btn-download-format"
                onClick={() => downloadFormat(selectedType)}
              >
                <i className="fa-solid fa-download"></i>
                Download Format (.xlsx)
              </button>
              <div className="file-drop-zone" onClick={() => fileInputRef.current?.click()}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                {file ? (
                  <div className="file-selected">
                    <i className="fa-solid fa-file-excel"></i>
                    <span>{file.name}</span>
                    <small>{(file.size / 1024).toFixed(1)} KB</small>
                  </div>
                ) : (
                  <div className="file-placeholder">
                    <i className="fa-solid fa-cloud-arrow-up"></i>
                    <span>Click to browse .xlsx / .xls</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Progress */}
          {uploading && (
            <div className="progress-wrap">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }}></div>
              </div>
              <span>{progress}%</span>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className={`upload-result ${result.errors.length === 0 ? 'success' : result.inserted > 0 ? 'partial' : 'failed'}`}>
              <div className="result-stats">
                <span><i className="fa-solid fa-check-circle"></i> {result.inserted} rows uploaded</span>
                {result.skipped > 0 && <span><i className="fa-solid fa-triangle-exclamation"></i> {result.skipped} skipped</span>}
              </div>
              {result.errors.length > 0 && (
                <ul className="result-errors">
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </div>
          )}

          <button
            className="btn-upload"
            onClick={handleUpload}
            disabled={uploading || !file || !selectedType}
          >
            {uploading
              ? <><i className="fa-solid fa-spinner fa-spin"></i> Uploading…</>
              : <><i className="fa-solid fa-upload"></i> Upload</>}
          </button>
        </div>
      </div>

      {/* Recent Upload Sessions */}
      <div className="sessions-card">
        <div className="sessions-header">
          <h3><i className="fa-solid fa-clock-rotate-left"></i> Recent Uploads</h3>
          <button className="btn-refresh" onClick={fetchSessions} disabled={sessionsLoading}>
            <i className={`fa-solid fa-rotate-right ${sessionsLoading ? 'fa-spin' : ''}`}></i>
          </button>
        </div>

        {sessions.length === 0 ? (
          <p className="no-sessions">No uploads yet.</p>
        ) : (
          <div className="sessions-table-wrap">
            <table className="sessions-table">
              <thead>
                <tr>
                  <th>Sheet Type</th>
                  <th>File Name</th>
                  <th>Date</th>
                  <th>Rows</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id}>
                    <td>
                      <span className="sheet-label">
                        <i className={SHEET_CONFIGS[s.sheet_type]?.icon || 'fa-solid fa-file'}></i>
                        {SHEET_CONFIGS[s.sheet_type]?.label || s.sheet_type}
                      </span>
                    </td>
                    <td className="file-name-cell">{s.file_name}</td>
                    <td>{formatDate(s.upload_date)}</td>
                    <td>{s.rows_inserted ?? '—'}</td>
                    <td>
                      <span className="status-pill" style={{ background: statusColor(s.status) + '22', color: statusColor(s.status) }}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}

export default ExcelUpload
