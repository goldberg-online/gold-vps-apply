import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  GHANA_CLASS_LEVELS,
  PERIODS,
  TERMS,
  academicYearFromDate,
  academicYearRange,
  nextClass,
  num,
  termFromDate,
} from "@/lib/ghana";
import {
  canAcademic,
  canMarks,
  ensureStaff,
  teacherLoad,
  writeAudit,
} from "@/lib/school";
import { attachCumulativeCard } from "@/lib/cumulative-store";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function ensureCalendar(sql: Awaited<ReturnType<typeof getSql>>, schoolId: string) {
  const yearName = academicYearFromDate(todayIso());
  const range = academicYearRange(yearName);
  let year = await sql.query<{ id: string; name: string; start_date: string; end_date: string; is_current: boolean }>(
    `select id, name, start_date, end_date, is_current from academic_years where school_id = $1 and name = $2`,
    [schoolId, yearName],
  );
  if (!year[0]) {
    const id = crypto.randomUUID();
    await sql.query(
      `insert into academic_years (id, school_id, name, start_date, end_date, is_current)
       values ($1,$2,$3,$4,$5,true)`,
      [id, schoolId, yearName, range.from, range.to],
    );
    await sql.query(`update academic_years set is_current = false where school_id = $1 and id <> $2`, [
      schoolId,
      id,
    ]);
    const y = Number(yearName.slice(0, 4));
    const terms = [
      { name: "1st Term", start: `${y}-09-01`, end: `${y}-12-15` },
      { name: "2nd Term", start: `${y + 1}-01-08`, end: `${y + 1}-04-15` },
      { name: "3rd Term", start: `${y + 1}-05-02`, end: `${y + 1}-08-15` },
    ];
    const current = termFromDate(todayIso());
    for (const t of terms) {
      await sql.query(
        `insert into academic_terms (id, school_id, year_id, name, start_date, end_date, is_current, status)
         values ($1,$2,$3,$4,$5,$6,$7,'OPEN')`,
        [crypto.randomUUID(), schoolId, id, t.name, t.start, t.end, t.name === current],
      );
    }
    year = await sql.query(`select id, name, start_date, end_date, is_current from academic_years where id = $1`, [id]);
  }
  return year[0];
}

export const getCalendar = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    await ensureCalendar(sql, me.school_id);
    const years = await sql.query<{
      id: string;
      name: string;
      start_date: string;
      end_date: string;
      is_current: boolean;
    }>(
      `select id, name, start_date, end_date, is_current from academic_years
       where school_id = $1 order by name desc`,
      [me.school_id],
    );
    const terms = await sql.query<{
      id: string;
      year_id: string;
      name: string;
      start_date: string;
      end_date: string;
      is_current: boolean;
      status: string;
    }>(
      `select id, year_id, name, start_date, end_date, is_current, status
       from academic_terms where school_id = $1 order by start_date`,
      [me.school_id],
    );
    return { years, terms, me };
  });

export const saveTermDates = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string(),
      startDate: z.string().min(8),
      endDate: z.string().min(8),
      isCurrent: z.boolean().optional(),
      status: z.enum(["OPEN", "CLOSED"]).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canAcademic(me.role)) throw new Error("School Admin or Super Admin only");
    if (data.isCurrent) {
      await sql.query(`update academic_terms set is_current = false where school_id = $1`, [me.school_id]);
    }
    await sql.query(
      `update academic_terms set start_date = $1, end_date = $2, status = coalesce($3, status),
         is_current = coalesce($4, is_current)
       where id = $5 and school_id = $6`,
      [data.startDate, data.endDate, data.status ?? null, data.isCurrent ?? null, data.id, me.school_id],
    );
    await writeAudit(sql, me, "CALENDAR", "term", data.id, `Updated term dates ${data.startDate}–${data.endDate}`);
    return { ok: true };
  });

export const setCurrentYear = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canAcademic(me.role)) throw new Error("School Admin or Super Admin only");
    await sql.query(`update academic_years set is_current = false where school_id = $1`, [me.school_id]);
    await sql.query(`update academic_years set is_current = true where id = $1 and school_id = $2`, [
      data.id,
      me.school_id,
    ]);
    await writeAudit(sql, me, "CALENDAR", "year", data.id, "Set current academic year");
    return { ok: true };
  });

