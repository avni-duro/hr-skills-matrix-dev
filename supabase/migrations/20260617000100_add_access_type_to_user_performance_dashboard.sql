alter table if exists public.user_performance_dashboard
  add column if not exists access_type text[];

update public.user_performance_dashboard
set access_type = array['DGO']
where access_type is null;

alter table public.user_performance_dashboard
  alter column access_type set default array['DGO'];

alter table public.user_performance_dashboard
  alter column access_type set not null;

alter table public.user_performance_dashboard
  drop constraint if exists user_performance_dashboard_access_type_check;

alter table public.user_performance_dashboard
  add constraint user_performance_dashboard_access_type_check
  check (
    access_type is not null
    and array_length(access_type, 1) > 0
    and access_type <@ array['DGO', 'ASM', 'Calculator']::text[]
  );

create index if not exists idx_user_performance_dashboard_access_type
  on public.user_performance_dashboard using gin (access_type);
