create table if not exists public.skill_matrix_reviews (
  id bigint generated always as identity primary key,
  employee_user_id uuid not null references public.users (id) on delete cascade,
  employee_code text,
  employee_name text,
  department text,
  designation text,
  branch text,
  reviewer_user_id uuid references public.users (id) on delete set null,
  reviewer_code text,
  reviewer_name text,
  rating_period text not null,
  ratings jsonb not null default '{}'::jsonb,
  average_rating numeric(3, 1),
  status text,
  retraining_required boolean not null default false,
  retraining_parameters text[],
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One review per employee per rating period; a re-submit updates that row
create unique index if not exists uq_skill_matrix_reviews_employee_period
  on public.skill_matrix_reviews (employee_user_id, rating_period);

create index if not exists idx_skill_matrix_reviews_employee
  on public.skill_matrix_reviews (employee_user_id);

create index if not exists idx_skill_matrix_reviews_reviewer
  on public.skill_matrix_reviews (reviewer_user_id);

create index if not exists idx_skill_matrix_reviews_created_at
  on public.skill_matrix_reviews (created_at desc);
