alter table students add column if not exists enrolled_on date;
update students set enrolled_on = created_at::date where enrolled_on is null;
