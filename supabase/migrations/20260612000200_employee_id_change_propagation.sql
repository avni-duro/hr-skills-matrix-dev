create or replace function public.propagate_employee_id_change(
  p_old_employee_id text,
  p_new_employee_id text,
  p_date_of_change date,
  p_employee_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '300s'
as $$
declare
  v_old text := btrim(coalesce(p_old_employee_id, ''));
  v_new text := btrim(coalesce(p_new_employee_id, ''));
  v_name text := nullif(btrim(coalesce(p_employee_name, '')), '');
  v_pattern text;

  c_claim integer := 0;
  c_enroll integer := 0;
  c_visit integer := 0;
  c_lead_details integer := 0;
  c_lead_task integer := 0;
  c_m_enroll integer := 0;
  c_tier_upgrade integer := 0;
  c_war integer := 0;
  c_att integer := 0;

  c_log integer := 0;
  c_user integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role in ('admin', 'super_admin')
  ) then
    raise exception 'Only admin or super_admin can run this action';
  end if;

  if v_old = '' or v_new = '' then
    raise exception 'Old Employee ID and New Employee ID are required';
  end if;

  if lower(v_old) = lower(v_new) then
    raise exception 'Old Employee ID and New Employee ID cannot be the same';
  end if;

  if p_date_of_change is null then
    raise exception 'Date of change is required';
  end if;

  if v_name is null then
    select u.full_name
      into v_name
    from public.users u
    where u.employee_id = v_old
    order by u.created_at desc
    limit 1;
  end if;

  -- Build regex pattern once for composite fields (CODE | Name format)
  v_pattern := '^\s*' || regexp_replace(v_old, '([\\.^$|()\[\]{}*+?\\-])', '\\\1', 'g') || '(\s*\|.*)$';

  update public.influencer_claim_details
     set mapped_isr_code = v_new
   where btrim(mapped_isr_code) = v_old;
  get diagnostics c_claim = row_count;

  update public.influencer_enrollment_details
     set enrolled_by_dso_code = v_new
   where btrim(enrolled_by_dso_code) = v_old;
  get diagnostics c_enroll = row_count;

  update public.influencer_visit_reports
     set emp_login = v_new
   where emp_login = v_old OR BTRIM(emp_login) = v_old OR BTRIM(emp_login) = BTRIM(v_old);
  get diagnostics c_visit = row_count;

  update public.lead_details_reports
     set lead_created_by = regexp_replace(
       lead_created_by,
       v_pattern,
       v_new || '\\1'
     )
   where lead_created_by ~ v_pattern;
  get diagnostics c_lead_details = row_count;

  update public.lead_task_reports
     set task_created_by_dso_code = v_new
   where btrim(task_created_by_dso_code) = v_old;
  get diagnostics c_lead_task = row_count;

  update public.m_enrollment_details
     set mapped_isr = regexp_replace(
       mapped_isr,
       v_pattern,
       v_new || '\\1'
     )
   where mapped_isr ~ v_pattern;
  get diagnostics c_m_enroll = row_count;

  update public.tier_upgrade_performance_report
     set mapped_isr = regexp_replace(
       mapped_isr,
       v_pattern,
       v_new || '\\1'
     )
   where mapped_isr ~ v_pattern;
  get diagnostics c_tier_upgrade = row_count;

  update public.telecalling_influencer_wartask
     set mapped_isr_code = v_new
   where btrim(mapped_isr_code) = v_old;
  get diagnostics c_war = row_count;

  update public.monthly_attendance_report
     set employee_code = v_new
   where btrim(employee_code) = v_old;
  get diagnostics c_att = row_count;

  insert into public.employee_id_change_log (
    employee_name,
    old_employee_id,
    new_employee_id,
    date_of_change
  )
  values (
    coalesce(v_name, 'Unknown'),
    v_old,
    v_new,
    p_date_of_change
  );
  get diagnostics c_log = row_count;

  return jsonb_build_object(
    'success', true,
    'old_employee_id', v_old,
    'new_employee_id', v_new,
    'date_of_change', p_date_of_change,
    'updated_counts', jsonb_build_object(
      'influencer_claim_details_mapped_isr_code', c_claim,
      'influencer_enrollment_details_enrolled_by_dso_code', c_enroll,
      'influencer_visit_reports_emp_login', c_visit,
      'lead_details_reports_lead_created_by', c_lead_details,
      'lead_task_reports_task_created_by_dso_code', c_lead_task,
      'm_enrollment_details_mapped_isr', c_m_enroll,
      'tier_upgrade_performance_report_mapped_isr', c_tier_upgrade,
      'telecalling_influencer_wartask_mapped_isr_code', c_war,
      'monthly_attendance_report_employee_code', c_att,
      'employee_id_change_log_inserted', c_log
    )
  );
end;
$$;

revoke all on function public.propagate_employee_id_change(text, text, date, text) from public;
grant execute on function public.propagate_employee_id_change(text, text, date, text) to authenticated;
