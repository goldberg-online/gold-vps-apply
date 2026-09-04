create table if not exists cumulative_records (
  id text primary key,
  school_id text not null,
  student_id text not null unique,
  opened_on date not null default current_date,
  opened_class text,
  created_at timestamptz not null default now()
);
create index if not exists cumulative_records_school_idx on cumulative_records (school_id);
