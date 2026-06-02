alter table profiles add column grade_preference text not null default 'font'
  check (grade_preference in ('font', 'v_scale'));