export const promoteClass = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      fromClass: z.string().min(1),
      studentIds: z.array(z.string()).min(1),
      decision: z.enum(["PROMOTED", "REPEATED", "GRADUATED"]),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canAcademic(me.role)) throw new Error("School Admin or Super Admin only");
    const yearName = academicYearFromDate(todayIso());
    const ladder = nextClass(data.fromClass);
    let moved = 0;
    for (const id of data.studentIds) {
      const st = await sql.query<{ id: string; class_name: string; first_name: string; last_name: string }>(
        `select id, class_name, first_name, last_name from students where id = $1 and school_id = $2`,
        [id, me.school_id],
      );
      if (!st[0] || st[0].class_name !== data.fromClass) continue;
      let toClass = st[0].class_name;
      let status = "ACTIVE";
      if (data.decision === "REPEATED") {
        toClass = st[0].class_name;
        status = "ACTIVE";
      } else if (data.decision === "GRADUATED" || ladder.graduated) {
        toClass = "JHS 3";
        status = "GRADUATED";
      } else {
        toClass = ladder.next;
        status = "ACTIVE";
      }
      await sql.query(`update students set class_name = $1, status = $2 where id = $3 and school_id = $4`, [
        toClass,
        status,
        id,
        me.school_id,
      ]);
      await sql.query(
        `insert into promotions (id, school_id, student_id, from_class, to_class, year_name, decision, recorded_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [crypto.randomUUID(), me.school_id, id, data.fromClass, toClass, yearName, data.decision, me.user_id],
      );
      moved += 1;
    }
    await writeAudit(
      sql,
      me,
      "PROMOTE",
      "class",
      data.fromClass,
      `${data.decision} ${moved} from ${data.fromClass}`,
    );
    return { ok: true, moved };
  });

export const listPromotions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canAcademic(me.role)) throw new Error("School Admin or Super Admin only");
    return sql.query<{
      id: string;
      from_class: string;
      to_class: string;
      year_name: string;
      decision: string;
      created_at: string;
      student: string;
    }>(
      `select p.id, p.from_class, p.to_class, p.year_name, p.decision, p.created_at::text,
              s.first_name || ' ' || s.last_name as student
       from promotions p join students s on s.id = p.student_id
       where p.school_id = $1 order by p.created_at desc limit 80`,
      [me.school_id],
    );
  });

export const getReportCard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      studentId: z.string(),
      term: z.enum(["1st Term", "2nd Term", "3rd Term"]),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    const st = await sql.query<{
      id: string;
      admission_no: string;
      first_name: string;
      last_name: string;
      class_name: string;
      parent_email: string | null;
      photo_url: string | null;
      gender: string | null;
    }>(
      `select id, admission_no, first_name, last_name, class_name, parent_email, photo_url, gender
       from students where id = $1 and school_id = $2`,
      [data.studentId, me.school_id],
    );
    if (!st[0]) throw new Error("Student not found");
    if (me.role === "PARENT") {
      const email = (me.email || "").toLowerCase();
      if (!st[0].parent_email || st[0].parent_email.toLowerCase() !== email) {
        throw new Error("You can only open your own child's report");
      }
    } else if (me.role === "TEACHER") {
      const hit = await sql.query<{ id: string }>(
        `select id from class_subjects where school_id = $1 and (teacher_user_id = $2 or teacher_user_id = $3) and class_name = $4 limit 1`,
        [me.school_id, me.user_id, me.id, st[0].class_name],
      );
      if (!hit[0]) throw new Error("Not assigned to this class");
    } else if (me.role !== "SUPER_ADMIN" && me.role !== "SCHOOL_ADMIN") {
      throw new Error("No access to report cards");
    }
    const yearName = academicYearFromDate(todayIso());
    const marks = await sql.query<{ subject: string; score: string }>(
      `select subject, score::text from student_marks
       where school_id = $1 and student_id = $2 and term = $3 order by subject`,
      [me.school_id, data.studentId, data.term],
    );
    const att = await sql.query<{ status: string; n: number }>(
      `select status, count(*)::int as n from attendance
       where school_id = $1 and student_id = $2 group by status`,
      [me.school_id, data.studentId],
    );
    const comment = await sql.query<{ comment: string }>(
      `select comment from report_comments
       where school_id = $1 and student_id = $2 and year_name = $3 and term = $4`,
      [me.school_id, data.studentId, yearName, data.term],
    );
    const scores = marks.map((m) => ({ subject: m.subject, score: num(m.score) }));
    const avg = scores.length ? Math.round((scores.reduce((a, s) => a + s.score, 0) / scores.length) * 10) / 10 : 0;
    const present = att.find((a) => a.status === "Present")?.n ?? 0;
    const absent = att.find((a) => a.status === "Absent")?.n ?? 0;
    const late = att.find((a) => a.status === "Late")?.n ?? 0;
    return {
      student: st[0],
      term: data.term,
      yearName,
      marks: scores,
      average: avg,
      attendance: { present, absent, late },
      comment: comment[0]?.comment || "",
    };
  });

export const saveReportComment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      studentId: z.string(),
      term: z.enum(["1st Term", "2nd Term", "3rd Term"]),
      comment: z.string().min(1).max(800),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canMarks(me.role)) throw new Error("Teachers and admin only");
    const yearName = academicYearFromDate(todayIso());
    await sql.query(
      `insert into report_comments (id, school_id, student_id, year_name, term, comment, recorded_by)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (student_id, year_name, term) do update set comment = excluded.comment, recorded_by = excluded.recorded_by`,
      [crypto.randomUUID(), me.school_id, data.studentId, yearName, data.term, data.comment.trim(), me.user_id],
    );
    return { ok: true };
  });

export const getCumulativeRecord = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ studentId: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    await sql.query(`alter table students add column if not exists enrolled_on date`);
    const st = await sql.query<{
      id: string;
      admission_no: string;
      first_name: string;
      last_name: string;
      class_name: string;
      gender: string | null;
      dob: string | null;
      address: string | null;
      parent_name: string | null;
      parent_phone: string | null;
      parent_email: string | null;
      previous_school: string | null;
      nhis_number: string | null;
      photo_url: string | null;
      enrolled_on: string | null;
    }>(
      `select id, admission_no, first_name, last_name, class_name, gender, dob::text, address,
              parent_name, parent_phone, parent_email, previous_school, nhis_number, photo_url,
              coalesce(enrolled_on::text, created_at::date::text) as enrolled_on
       from students where id = $1 and school_id = $2`,
      [data.studentId, me.school_id],
    );
    if (!st[0]) throw new Error("Student not found");
    if (me.role === "PARENT") {
      const email = (me.email || "").toLowerCase();
      if (!st[0].parent_email || st[0].parent_email.toLowerCase() !== email) {
        throw new Error("You can only open your own child's cumulative record");
      }
    } else if (me.role === "TEACHER") {
      const hit = await sql.query<{ id: string }>(
        `select id from class_subjects where school_id = $1 and (teacher_user_id = $2 or teacher_user_id = $3) and class_name = $4 limit 1`,
        [me.school_id, me.user_id, me.id, st[0].class_name],
      );
      if (!hit[0]) throw new Error("Not assigned to this class");
    } else if (
      me.role !== "SUPER_ADMIN" &&
      me.role !== "SCHOOL_ADMIN" &&
      me.role !== "ACCOUNTANT"
    ) {
      throw new Error("No access to cumulative records");
    }
    await sql.query(`alter table report_comments add column if not exists conduct text`);
    await sql.query(`alter table report_comments add column if not exists attitude text`);
    await sql.query(`alter table report_comments add column if not exists interest text`);
    await attachCumulativeCard(sql, {
      schoolId: me.school_id,
      studentId: st[0].id,
      className: st[0].class_name,
      openedOn: st[0].enrolled_on || todayIso(),
    });
    const card = await sql.query<{ opened_on: string; opened_class: string | null }>(
      `select opened_on::text as opened_on, opened_class from cumulative_records where student_id = $1`,
      [st[0].id],
    );

    const marks = await sql.query<{
      student_id: string;
      subject: string;
      term: string;
      assessment_type: string;
      score: string;
      class_name: string;
    }>(
      `select student_id, subject, term, coalesce(assessment_type,'Class test') as assessment_type, score::text, class_name
       from student_marks where school_id = $1 and student_id = $2
       order by class_name, term, subject`,
      [me.school_id, data.studentId],
    );
    const classNames = [...new Set([st[0].class_name, ...marks.map((m) => m.class_name)])];
    const classMarks = await sql.query<{
      student_id: string;
      subject: string;
      term: string;
      assessment_type: string;
      score: string;
      class_name: string;
    }>(
      `select student_id, subject, term, coalesce(assessment_type,'Class test') as assessment_type, score::text, class_name
       from student_marks where school_id = $1`,
      [me.school_id],
    );
    const classmates = await sql.query<{ id: string; class_name: string }>(
      `select id, class_name from students where school_id = $1 and coalesce(status,'ACTIVE') <> 'GRADUATED'`,
      [me.school_id],
    );
    const attendance = await sql.query<{ day: string; status: string; class_name: string }>(
      `select day, status, class_name from attendance where school_id = $1 and student_id = $2 order by day`,
      [me.school_id, data.studentId],
    );
    const promotions = await sql.query<{
      from_class: string;
      to_class: string;
      year_name: string;
      decision: string;
    }>(
      `select from_class, to_class, year_name, decision from promotions
       where school_id = $1 and student_id = $2 order by created_at`,
      [me.school_id, data.studentId],
    );
    const notes = await sql.query<{
      year_name: string;
      term: string;
      comment: string;
      conduct: string | null;
      attitude: string | null;
      interest: string | null;
    }>(
      `select year_name, term, comment, conduct, attitude, interest
       from report_comments where school_id = $1 and student_id = $2`,
      [me.school_id, data.studentId],
    );

    const { buildCumulative } = await import("@/lib/ges-cumulative");
    const blocks = buildCumulative({
      className: st[0].class_name,
      studentId: st[0].id,
      marks,
      classMarks: classMarks.filter((m) => classNames.includes(m.class_name)),
      classmateIds: classmates.filter((c) => classNames.includes(c.class_name)).map((c) => c.id),
      attendance,
    });

    return {
      student: st[0],
      yearName: academicYearFromDate(todayIso()),
      motto: "Christ is our light",
      school: "DOORBELL INTERNATIONAL SCHOOL",
      openedOn: card[0]?.opened_on || st[0].enrolled_on,
      openedClass: card[0]?.opened_class || st[0].class_name,
      blocks,
      promotions,
      notes,
    };
  });

export const saveCumulativeNote = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      studentId: z.string(),
      term: z.enum(["1st Term", "2nd Term", "3rd Term"]),
      comment: z.string().max(800).optional(),
      conduct: z.string().max(40).optional(),
      attitude: z.string().max(40).optional(),
      interest: z.string().max(40).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canMarks(me.role)) throw new Error("Teachers and admin only");
    const yearName = academicYearFromDate(todayIso());
    await sql.query(`alter table report_comments add column if not exists conduct text`);
    await sql.query(`alter table report_comments add column if not exists attitude text`);
    await sql.query(`alter table report_comments add column if not exists interest text`);
    await sql.query(
      `insert into report_comments (id, school_id, student_id, year_name, term, comment, recorded_by, conduct, attitude, interest)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict (student_id, year_name, term) do update
         set comment = excluded.comment, conduct = excluded.conduct, attitude = excluded.attitude,
             interest = excluded.interest, recorded_by = excluded.recorded_by`,
      [
        crypto.randomUUID(),
        me.school_id,
        data.studentId,
        yearName,
        data.term,
        (data.comment || " ").trim() || " ",
        me.user_id,
        data.conduct || null,
        data.attitude || null,
        data.interest || null,
      ],
    );
    return { ok: true };
  });

export const attendanceReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      className: z.string().min(1),
      from: z.string().min(8),
      to: z.string().min(8),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (me.role === "TEACHER") {
      const hit = await sql.query<{ id: string }>(
        `select id from class_subjects where school_id = $1 and (teacher_user_id = $2 or teacher_user_id = $3) and class_name = $4 limit 1`,
        [me.school_id, me.user_id, me.id, data.className],
      );
      if (!hit[0]) throw new Error("Not assigned to this class");
    } else if (me.role !== "SUPER_ADMIN" && me.role !== "SCHOOL_ADMIN") {
      throw new Error("No attendance report access");
    }
    const rows = await sql.query<{
      student_id: string;
      first_name: string;
      last_name: string;
      admission_no: string;
      present: number;
      absent: number;
      late: number;
    }>(
      `select s.id as student_id, s.first_name, s.last_name, s.admission_no,
              count(*) filter (where a.status = 'Present')::int as present,
              count(*) filter (where a.status = 'Absent')::int as absent,
              count(*) filter (where a.status = 'Late')::int as late
       from students s
       left join attendance a
         on a.student_id = s.id and a.school_id = s.school_id
        and a.day >= $2 and a.day <= $3
       where s.school_id = $1 and s.class_name = $4 and coalesce(s.status,'ACTIVE') <> 'GRADUATED'
       group by s.id, s.first_name, s.last_name, s.admission_no
       order by s.last_name, s.first_name`,
      [me.school_id, data.from, data.to, data.className],
    );
    return { className: data.className, from: data.from, to: data.to, rows };
  });

export const listTimetable = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ className: z.string().optional(), teacherOnly: z.boolean().optional() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    const params: unknown[] = [me.school_id];
    const where = ["t.school_id = $1"];
    if (data.teacherOnly || me.role === "TEACHER") {
      params.push(me.user_id);
      where.push(`t.teacher_user_id = $${params.length}`);
    } else if (data.className) {
      params.push(data.className);
      where.push(`t.class_name = $${params.length}`);
    }
    const rows = await sql.query<{
      id: string;
      class_name: string;
      subject_name: string;
      teacher_user_id: string;
      day_of_week: number;
      period: number;
      start_time: string;
      end_time: string;
      teacher: string;
    }>(
      `select t.id, t.class_name, t.subject_name, t.teacher_user_id, t.day_of_week, t.period,
              t.start_time, t.end_time, coalesce(s.first_name || ' ' || s.last_name, '') as teacher
       from timetable_slots t
       left join staff s on s.user_id = t.teacher_user_id
       where ${where.join(" and ")}
       order by t.day_of_week, t.period, t.class_name`,
      params,
    );
    if (me.role === "PARENT" && !data.className) {
      const kids = await sql.query<{ class_name: string }>(
        `select distinct class_name from students where school_id = $1 and lower(coalesce(parent_email,'')) = $2`,
        [me.school_id, (me.email || "").toLowerCase()],
      );
      const set = new Set(kids.map((k) => k.class_name));
      return rows.filter((r) => set.has(r.class_name));
    }
    return rows;
  });

export const saveTimetableSlot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      className: z.string().min(1),
      subjectName: z.string().min(1),
      teacherUserId: z.string().min(1),
      dayOfWeek: z.number().int().min(1).max(5),
      period: z.number().int().min(1).max(8),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canAcademic(me.role)) throw new Error("School Admin or Super Admin only");
    const period = PERIODS.find((p) => p.n === data.period) ?? PERIODS[0];
    const clash = await sql.query<{ id: string }>(
      `select id from timetable_slots
       where school_id = $1 and teacher_user_id = $2 and day_of_week = $3 and period = $4
         and class_name <> $5`,
      [me.school_id, data.teacherUserId, data.dayOfWeek, data.period, data.className],
    );
    if (clash[0]) throw new Error("That teacher already has a lesson that period");
    await sql.query(
      `insert into timetable_slots
        (id, school_id, class_name, subject_name, teacher_user_id, day_of_week, period, start_time, end_time)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (school_id, class_name, day_of_week, period) do update set
         subject_name = excluded.subject_name,
         teacher_user_id = excluded.teacher_user_id,
         start_time = excluded.start_time,
         end_time = excluded.end_time`,
      [
        crypto.randomUUID(),
        me.school_id,
        data.className,
        data.subjectName,
        data.teacherUserId,
        data.dayOfWeek,
        data.period,
        period.start,
        period.end,
      ],
    );
    return { ok: true };
  });

export const deleteTimetableSlot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canAcademic(me.role)) throw new Error("School Admin or Super Admin only");
    await sql.query(`delete from timetable_slots where id = $1 and school_id = $2`, [data.id, me.school_id]);
    return { ok: true };
  });

export const listHomework = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    let rows = await sql.query<{
      id: string;
      class_name: string;
      subject_name: string;
      title: string;
      body: string | null;
      due_date: string;
      term: string;
      year_name: string;
      assigned_by: string;
      teacher: string;
    }>(
      `select h.id, h.class_name, h.subject_name, h.title, h.body, h.due_date, h.term, h.year_name, h.assigned_by,
              coalesce(s.first_name || ' ' || s.last_name, '') as teacher
       from homework h
       left join staff s on s.user_id = h.assigned_by
       where h.school_id = $1
       order by h.due_date desc, h.created_at desc
       limit 80`,
      [me.school_id],
    );
    if (me.role === "TEACHER") {
      const load = await teacherLoad(sql, me.school_id, me.user_id);
      const allow = new Set(load.map((a) => `${a.class_name}\0${a.subject_name}`));
      rows = rows.filter((r) => allow.has(`${r.class_name}\0${r.subject_name}`) || r.assigned_by === me.user_id);
    } else if (me.role === "PARENT") {
      const kids = await sql.query<{ class_name: string }>(
        `select distinct class_name from students where school_id = $1 and lower(parent_email) = $2`,
        [me.school_id, (me.email || "").toLowerCase()],
      );
      const set = new Set(kids.map((k) => k.class_name));
      rows = rows.filter((r) => set.has(r.class_name));
    }
    const done = await sql.query<{ homework_id: string; student_id: string; note: string | null }>(
      `select d.homework_id, d.student_id, d.note from homework_done d
       join homework h on h.id = d.homework_id where h.school_id = $1`,
      [me.school_id],
    );
    return { items: rows, done, me };
  });

export const assignHomework = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      className: z.string().min(1),
      subjectName: z.string().min(1),
      title: z.string().min(1),
      body: z.string().optional(),
      dueDate: z.string().min(8),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canMarks(me.role)) throw new Error("Teachers and admin only");
    if (me.role === "TEACHER") {
      const hit = await sql.query<{ id: string }>(
        `select id from class_subjects
         where school_id = $1 and (teacher_user_id = $2 or teacher_user_id = $3) and class_name = $4 and subject_name = $5 limit 1`,
        [me.school_id, me.user_id, me.id, data.className, data.subjectName],
      );
      if (!hit[0]) throw new Error("You can only set homework for a class and subject assigned to you");
    }
    const id = crypto.randomUUID();
    await sql.query(
      `insert into homework
        (id, school_id, class_name, subject_name, title, body, due_date, term, year_name, assigned_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id,
        me.school_id,
        data.className,
        data.subjectName,
        data.title.trim(),
        data.body?.trim() || null,
        data.dueDate,
        termFromDate(todayIso()),
        academicYearFromDate(todayIso()),
        me.user_id,
      ],
    );
    await writeAudit(sql, me, "HOMEWORK", "homework", id, `${data.className} · ${data.subjectName} · ${data.title}`);
    return { ok: true, id };
  });

export const markHomeworkDone = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ homeworkId: z.string(), studentId: z.string(), note: z.string().optional() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canMarks(me.role)) throw new Error("Teachers and admin only");
    await sql.query(
      `insert into homework_done (id, homework_id, student_id, note)
       values ($1,$2,$3,$4)
       on conflict (homework_id, student_id) do update set note = excluded.note, done_at = now()`,
      [crypto.randomUUID(), data.homeworkId, data.studentId, data.note?.trim() || null],
    );
    return { ok: true };
  });

export { GHANA_CLASS_LEVELS, TERMS };