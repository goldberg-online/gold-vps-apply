-- Weekly feeding / bus register: only pupils put on the list appear.

create table if not exists service_enrollments (
  id text primary key,
  school_id text not null references schools(id),
  student_id text not null references students(id),
  on_feeding boolean not null default false,
  on_bus boolean not null default false,
  feeding_rate numeric not null default 0,
  bus_rate numeric not null default 0,
  active boolean not null default true,
  enrolled_on date,
  enrolled_by text,
  unique (school_id, student_id)
);
create index if not exists service_enrollments_school_idx on service_enrollments (school_id);

alter table service_collections add column if not exists collected_on date;

update service_collections
set collected_on = collected_at::date
where collected_on is null;
