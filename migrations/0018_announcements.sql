create table if not exists announcements (
  id text primary key,
  school_id text not null,
  title text not null,
  body text not null,
  audience text not null default 'ALL',
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists announcements_school_idx on announcements (school_id, created_at desc);
