import type { getSql } from "@/lib/db";

type Sql = Awaited<ReturnType<typeof getSql>>;

export async function ensureCumulativeTable(sql: Sql) {
  await sql.query(`
    create table if not exists cumulative_records (
      id text primary key,
      school_id text not null,
      student_id text not null unique,
      opened_on date not null default current_date,
      opened_class text,
      created_at timestamptz not null default now()
    )
  `);
  await sql.query(`create index if not exists cumulative_records_school_idx on cumulative_records (school_id)`);
}

export async function attachCumulativeCard(
  sql: Sql,
  opts: { schoolId: string; studentId: string; className: string; openedOn: string },
) {
  await ensureCumulativeTable(sql);
  await sql.query(
    `insert into cumulative_records (id, school_id, student_id, opened_on, opened_class)
     values ($1,$2,$3,$4,$5)
     on conflict (student_id) do nothing`,
    [crypto.randomUUID(), opts.schoolId, opts.studentId, opts.openedOn, opts.className],
  );
}

export async function backfillCumulativeCards(sql: Sql, schoolId: string) {
  await ensureCumulativeTable(sql);
  const missing = await sql.query<{ id: string; class_name: string; enrolled_on: string }>(
    `select s.id, s.class_name,
            coalesce(s.enrolled_on::text, s.created_at::date::text) as enrolled_on
     from students s
     left join cumulative_records c on c.student_id = s.id
     where s.school_id = $1 and c.id is null`,
    [schoolId],
  );
  for (const s of missing) {
    await attachCumulativeCard(sql, {
      schoolId,
      studentId: s.id,
      className: s.class_name,
      openedOn: s.enrolled_on,
    });
  }
}
