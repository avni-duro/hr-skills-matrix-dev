-- Drop the old function
DROP FUNCTION IF EXISTS propagate_employee_id_change(TEXT, TEXT, DATE, TEXT);

-- Recreate the function with table selection support
CREATE OR REPLACE FUNCTION propagate_employee_id_change(
  p_old_employee_id TEXT,
  p_new_employee_id TEXT,
  p_date_of_change DATE,
  p_employee_name TEXT,
  p_selected_tables TEXT[] DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_old TEXT;
  v_new TEXT;
  c_claim INT := 0;
  c_enroll INT := 0;
  c_visit INT := 0;
  c_lead_details INT := 0;
  c_lead_task INT := 0;
  c_m_enroll INT := 0;
  c_tier_upgrade INT := 0;
  c_tele_influencer INT := 0;
  c_monthly_attendance INT := 0;
  v_selected_tables TEXT[];
BEGIN
  v_old := p_old_employee_id;
  v_new := p_new_employee_id;
  
  -- Default to all tables if none selected
  v_selected_tables := COALESCE(p_selected_tables, ARRAY[
    'influencer_claim_details',
    'influencer_enrollment_details',
    'influencer_visit_reports',
    'lead_details_reports',
    'lead_task_reports',
    'm_enrollment_details',
    'tier_upgrade_performance_report',
    'telecalling_influencer_wartask',
    'monthly_attendance_report'
  ]);

  -- Update influencer_claim_details (if selected)
  IF 'influencer_claim_details' = ANY(v_selected_tables) THEN
    update public.influencer_claim_details
       set mapped_isr_code = v_new
     where btrim(mapped_isr_code) = v_old;
    get diagnostics c_claim = row_count;
  END IF;

  -- Update influencer_enrollment_details (if selected)
  IF 'influencer_enrollment_details' = ANY(v_selected_tables) THEN
    update public.influencer_enrollment_details
       set enrolled_by_dso_code = v_new
     where btrim(enrolled_by_dso_code) = v_old;
    get diagnostics c_enroll = row_count;
  END IF;

  -- Update influencer_visit_reports (if selected, case-insensitive and trimmed)
  IF 'influencer_visit_reports' = ANY(v_selected_tables) THEN
    update public.influencer_visit_reports
       set emp_login = v_new
     where LOWER(BTRIM(emp_login)) = LOWER(v_old);
    get diagnostics c_visit = row_count;
  END IF;

  -- Update lead_details_reports (if selected)
  IF 'lead_details_reports' = ANY(v_selected_tables) THEN
    update public.lead_details_reports
       set lead_created_by = v_new
     where btrim(lead_created_by) = v_old;
    get diagnostics c_lead_details = row_count;
  END IF;

  -- Update lead_task_reports (if selected)
  IF 'lead_task_reports' = ANY(v_selected_tables) THEN
    update public.lead_task_reports
       set task_created_by_dso_code = v_new
     where btrim(task_created_by_dso_code) = v_old;
    get diagnostics c_lead_task = row_count;
  END IF;

  -- Update m_enrollment_details (if selected)
  IF 'm_enrollment_details' = ANY(v_selected_tables) THEN
    update public.m_enrollment_details
       set mapped_isr = v_new
     where btrim(mapped_isr) = v_old;
    get diagnostics c_m_enroll = row_count;
  END IF;

  -- Update tier_upgrade_performance_report (if selected)
  IF 'tier_upgrade_performance_report' = ANY(v_selected_tables) THEN
    update public.tier_upgrade_performance_report
       set mapped_isr = v_new
     where btrim(mapped_isr) = v_old;
    get diagnostics c_tier_upgrade = row_count;
  END IF;

  -- Update telecalling_influencer_wartask (if selected)
  IF 'telecalling_influencer_wartask' = ANY(v_selected_tables) THEN
    update public.telecalling_influencer_wartask
       set mapped_isr_code = v_new
     where btrim(mapped_isr_code) = v_old;
    get diagnostics c_tele_influencer = row_count;
  END IF;

  -- Update monthly_attendance_report (if selected)
  IF 'monthly_attendance_report' = ANY(v_selected_tables) THEN
    update public.monthly_attendance_report
       set employee_code = v_new
     where btrim(employee_code) = v_old;
    get diagnostics c_monthly_attendance = row_count;
  END IF;

  -- Return summary
  RETURN json_build_object(
    'old_employee_id', v_old,
    'new_employee_id', v_new,
    'date_of_change', p_date_of_change,
    'employee_name', p_employee_name,
    'updated_counts', json_build_object(
      'influencer_claim_details_mapped_isr_code', c_claim,
      'influencer_enrollment_details_enrolled_by_dso_code', c_enroll,
      'influencer_visit_reports_emp_login', c_visit,
      'lead_details_reports_lead_created_by', c_lead_details,
      'lead_task_reports_task_created_by_dso_code', c_lead_task,
      'm_enrollment_details_mapped_isr', c_m_enroll,
      'tier_upgrade_performance_report_mapped_isr', c_tier_upgrade,
      'telecalling_influencer_wartask_mapped_isr_code', c_tele_influencer,
      'monthly_attendance_report_employee_code', c_monthly_attendance
    )
  );
END;
$$ LANGUAGE plpgsql;
