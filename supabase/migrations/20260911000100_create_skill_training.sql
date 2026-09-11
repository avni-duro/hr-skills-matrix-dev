-- Skill based retraining
-- Nothing existing is changed or removed. Three new tables only.
-- videos, quizzes, questions, user_quiz_results and user_video_progress are reused as they are.

-- 1. Skill master: the 10 parameters the reporting manager rates
create table if not exists public.skill_master (
  id uuid primary key default gen_random_uuid(),
  skill_key text not null unique,
  skill_name text not null,
  skill_order int not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.skill_master (skill_key, skill_name, skill_order) values
  ('productKnowledge',     'Product Knowledge',               1),
  ('leadConversion',       'Lead Conversion',                 2),
  ('dmiUpgradation',       'DMI Upgradation',                 3),
  ('siteWorking',          'Site Working',                    4),
  ('loyaltyAwareness',     'Awareness of Loyalty Programme',  5),
  ('sfaApp',               'SFA APP',                         6),
  ('complaintHandling',    'Complaint Handling',              7),
  ('marketKnowledge',      'Market Knowledge',                8),
  ('competitorKnowledge',  'Competitor Knowledge',            9),
  ('dmiManagement',        'DMI Management',                 10)
on conflict (skill_key) do nothing;

-- 2. Which videos belong to a skill. Up to 3 videos per skill, all mandatory by default.
create table if not exists public.skill_video_map (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.skill_master (id) on delete cascade,
  video_id uuid not null references public.videos (id) on delete cascade,
  video_order int not null default 1,
  is_mandatory boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (skill_id, video_id)
);

create index if not exists idx_skill_video_map_skill on public.skill_video_map (skill_id);
create index if not exists idx_skill_video_map_video on public.skill_video_map (video_id);

-- 3. What each employee has to watch, and how far they have reached.
-- One row per employee per skill per video, created when a review rates that skill below the cut-off.
create table if not exists public.employee_skill_training (
  id uuid primary key default gen_random_uuid(),
  employee_user_id uuid not null references public.users (id) on delete cascade,
  skill_id uuid not null references public.skill_master (id) on delete cascade,
  video_id uuid not null references public.videos (id) on delete cascade,
  review_id bigint references public.skill_matrix_reviews (id) on delete set null,
  rating_given int,
  assigned_by uuid references public.users (id) on delete set null,
  assigned_on timestamptz not null default now(),
  video_completed boolean not null default false,
  video_completed_at timestamptz,
  assessment_score numeric(5, 2),
  assessment_passed boolean not null default false,
  assessment_attempts int not null default 0,
  last_attempt_at timestamptz,
  status text not null default 'pending',
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (employee_user_id, skill_id, video_id, review_id)
);

create index if not exists idx_employee_skill_training_employee
  on public.employee_skill_training (employee_user_id);

create index if not exists idx_employee_skill_training_review
  on public.employee_skill_training (review_id);

create index if not exists idx_employee_skill_training_status
  on public.employee_skill_training (status);

-- status values used by the app:
--   pending    - video not finished yet
--   video_done - video finished, assessment not cleared yet
--   completed  - assessment cleared (score at or above the quiz passing score)

-- ---------------------------------------------------------------
-- Example mapping (run separately, after checking the module name).
-- Maps every video of one module to one skill, keeping the video order.
--
-- insert into public.skill_video_map (skill_id, video_id, video_order)
-- select s.id, v.id, coalesce(v.video_order, 1)
-- from public.skill_master s
-- join public.modules m on m.title = 'DURO Superstar'
-- join public.videos v on v.module_id = m.id
-- where s.skill_key = 'loyaltyAwareness'
-- on conflict (skill_id, video_id) do nothing;
-- ---------------------------------------------------------------
