create table if not exists public.employee_id_change_log (
  id bigint generated always as identity primary key,
  employee_name text,
  old_employee_id text not null,
  new_employee_id text not null,
  date_of_change date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_employee_id_change_log_old_employee_id
  on public.employee_id_change_log (old_employee_id);

create index if not exists idx_employee_id_change_log_new_employee_id
  on public.employee_id_change_log (new_employee_id);

create index if not exists idx_employee_id_change_log_date_of_change
  on public.employee_id_change_log (date_of_change desc);
