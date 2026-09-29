import { createServerFn } from "@tanstack/react-start";
import { applyPasswordToUser } from "@/lib/password";
import { cleanEmail } from "@/lib/credentials";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  GHANA_CLASS_LEVELS,
  GES_SUBJECTS,
  CLASS_DEFAULT_SUBJECTS,
  bandForClass,
  nextClass,
  num,
  termFromDate,
  academicYearRange,
  mondayOf,
  weekDayIsos,
  sortClass,
  sortAlpha,
  type StaffRole,
  ROLE_LABEL,
} from "@/lib/ghana";
import { attachCumulativeCard, backfillCumulativeCards, ensureCumulativeTable } from "@/lib/cumulative-store";

const SCHOOL_ID = "dis-school";
const SCHOOL_CODE = "DIS";

type StaffRow = {
  id: string;
  user_id: string;
  school_id: string;
  role: StaffRole;
  first_name: string;
  last_name: string;
  email: string;
  kind?: "staff" | "parent" | "student";
  display_role?: string;
};

async function authUser(sql: Awaited<ReturnType<typeof getSql>>, userId: string) {
  const rows = await sql.query<{ email: string; name: string }>(
    `select email, name from "user" where id = $1`,
    [userId],
  );
  return rows[0] ?? { email: "", name: "Staff" };
}

async function ensureStaff(
  sql: Awaited<ReturnType<typeof getSql>>,
  userId: string,
): Promise<StaffRow> {
  await sql.query(
    `insert into schools (id, name, code, motto, address, email)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (id) do update set address = excluded.address`,
    [
      SCHOOL_ID,
      "Doorbell International School",
      SCHOOL_CODE,
      "Christ is our light",
      "DC Road, Somanya, Eastern Region, Ghana",
      "info@dis.edu.gh",
    ],
  );

  const existing = await sql.query<StaffRow>(
    `select id, user_id, school_id, role, first_name, last_name, email
     from staff where user_id = $1`,
    [userId],
  );
  if (existing[0]) return existing[0];

  const au = await authUser(sql, userId);
  const email = (au.email || "").toLowerCase();
  const parts = (au.name || "Staff").trim().split(/\s+/);
  const first = parts[0] || "Staff";
  const last = parts.slice(1).join(" ") || "Member";

  const invite = email
    ? await sql.query<{ role: StaffRole; first_name: string; last_name: string }>(
        `select role, first_name, last_name from invitations
         where school_id = $1 and lower(email) = $2`,
        [SCHOOL_ID, email],
      )
    : [];

  const count = await sql.query<{ n: number }>(
    `select count(*)::int as n from staff where school_id = $1`,
    [SCHOOL_ID],
  );
  const isFirst = (count[0]?.n ?? 0) === 0;
  if (!invite[0] && !isFirst) {
    throw new Error(
      "No login was issued for this email. Ask Super Admin or the Accountant to allocate one.",
    );
  }
  const role: StaffRole = invite[0]?.role ?? (isFirst ? "SUPER_ADMIN" : "PARENT");
  const firstName = invite[0]?.first_name || first;
  const lastName = invite[0]?.last_name || last;

  const id = crypto.randomUUID();
  await sql.query(
    `insert into staff (id, user_id, school_id, role, first_name, last_name, email)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [id, userId, SCHOOL_ID, role, firstName, lastName, email || `${userId}@dis.local`],
  );
  if (invite[0] && email) {
    await sql.query(`delete from invitations where school_id = $1 and lower(email) = $2`, [
      SCHOOL_ID,
      email,
    ]);
  }
  return {
    id,
    user_id: userId,
    school_id: SCHOOL_ID,
    role,
    first_name: firstName,
    last_name: lastName,
    email: email || `${userId}@dis.local`,
  };
}

function normCode(v: string) {
  return v.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

async function resolveFamilyIdentity(
  sql: Awaited<ReturnType<typeof getSql>>,
  me: StaffRow,
): Promise<StaffRow> {
  if (me.role !== "PARENT") {
    return { ...me, kind: "staff", display_role: ROLE_LABEL[me.role] };
  }
  const kids = await sql.query<{
    id: string;
    admission_no: string;
    first_name: string;
    last_name: string;
  }>(
    `select id, admission_no, first_name, last_name
     from students where school_id = $1 and lower(coalesce(parent_email,'')) = $2`,
    [me.school_id, (me.email || "").toLowerCase()],
  );
  const local = (me.email || "").split("@")[0] || "";
  const localN = normCode(local);
  const asStudent = kids.find((k) => {
    const adm = normCode(k.admission_no);
    return adm && (localN === adm || localN.endsWith(adm) || adm.endsWith(localN));
  });
  if (asStudent) {
    const first = asStudent.first_name;
    const last = asStudent.last_name;
    if (me.first_name !== first || me.last_name !== last) {
      await sql.query(`update staff set first_name = $1, last_name = $2 where id = $3`, [
        first,
        last,
        me.id,
      ]);
      await sql.query(`update "user" set name = $1, "updatedAt" = now() where id = $2`, [
        `${first} ${last}`.trim(),
        me.user_id,
      ]);
    }
    return {
      ...me,
      first_name: first,
      last_name: last,
      kind: "student",
      display_role: "Student",
    };
  }
  return { ...me, kind: "parent", display_role: "Parent / guardian" };
}

function canFinance(role: StaffRole) {
  return role === "SUPER_ADMIN" || role === "ACCOUNTANT";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function ensureStudentColumns(sql: SqlClient) {
  await sql.query(`alter table students add column if not exists enrolled_on date`);
  await sql.query(`alter table students add column if not exists previous_school text`);
  await sql.query(`alter table students add column if not exists nhis_number text`);
  await sql.query(`alter table students add column if not exists photo_url text`);
  await sql.query(`alter table students add column if not exists status text`);
}

type SqlClient = Awaited<ReturnType<typeof getSql>>;

function issueReceiptNo(tag: "RCP" | "SVC") {
  return `DIS-${tag}-${Date.now().toString().slice(-8)}${Math.floor(100 + Math.random() * 900)}`;
}

let serviceSchemaReady = false;

async function ensureServiceReceipts(sql: SqlClient) {
  if (serviceSchemaReady) return;
  await sql.query(`alter table service_collections add column if not exists receipt_no text`);
  await sql.query(
    `update service_collections
     set receipt_no = 'DIS-SVC-' || upper(substr(replace(id, '-', ''), 1, 11))
     where receipt_no is null or btrim(receipt_no) = ''`,
  );
  await sql.query(`alter table service_collections add column if not exists collected_on date`);
  await sql.query(
    `update service_collections set collected_on = collected_at::date where collected_on is null`,
  );
  await sql.query(`
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
    )
  `);
  const missing = await sql.query<{
    school_id: string;
    student_id: string;
    feeding: string | null;
    bus: string | null;
    first_day: string | null;
  }>(
    `select c.school_id, c.student_id,
            max(case when c.kind = 'FEEDING' then c.amount end)::text as feeding,
            max(case when c.kind = 'BUS' then c.amount end)::text as bus,
            min(c.collected_on)::text as first_day
     from service_collections c
     where c.student_id is not null
       and not exists (
         select 1 from service_enrollments e
         where e.school_id = c.school_id and e.student_id = c.student_id
       )
     group by c.school_id, c.student_id`,
  );
  for (const r of missing) {
    await sql.query(
      `insert into service_enrollments (
         id, school_id, student_id, on_feeding, on_bus, feeding_rate, bus_rate, active, enrolled_on
       ) values ($1,$2,$3,$4,$5,$6,$7,true,$8)`,
      [
        crypto.randomUUID(),
        r.school_id,
        r.student_id,
        Boolean(r.feeding),
        Boolean(r.bus),
        num(r.feeding),
        num(r.bus),
        r.first_day,
      ],
    );
  }
  serviceSchemaReady = true;
}

async function upsertServiceEnrollment(
  sql: SqlClient,
  args: {
    schoolId: string;
    studentId: string;
    onFeeding?: boolean;
    onBus?: boolean;
    feedingRate?: number;
    busRate?: number;
    enrolledBy?: string;
  },
) {
  const existing = await sql.query<{
    id: string;
    on_feeding: boolean;
    on_bus: boolean;
    feeding_rate: string;
    bus_rate: string;
  }>(
    `select id, on_feeding, on_bus, feeding_rate::text, bus_rate::text
     from service_enrollments where school_id = $1 and student_id = $2`,
    [args.schoolId, args.studentId],
  );
  const onF = args.onFeeding ?? Boolean(existing[0]?.on_feeding);
  const onB = args.onBus ?? Boolean(existing[0]?.on_bus);
  const fRate = args.feedingRate ?? num(existing[0]?.feeding_rate);
  const bRate = args.busRate ?? num(existing[0]?.bus_rate);
  const active = onF || onB;
  if (existing[0]) {
    await sql.query(
      `update service_enrollments
       set on_feeding = $1, on_bus = $2, feeding_rate = $3, bus_rate = $4, active = $5
       where id = $6`,
      [onF, onB, fRate, bRate, active, existing[0].id],
    );
    return;
  }
  await sql.query(
    `insert into service_enrollments (
       id, school_id, student_id, on_feeding, on_bus, feeding_rate, bus_rate, active, enrolled_on, enrolled_by
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      crypto.randomUUID(),
      args.schoolId,
      args.studentId,
      onF,
      onB,
      fRate,
      bRate,
      active,
      todayIso(),
      args.enrolledBy || null,
    ],
  );
}


async function postDouble(
  sql: SqlClient,
  args: {
    schoolId: string;
    date: string;
    term: string;
    refType: string;
    refId: string;
    memo: string;
    userId: string;
    debitAccount: string;
    creditAccount: string;
    amount: number;
  },
) {
  const amount = Math.round(args.amount * 100) / 100;
  if (amount <= 0) return;
  await sql.query(
    `insert into ledger_entries
      (id, school_id, entry_date, term, account, debit, credit, ref_type, ref_id, memo, recorded_by)
     values ($1,$2,$3,$4,$5,$6,0,$7,$8,$9,$10)`,
    [
      crypto.randomUUID(),
      args.schoolId,
      args.date,
      args.term,
      args.debitAccount,
      amount,
      args.refType,
      args.refId,
      args.memo,
      args.userId,
    ],
  );
  await sql.query(
    `insert into ledger_entries
      (id, school_id, entry_date, term, account, debit, credit, ref_type, ref_id, memo, recorded_by)
     values ($1,$2,$3,$4,$5,0,$6,$7,$8,$9,$10)`,
    [
      crypto.randomUUID(),
      args.schoolId,
      args.date,
      args.term,
      args.creditAccount,
      amount,
      args.refType,
      args.refId,
      args.memo,
      args.userId,
    ],
  );
}

async function adjustServiceAmount(
  sql: SqlClient,
  me: StaffRow,
  row: {
    id: string;
    kind: string;
    amount: string | number;
    term: string | null;
    collected_on?: string | null;
    receipt_no?: string | null;
  },
  newAmount: number,
) {
  const old = num(row.amount);
  const next = Math.round(newAmount * 100) / 100;
  const delta = Math.round((next - old) * 100) / 100;
  if (Math.abs(delta) < 0.009) return { changed: false as const, amount: old };
  const date = (row.collected_on || todayIso()).slice(0, 10);
  const term = row.term || termFromDate(date);
  const income = row.kind === "BUS" ? "BUS_INCOME" : "FEEDING_INCOME";
  if (delta > 0) {
    await postDouble(sql, {
      schoolId: me.school_id,
      date,
      term,
      refType: "SERVICE",
      refId: row.id,
      memo: `Adjust ${row.kind} ${row.receipt_no || row.id}`,
      userId: me.user_id,
      debitAccount: "CASH",
      creditAccount: income,
      amount: delta,
    });
  } else {
    await postDouble(sql, {
      schoolId: me.school_id,
      date,
      term,
      refType: "VOID",
      refId: row.id,
      memo: `Adjust ${row.kind} ${row.receipt_no || row.id}`,
      userId: me.user_id,
      debitAccount: income,
      creditAccount: "CASH",
      amount: -delta,
    });
  }
  await sql.query(`update service_collections set amount = $1 where id = $2 and school_id = $3`, [
    next,
    row.id,
    me.school_id,
  ]);
  return { changed: true as const, amount: next };
}

async function logReceipt(
  sql: SqlClient,
  schoolId: string,
  paymentId: string,
  action: string,
  actorId: string,
  reason?: string,
) {
  await sql.query(
    `insert into receipt_events (id, school_id, payment_id, action, reason, actor_id)
     values ($1,$2,$3,$4,$5,$6)`,
    [crypto.randomUUID(), schoolId, paymentId, action, reason || null, actorId],
  );
}
function canEnroll(role: StaffRole) {
  return role === "SUPER_ADMIN" || role === "ACCOUNTANT";
}
function canAcademic(role: StaffRole) {
  return role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN";
}
function canStaff(role: StaffRole) {
  return role === "SUPER_ADMIN" || role === "ACCOUNTANT";
}
function canServices(role: StaffRole) {
  return role === "SUPER_ADMIN" || role === "ACCOUNTANT" || role === "SERVICE_OFFICER";
}
function canAdmin(role: StaffRole) {
  return role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN";
}

async function requestMeta() {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const h = req?.headers;
    const fwd = h?.get("x-forwarded-for") || "";
    return {
      ip: fwd.split(",")[0]?.trim() || h?.get("x-real-ip") || "",
      ua: (h?.get("user-agent") || "").slice(0, 180),
    };
  } catch {
    return { ip: "", ua: "" };
  }
}

async function writeAudit(
  sql: SqlClient,
  me: StaffRow,
  action: string,
  entity: string,
  entityId: string | null,
  summary: string,
) {
  const meta = await requestMeta();
  await sql.query(
    `insert into audit_events
      (id, school_id, actor_id, actor_email, actor_role, action, entity, entity_id, summary, ip, user_agent)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      crypto.randomUUID(),
      me.school_id,
      me.user_id,
      me.email,
      me.role,
      action,
      entity,
      entityId,
      summary.slice(0, 400),
      meta.ip || null,
      meta.ua || null,
    ],
  );
}

async function noteLoginRow(sql: SqlClient, me: StaffRow, event: string) {
  const meta = await requestMeta();
  await sql.query(
    `insert into login_events (id, school_id, user_id, email, event, ip, user_agent)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [crypto.randomUUID(), me.school_id, me.user_id, me.email, event, meta.ip || null, meta.ua || null],
  );
}

export const getMe = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await resolveFamilyIdentity(sql, await ensureStaff(sql, context.userId));
    const school = await sql.query<{ name: string; motto: string | null; code: string }>(
      `select name, motto, code from schools where id = $1`,
      [me.school_id],
    );
    return { me, school: school[0] };
  });

export const updateOwnProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    const email = data.email.toLowerCase().trim();
    const first = data.firstName.trim();
    const last = data.lastName.trim();
    const taken = await sql.query<{ id: string }>(
      `select id from staff where school_id = $1 and lower(email) = $2 and user_id <> $3`,
      [me.school_id, email, me.user_id],
    );
    if (taken[0]) throw new Error("That email is already used by another login");
    const userTaken = await sql.query<{ id: string }>(
      `select id from "user" where lower(email) = $1 and id <> $2`,
      [email, me.user_id],
    );
    if (userTaken[0]) throw new Error("That email is already used");
    const oldEmail = (me.email || "").toLowerCase();
    await sql.query(
      `update staff set first_name = $1, last_name = $2, email = $3 where user_id = $4 and school_id = $5`,
      [first, last, email, me.user_id, me.school_id],
    );
    await sql.query(`update "user" set name = $1, email = $2, "updatedAt" = now() where id = $3`, [
      `${first} ${last}`,
      email,
      me.user_id,
    ]);
    if (me.role === "PARENT" && oldEmail && oldEmail !== email) {
      await sql.query(
        `update students set parent_email = $1 where school_id = $2 and lower(parent_email) = $3`,
        [email, me.school_id, oldEmail],
      );
    }
    await writeAudit(sql, me, "PROFILE", "staff", me.user_id, `Updated own profile ${email}`);
    return { ok: true };
  });

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    const sid = me.school_id;
    const term = termFromDate(todayIso());
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const today = todayIso();
    const [
      students,
      billed,
      paid,
      bus,
      feeding,
      other,
      expenses,
      staff,
      byClass,
      termBill,
      termPay,
      weekCash,
      attToday,
    ] = await Promise.all([
      sql.query<{ n: number }>(`select count(*)::int as n from students where school_id = $1`, [sid]),
      sql.query<{ s: string }>(`select coalesce(sum(total),0)::text as s from billings where school_id = $1`, [sid]),
      sql.query<{ s: string }>(`select coalesce(sum(paid),0)::text as s from billings where school_id = $1`, [sid]),
      sql.query<{ s: string }>(
        `select coalesce(sum(amount),0)::text as s from service_collections where school_id = $1 and kind = 'BUS'`,
        [sid],
      ),
      sql.query<{ s: string }>(
        `select coalesce(sum(amount),0)::text as s from service_collections where school_id = $1 and kind = 'FEEDING'`,
        [sid],
      ),
      sql.query<{ s: string }>(
        `select coalesce(sum(amount),0)::text as s from other_incomes where school_id = $1`,
        [sid],
      ),
      sql.query<{ s: string }>(
        `select coalesce(sum(amount),0)::text as s from expenses where school_id = $1`,
        [sid],
      ),
      sql.query<{ n: number }>(
        `select count(*)::int as n from staff where school_id = $1 and role <> 'PARENT'`,
        [sid],
      ),
      sql.query<{ class_name: string; n: number }>(
        `select class_name, count(*)::int as n from students where school_id = $1 group by class_name`,
        [sid],
      ),
      sql.query<{ billed: string; paid: string }>(
        `select coalesce(sum(total),0)::text as billed, coalesce(sum(paid),0)::text as paid
         from billings where school_id = $1 and term = $2`,
        [sid, term],
      ),
      sql.query<{ s: string }>(
        `select coalesce(sum(p.amount),0)::text as s
         from payments p join billings b on b.id = p.billing_id
         where p.school_id = $1 and b.term = $2 and coalesce(p.status,'POSTED') = 'POSTED'`,
        [sid, term],
      ),
      sql.query<{ inn: string; out: string }>(
        `select coalesce(sum(debit),0)::text as inn, coalesce(sum(credit),0)::text as out
         from ledger_entries
         where school_id = $1 and account = 'CASH' and entry_date >= $2`,
        [sid, weekAgo],
      ),
      sql.query<{ status: string; n: number }>(
        `select status, count(*)::int as n from attendance
         where school_id = $1 and day = $2 group by status`,
        [sid, today],
      ),
    ]);
    const billedN = num(billed[0]?.s);
    const paidN = num(paid[0]?.s);
    const finance = canFinance(me.role)
      ? {
          collected: paidN,
          outstanding: Math.max(0, billedN - paidN),
          bus: num(bus[0]?.s),
          feeding: num(feeding[0]?.s),
          otherIncome: num(other[0]?.s),
          expenses: num(expenses[0]?.s),
          term,
          termBilled: num(termBill[0]?.billed),
          termCollected: num(termPay[0]?.s),
          termOutstanding: Math.max(0, num(termBill[0]?.billed) - num(termPay[0]?.s)),
          weekIn: num(weekCash[0]?.inn),
          weekOut: num(weekCash[0]?.out),
        }
      : {
          collected: 0,
          outstanding: 0,
          bus: 0,
          feeding: 0,
          otherIncome: 0,
          expenses: 0,
          term,
          termBilled: 0,
          termCollected: 0,
          termOutstanding: 0,
          weekIn: 0,
          weekOut: 0,
        };
    const present = attToday.find((a) => a.status === "Present")?.n ?? 0;
    const absent = attToday.find((a) => a.status === "Absent")?.n ?? 0;
    const late = attToday.find((a) => a.status === "Late")?.n ?? 0;
    const classCounts = GHANA_CLASS_LEVELS.map((name) => ({
      className: name,
      n: byClass.find((c) => c.class_name === name)?.n ?? 0,
    })).filter((c) => c.n > 0);
    const seen = await sql.query<{ n: number }>(
      `select count(*)::int as n from login_events
       where school_id = $1 and user_id = $2 and event = 'ACTIVE'
         and created_at::date = $3::date`,
      [sid, me.user_id, today],
    );
    if ((seen[0]?.n ?? 0) === 0) {
      await noteLoginRow(sql, me, "ACTIVE");
    }
    const recent =
      canAdmin(me.role) || canFinance(me.role)
        ? await sql.query<{
            id: string;
            actor_email: string | null;
            action: string;
            summary: string;
            created_at: string;
          }>(
            `select id, actor_email, action, summary, created_at::text
             from audit_events where school_id = $1 order by created_at desc limit 8`,
            [sid],
          )
        : [];
    return {
      me,
      students: me.role === "PARENT" ? 0 : (students[0]?.n ?? 0),
      staff: me.role === "PARENT" ? 0 : (staff[0]?.n ?? 0),
      ...finance,
      classCounts: me.role === "PARENT" ? [] : classCounts,
      attendance:
        me.role === "PARENT"
          ? { present: 0, absent: 0, late: 0, day: today }
          : { present, absent, late, day: today },
      recent: me.role === "PARENT" ? [] : recent,
    };
  });

export const getParentDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (me.role !== "PARENT") throw new Error("Parent desk only");
    await ensureServiceReceipts(sql);
    const email = (me.email || "").toLowerCase();
    const kids = await sql.query<{
      id: string;
      admission_no: string;
      first_name: string;
      last_name: string;
      class_name: string;
      photo_url: string | null;
      billed: string;
      paid: string;
      bus: string;
      feeding: string;
      present: number;
      absent: number;
    }>(
      `select s.id, s.admission_no, s.first_name, s.last_name, s.class_name, s.photo_url,
              coalesce((select sum(total) from billings b where b.student_id = s.id),0)::text as billed,
              coalesce((select sum(paid) from billings b where b.student_id = s.id),0)::text as paid,
              coalesce((select sum(amount) from service_collections c where c.student_id = s.id and c.kind = 'BUS'),0)::text as bus,
              coalesce((select sum(amount) from service_collections c where c.student_id = s.id and c.kind = 'FEEDING'),0)::text as feeding,
              coalesce((select count(*) from attendance a where a.student_id = s.id and a.status = 'Present'),0)::int as present,
              coalesce((select count(*) from attendance a where a.student_id = s.id and a.status = 'Absent'),0)::int as absent
       from students s
       where s.school_id = $1 and lower(coalesce(s.parent_email,'')) = $2
       order by s.admission_no`,
      [me.school_id, email],
    );
    const marks = await sql.query<{
      student_id: string;
      subject: string;
      term: string;
      assessment_type: string;
      score: string;
    }>(
      `select m.student_id, m.subject, m.term, coalesce(m.assessment_type,'Class test') as assessment_type, m.score::text
       from student_marks m
       join students s on s.id = m.student_id
       where m.school_id = $1 and lower(coalesce(s.parent_email,'')) = $2
       order by m.term, m.subject`,
      [me.school_id, email],
    );
    const receipts = await sql.query<{
      id: string;
      student_id: string;
      receipt_no: string;
      amount: string;
      paid_at: string;
      status: string | null;
      description: string;
    }>(
      `select p.id, s.id as student_id, p.receipt_no, p.amount::text, p.paid_at::text, p.status, b.description
       from payments p
       join billings b on b.id = p.billing_id
       join students s on s.id = b.student_id
       where p.school_id = $1 and lower(coalesce(s.parent_email,'')) = $2
       order by p.paid_at desc`,
      [me.school_id, email],
    );
    const services = await sql.query<{
      id: string;
      student_id: string;
      kind: string;
      amount: string;
      collected_at: string;
      recorded_name: string | null;
      receipt_no: string;
    }>(
      `select c.id, c.student_id, c.kind, c.amount::text, c.collected_at::text, c.recorded_name,
              coalesce(c.receipt_no, c.id) as receipt_no
       from service_collections c
       join students s on s.id = c.student_id
       where c.school_id = $1 and lower(coalesce(s.parent_email,'')) = $2
       order by c.collected_at desc`,
      [me.school_id, email],
    );
    return { me, kids, marks, receipts, services };
  });

export const listStudents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    await ensureStudentColumns(sql);
    await backfillCumulativeCards(sql, me.school_id);
    const rows = await sql.query<{
      id: string;
      admission_no: string;
      first_name: string;
      last_name: string;
      class_name: string;
      gender: string | null;
      dob: string | null;
      phone: string | null;
      address: string | null;
      notes: string | null;
      parent_name: string | null;
      parent_phone: string | null;
      parent_email: string | null;
      previous_school: string | null;
      nhis_number: string | null;
      photo_url: string | null;
      status: string;
      enrolled_on: string | null;
    }>(
      `select id, admission_no, first_name, last_name, class_name, gender, dob, phone, address, notes,
              parent_name, parent_phone, parent_email, previous_school, nhis_number, photo_url,
              coalesce(status,'ACTIVE') as status,
              coalesce(enrolled_on::text, created_at::date::text) as enrolled_on
       from students where school_id = $1
       order by class_name, last_name, first_name, admission_no`,
      [me.school_id],
    );
    if (me.role === "TEACHER") {
      const assigned = await sql.query<{ class_name: string }>(
        `select distinct class_name from class_subjects
         where school_id = $1 and (teacher_user_id = $2 or teacher_user_id = $3)`,
        [me.school_id, me.user_id, me.id],
      );
      const set = new Set(assigned.map((a) => a.class_name));
      if (set.size === 0) return [];
      return rows.filter((r) => set.has(r.class_name));
    }
    if (me.role === "PARENT") {
      const email = (me.email || "").toLowerCase();
      return rows.filter((r) => r.parent_email && r.parent_email.toLowerCase() === email);
    }
    return rows;
  });

const enrollSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  className: z.string().min(1),
  gender: z.string().optional(),
  dob: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  parentName: z.string().optional(),
  parentPhone: z.string().optional(),
  parentEmail: z.string().optional(),
  previousSchool: z.string().optional(),
  nhisNumber: z.string().optional(),
  photoUrl: z.string().max(4_500_000).optional(),
  enrolledOn: z.string().optional(),
});

function formatAdmission(n: number) {
  return `DISST${String(n).padStart(2, "0")}`;
}

async function nextAdmissionNo(sql: Awaited<ReturnType<typeof getSql>>, schoolId: string) {
  const rows = await sql.query<{ admission_no: string }>(
    `select admission_no from students where school_id = $1`,
    [schoolId],
  );
  const used = new Set(rows.map((r) => r.admission_no));
  let max = 0;
  for (const r of rows) {
    const m = r.admission_no.match(/(\d+)$/);
    if (!m) continue;
    const v = parseInt(m[1], 10);
    if (Number.isFinite(v) && v > max) max = v;
  }
  let n = max + 1;
  while (used.has(formatAdmission(n))) n += 1;
  return formatAdmission(n);
}

function isAdmissionClash(err: unknown) {
  const e = err as { code?: string; message?: string };
  if (e?.code === "23505") return true;
  const msg = e?.message || String(err);
  return /students_school_id_admission_no_key|duplicate key value.*admission_no/i.test(msg);
}

export const enrollStudent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(enrollSchema)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canEnroll(me.role)) throw new Error("Only Accountant or Super Admin can enroll");
    await ensureStudentColumns(sql);
    const id = crypto.randomUUID();
    const { persistStudentPhoto } = await import("@/lib/student-photo");
    const photoUrl = await persistStudentPhoto(data.photoUrl);
    const enrolledOn = (data.enrolledOn || todayIso()).slice(0, 10);
    let admission = await nextAdmissionNo(sql, me.school_id);
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        await sql.query(
          `insert into students (
            id, school_id, admission_no, first_name, last_name, class_name,
            gender, dob, phone, address, notes, parent_name, parent_phone, parent_email,
            previous_school, nhis_number, photo_url, created_by, enrolled_on
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
          [
            id,
            me.school_id,
            admission,
            data.firstName.trim(),
            data.lastName.trim(),
            data.className,
            data.gender || null,
            data.dob || null,
            data.phone || null,
            data.address || null,
            data.notes || null,
            data.parentName || null,
            data.parentPhone || null,
            data.parentEmail || null,
            data.previousSchool || null,
            data.nhisNumber || null,
            photoUrl,
            me.user_id,
            enrolledOn,
          ],
        );
        break;
      } catch (err) {
        if (!isAdmissionClash(err) || attempt === 11) throw err;
        admission = await nextAdmissionNo(sql, me.school_id);
      }
    }
    await attachCumulativeCard(sql, {
      schoolId: me.school_id,
      studentId: id,
      className: data.className,
      openedOn: enrolledOn,
    });
    await writeAudit(
      sql,
      me,
      "ENROLL",
      "student",
      id,
      `Enrolled ${data.firstName.trim()} ${data.lastName.trim()} · ${admission} · ${data.className}`,
    );

    const parentEmail = (data.parentEmail || `${admission.toLowerCase()}@doorbellinternationalschool.com`)
      .toLowerCase()
      .trim();
    await sql.query(`update students set parent_email = $1 where id = $2`, [parentEmail, id]);
    const existingUser = await sql.query<{ id: string }>(
      `select id from "user" where lower(email) = $1`,
      [parentEmail],
    );
    let loginPassword: string | null = null;
    let reused = false;
    let userId = existingUser[0]?.id;
    const hasParentMail = !!(data.parentEmail && data.parentEmail.trim());
    const loginFirst = hasParentMail
      ? (data.parentName || "Parent").trim().split(/\s+/)[0] || "Parent"
      : data.firstName.trim();
    const loginLast = hasParentMail
      ? (data.parentName || "").trim().split(/\s+/).slice(1).join(" ") || "Guardian"
      : data.lastName.trim();
    const display = hasParentMail
      ? (data.parentName || `${loginFirst} ${loginLast}`).trim()
      : `${data.firstName.trim()} ${data.lastName.trim()}`;
    if (userId) {
      reused = true;
      const staffRow = await sql.query<{ id: string }>(
        `select id from staff where user_id = $1 and school_id = $2`,
        [userId, me.school_id],
      );
      if (!staffRow[0]) {
        await sql.query(
          `insert into staff (id, user_id, school_id, role, first_name, last_name, email)
           values ($1,$2,$3,'PARENT',$4,$5,$6)`,
          [crypto.randomUUID(), userId, me.school_id, loginFirst, loginLast, parentEmail],
        );
      }
    } else {
      const { randomBytes } = await import("node:crypto");
      loginPassword = `DIS${admission.replace(/\D/g, "")}-${randomBytes(3).toString("hex")}`;
      userId = crypto.randomUUID();
      const displayName = display;
      await sql.query(
        `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
         values ($1,$2,$3,true,now(),now())`,
        [userId, displayName, parentEmail],
      );
      await applyPasswordToUser(sql, userId, loginPassword);
      await sql.query(
        `insert into staff (id, user_id, school_id, role, first_name, last_name, email)
         values ($1,$2,$3,'PARENT',$4,$5,$6)`,
        [crypto.randomUUID(), userId, me.school_id, loginFirst, loginLast, parentEmail],
      );
    }
    await writeAudit(sql, me, "LOGIN_ISSUE", "student", id, `Family login ${parentEmail}`);
    return { id, admission, loginEmail: parentEmail, password: loginPassword, reused };
  });

export const listBillings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role)) throw new Error("Finance access required");
    return sql.query<{
      id: string;
      invoice_no: string;
      term: string;
      description: string;
      total: string;
      paid: string;
      student: string;
      admission_no: string;
      class_name: string;
    }>(
      `select b.id, b.invoice_no, b.term, b.description, b.total::text, b.paid::text,
              (s.first_name || ' ' || s.last_name) as student, s.admission_no, s.class_name
       from billings b join students s on s.id = b.student_id
       where b.school_id = $1
       order by b.description, s.class_name, s.last_name, s.first_name
       limit 4000`,
      [me.school_id],
    );
  });

export const createBilling = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      studentId: z.string().min(1),
      term: z.string().min(1),
      description: z.string().min(1),
      amount: z.number().positive(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role)) throw new Error("Finance access required");
    const st = await sql.query<{ id: string }>(
      `select id from students where id = $1 and school_id = $2`,
      [data.studentId, me.school_id],
    );
    if (!st[0]) throw new Error("Student not found");
    const invoiceNo = `DIS-BILL-${Date.now().toString().slice(-8)}`;
    const id = crypto.randomUUID();
    await sql.query(
      `insert into billings (id, school_id, student_id, invoice_no, term, description, total, paid)
       values ($1,$2,$3,$4,$5,$6,$7,0)`,
      [id, me.school_id, data.studentId, invoiceNo, data.term, data.description, data.amount],
    );
    await postDouble(sql, {
      schoolId: me.school_id,
      date: todayIso(),
      term: data.term,
      refType: "BILLING",
      refId: id,
      memo: `${invoiceNo} · ${data.description}`,
      userId: me.user_id,
      debitAccount: "FEES_RECEIVABLE",
      creditAccount: "FEE_INCOME",
      amount: data.amount,
    });
    await writeAudit(sql, me, "BILL", "billing", id, `${invoiceNo} · ${data.term} · ${data.description}`);
    return { id, invoiceNo };
  });

export const listFeeTypes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role)) throw new Error("Finance access required");
    return sql.query<{
      id: string;
      name: string;
      term: string;
      amount: string;
      class_name: string | null;
    }>(
      `select id, name, term, amount::text, class_name from fee_structures
       where school_id = $1 order by term, name`,
      [me.school_id],
    );
  });

export const createFeeType = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      name: z.string().min(1).max(80),
      term: z.string().min(1),
      amount: z.number().positive(),
      className: z.string().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role)) throw new Error("Finance access required");
    const id = crypto.randomUUID();
    await sql.query(
      `insert into fee_structures (id, school_id, name, term, amount, class_name)
       values ($1,$2,$3,$4,$5,$6)`,
      [id, me.school_id, data.name.trim(), data.term, data.amount, data.className || null],
    );
    await writeAudit(sql, me, "FEE_TYPE", "fee_structures", id, `${data.name} · ${data.term} · ${data.amount}`);
    return { id };
  });

export const deleteFeeType = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role)) throw new Error("Finance access required");
    await sql.query(`delete from fee_structures where id = $1 and school_id = $2`, [data.id, me.school_id]);
    return { ok: true };
  });

export const allocateFeeType = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      feeTypeId: z.string().min(1),
      studentIds: z.array(z.string()).optional(),
      className: z.string().optional(),
      wholeSchool: z.boolean().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role)) throw new Error("Finance access required");
    const ft = await sql.query<{ name: string; term: string; amount: string; class_name: string | null }>(
      `select name, term, amount::text, class_name from fee_structures where id = $1 and school_id = $2`,
      [data.feeTypeId, me.school_id],
    );
    if (!ft[0]) throw new Error("Billing type not found");
    let students: { id: string }[] = [];
    if (data.wholeSchool) {
      students = await sql.query<{ id: string }>(
        `select id from students where school_id = $1 and coalesce(status,'ACTIVE') <> 'GRADUATED'`,
        [me.school_id],
      );
    } else if (data.className) {
      students = await sql.query<{ id: string }>(
        `select id from students where school_id = $1 and class_name = $2 and coalesce(status,'ACTIVE') <> 'GRADUATED'`,
        [me.school_id, data.className],
      );
    } else if (data.studentIds?.length) {
      students = await sql.query<{ id: string }>(
        `select id from students where school_id = $1 and id = any($2::text[])`,
        [me.school_id, data.studentIds],
      );
    } else {
      throw new Error("Pick a class, the whole school, or one or more students");
    }
    let created = 0;
    let skipped = 0;
    const stamp = Date.now().toString().slice(-8);
    for (const st of students) {
      const exists = await sql.query<{ id: string }>(
        `select id from billings
         where school_id = $1 and student_id = $2 and term = $3 and description = $4
         limit 1`,
        [me.school_id, st.id, ft[0].term, ft[0].name],
      );
      if (exists[0]) {
        skipped += 1;
        continue;
      }
      const id = crypto.randomUUID();
      const invoiceNo = `DIS-BILL-${stamp}-${String(created + 1).padStart(3, "0")}`;
      await sql.query(
        `insert into billings (id, school_id, student_id, invoice_no, term, description, total, paid)
         values ($1,$2,$3,$4,$5,$6,$7,0)`,
        [id, me.school_id, st.id, invoiceNo, ft[0].term, ft[0].name, ft[0].amount],
      );
      await postDouble(sql, {
        schoolId: me.school_id,
        date: todayIso(),
        term: ft[0].term,
        refType: "BILLING",
        refId: id,
        memo: `${invoiceNo} · ${ft[0].name}`,
        userId: me.user_id,
        debitAccount: "FEES_RECEIVABLE",
        creditAccount: "FEE_INCOME",
        amount: num(ft[0].amount),
      });
      created += 1;
    }
    await writeAudit(
      sql,
      me,
      "BILL_ALLOCATE",
      "fee_structures",
      data.feeTypeId,
      `${ft[0].name} · created ${created} · skipped ${skipped}`,
    );
    return { created, skipped, name: ft[0].name, term: ft[0].term };
  });

export const recordPayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      billingId: z.string().min(1),
      amount: z.number().positive(),
      method: z.string().min(1),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role)) throw new Error("Finance access required");
    const bill = await sql.query<{ id: string; total: string; paid: string; term: string }>(
      `select id, total::text, paid::text, term from billings where id = $1 and school_id = $2`,
      [data.billingId, me.school_id],
    );
    if (!bill[0]) throw new Error("Billing not found");
    const remaining = num(bill[0].total) - num(bill[0].paid);
    if (data.amount > remaining + 0.001) throw new Error("Amount exceeds remaining balance");
    const receiptNo = issueReceiptNo("RCP");
    const id = crypto.randomUUID();
    await sql.query(
      `insert into payments (id, school_id, billing_id, amount, method, receipt_no, recorded_by, status)
       values ($1,$2,$3,$4,$5,$6,$7,'POSTED')`,
      [id, me.school_id, data.billingId, data.amount, data.method, receiptNo, me.user_id],
    );
    await sql.query(`update billings set paid = paid + $1 where id = $2 and school_id = $3`, [
      data.amount,
      data.billingId,
      me.school_id,
    ]);
    await postDouble(sql, {
      schoolId: me.school_id,
      date: todayIso(),
      term: bill[0].term,
      refType: "PAYMENT",
      refId: id,
      memo: `Receipt ${receiptNo}`,
      userId: me.user_id,
      debitAccount: "CASH",
      creditAccount: "FEES_RECEIVABLE",
      amount: data.amount,
    });
    await logReceipt(sql, me.school_id, id, "ISSUED", me.user_id);
    await writeAudit(sql, me, "PAY", "payment", id, `Receipt ${receiptNo} · ${data.method} · ${data.amount}`);
    return { id, receiptNo };
  });

export const getReceipt = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    const rows = await sql.query<{
      id: string;
      receipt_no: string;
      amount: string;
      method: string;
      paid_at: string;
      status: string | null;
      void_reason: string | null;
      invoice_no: string;
      term: string;
      description: string;
      total: string;
      paid: string;
      student: string;
      admission_no: string;
      class_name: string;
      parent_email: string | null;
    }>(
      `select p.id, p.receipt_no, p.amount::text, p.method, p.paid_at::text, p.status, p.void_reason,
              b.invoice_no, b.term, b.description, b.total::text, b.paid::text,
              (s.first_name || ' ' || s.last_name) as student, s.admission_no, s.class_name, s.parent_email
       from payments p
       join billings b on b.id = p.billing_id
       join students s on s.id = b.student_id
       where p.id = $1 and p.school_id = $2`,
      [data.id, me.school_id],
    );
    const rec = rows[0] ?? null;
    if (rec) {
      if (!canFinance(me.role)) {
        if (me.role !== "PARENT") throw new Error("Finance access required");
        if (!rec.parent_email || rec.parent_email.toLowerCase() !== me.email.toLowerCase()) {
          throw new Error("You can only view receipts for your own child");
        }
      }
      return { ...rec, cashier: null as string | null, source: "FEE" as const };
    }

    await ensureServiceReceipts(sql);
    const svc = await sql.query<{
      id: string;
      receipt_no: string;
      amount: string;
      paid_at: string;
      term: string | null;
      kind: string;
      student: string;
      admission_no: string;
      class_name: string;
      parent_email: string | null;
      recorded_name: string | null;
    }>(
      `select c.id, coalesce(c.receipt_no, c.id) as receipt_no, c.amount::text, c.collected_at::text as paid_at,
              c.term, c.kind,
              case when s.id is null then 'Unassigned' else s.first_name || ' ' || s.last_name end as student,
              coalesce(s.admission_no, '—') as admission_no,
              coalesce(s.class_name, '—') as class_name,
              s.parent_email,
              c.recorded_name
       from service_collections c
       left join students s on s.id = c.student_id
       where c.id = $1 and c.school_id = $2`,
      [data.id, me.school_id],
    );
    const row = svc[0];
    if (!row) return null;
    if (!canServices(me.role) && !canFinance(me.role)) {
      if (me.role !== "PARENT") throw new Error("You cannot open this receipt");
      if (!row.parent_email || row.parent_email.toLowerCase() !== me.email.toLowerCase()) {
        throw new Error("You can only view receipts for your own child");
      }
    }
    return {
      id: row.id,
      receipt_no: row.receipt_no,
      amount: row.amount,
      method: "CASH",
      paid_at: row.paid_at,
      status: "POSTED",
      void_reason: null as string | null,
      invoice_no: "SVC",
      term: row.term || "",
      description: row.kind === "BUS" ? "Bus fare" : "Feeding",
      total: row.amount,
      paid: row.amount,
      student: row.student,
      admission_no: row.admission_no,
      class_name: row.class_name,
      parent_email: row.parent_email,
      cashier: row.recorded_name,
      source: "SERVICE" as const,
    };
  });

export const sendPaymentSms = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role)) throw new Error("Finance access required");
    const row = await sql.query<{
      id: string;
      receipt_no: string;
      amount: string;
      status: string | null;
      total: string;
      paid: string;
      student: string;
      parent_phone: string | null;
      phone: string | null;
    }>(
      `select p.id, p.receipt_no, p.amount::text, p.status,
              b.total::text, b.paid::text,
              (s.first_name || ' ' || s.last_name) as student, s.parent_phone, s.phone
       from payments p
       join billings b on b.id = p.billing_id
       join students s on s.id = b.student_id
       where p.id = $1 and p.school_id = $2`,
      [data.id, me.school_id],
    );
    if (!row[0]) throw new Error("Receipt not found");
    if (row[0].status && row[0].status !== "POSTED") throw new Error("Cannot SMS a cancelled receipt");
    const { receiptText, sendSms } = await import("@/lib/sms");
    const sms = await sendSms(
      row[0].parent_phone || row[0].phone,
      receiptText({
        studentName: row[0].student,
        amount: num(row[0].amount),
        receiptNo: row[0].receipt_no,
        balance: Math.max(0, num(row[0].total) - num(row[0].paid)),
      }),
    );
    await logReceipt(sql, me.school_id, data.id, sms.ok ? "SMS_SENT" : "SMS_FAIL", me.user_id, sms.error);
    await writeAudit(
      sql,
      me,
      sms.ok ? "SMS" : "SMS_FAIL",
      "payment",
      data.id,
      sms.ok
        ? `SMS ${row[0].receipt_no}${sms.mocked ? " (mock)" : ""}`
        : sms.error || "SMS failed",
    );
    if (!sms.ok) throw new Error(sms.error || "SMS failed");
    return sms;
  });

export const listPayments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role)) throw new Error("Finance access required");
    return sql.query<{
      id: string;
      receipt_no: string;
      amount: string;
      method: string;
      paid_at: string;
      status: string | null;
      student: string;
      invoice_no: string;
      class_name: string;
      description: string;
      term: string;
    }>(
      `select p.id, p.receipt_no, p.amount::text, p.method, p.paid_at::text, p.status,
              (s.first_name || ' ' || s.last_name) as student, b.invoice_no, s.class_name,
              b.description, b.term
       from payments p
       join billings b on b.id = p.billing_id
       join students s on s.id = b.student_id
       where p.school_id = $1
       order by s.class_name, s.last_name, s.first_name, p.paid_at desc
       limit 4000`,
      [me.school_id],
    );
  });

export const addOtherIncome = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      description: z.string().min(1),
      amount: z.number().positive(),
      incomeDate: z.string().min(1),
      notes: z.string().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role)) throw new Error("Finance access required");
    const term = termFromDate(data.incomeDate);
    const id = crypto.randomUUID();
    await sql.query(
      `insert into other_incomes (id, school_id, description, amount, income_date, notes, recorded_by, term)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        me.school_id,
        data.description.trim(),
        data.amount,
        data.incomeDate,
        data.notes || null,
        me.user_id,
        term,
      ],
    );
    await postDouble(sql, {
      schoolId: me.school_id,
      date: data.incomeDate,
      term,
      refType: "INCOME",
      refId: id,
      memo: data.description.trim(),
      userId: me.user_id,
      debitAccount: "CASH",
      creditAccount: "OTHER_INCOME",
      amount: data.amount,
    });
    return { ok: true };
  });

export const listOtherIncome = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role)) throw new Error("Finance access required");
    return sql.query<{
      id: string;
      description: string;
      amount: string;
      income_date: string;
      notes: string | null;
    }>(
      `select id, description, amount::text, income_date, notes
       from other_incomes where school_id = $1 order by created_at desc limit 80`,
      [me.school_id],
    );
  });

export const addExpense = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      category: z.string().min(1),
      amount: z.number().positive(),
      expenseDate: z.string().min(1),
      description: z.string().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role)) throw new Error("Finance access required");
    const term = termFromDate(data.expenseDate);
    const id = crypto.randomUUID();
    await sql.query(
      `insert into expenses (id, school_id, category, description, amount, expense_date, recorded_by, term)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        me.school_id,
        data.category,
        data.description || null,
        data.amount,
        data.expenseDate,
        me.user_id,
        term,
      ],
    );
    await postDouble(sql, {
      schoolId: me.school_id,
      date: data.expenseDate,
      term,
      refType: "EXPENSE",
      refId: id,
      memo: data.description?.trim() || data.category,
      userId: me.user_id,
      debitAccount: data.category === "Staff allowance" ? "SALARY" : "EXPENSE",
      creditAccount: "CASH",
      amount: data.amount,
    });
    return { ok: true };
  });

export const listExpenses = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role)) throw new Error("Finance access required");
    return sql.query<{
      id: string;
      category: string;
      description: string | null;
      amount: string;
      expense_date: string;
    }>(
      `select id, category, description, amount::text, expense_date
       from expenses where school_id = $1 order by expense_date desc limit 80`,
      [me.school_id],
    );
  });

export const collectService = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      kind: z.enum(["BUS", "FEEDING", "BOTH"]),
      studentId: z.string().optional(),
      amount: z.number().positive().optional(),
      feedingAmount: z.number().positive().optional(),
      busAmount: z.number().positive().optional(),
      notes: z.string().optional(),
      collectedOn: z.string().optional(),
      silent: z.boolean().optional(),
      skipEnroll: z.boolean().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canServices(me.role)) throw new Error("Service desk access required");
    await ensureServiceReceipts(sql);
    const collectedOn = (data.collectedOn || todayIso()).slice(0, 10);
    const term = termFromDate(collectedOn);
    const officer = `${me.first_name} ${me.last_name}`.trim();
    const lines: { kind: "BUS" | "FEEDING"; amount: number }[] = [];
    if (data.kind === "BOTH") {
      if (!data.feedingAmount || !data.busAmount) throw new Error("Enter feeding and bus amounts");
      lines.push({ kind: "FEEDING", amount: data.feedingAmount }, { kind: "BUS", amount: data.busAmount });
    } else if (data.kind === "FEEDING") {
      const n = data.feedingAmount ?? data.amount;
      if (!n) throw new Error("Enter feeding amount");
      lines.push({ kind: "FEEDING", amount: n });
    } else {
      const n = data.busAmount ?? data.amount;
      if (!n) throw new Error("Enter bus amount");
      lines.push({ kind: "BUS", amount: n });
    }

    const ids: string[] = [];
    const receipts: { id: string; receiptNo: string; kind: "BUS" | "FEEDING" }[] = [];
    for (const line of lines) {
      if (data.studentId) {
        const existing = await sql.query<{
          id: string;
          amount: string;
          receipt_no: string | null;
          kind: string;
          term: string | null;
          collected_on: string | null;
        }>(
          `select id, amount::text, receipt_no, kind, term, collected_on::text
           from service_collections
           where school_id = $1 and student_id = $2 and kind = $3 and collected_on = $4
           order by collected_at desc
           limit 1`,
          [me.school_id, data.studentId, line.kind, collectedOn],
        );
        if (existing[0]) {
          await adjustServiceAmount(sql, me, existing[0], line.amount);
          const receiptNo = existing[0].receipt_no || existing[0].id;
          receipts.push({ id: existing[0].id, receiptNo, kind: line.kind });
          ids.push(existing[0].id);
          continue;
        }
      }
      const id = crypto.randomUUID();
      const receiptNo = issueReceiptNo("SVC");
      await sql.query(
        `insert into service_collections (id, school_id, kind, student_id, amount, notes, recorded_by, recorded_name, term, receipt_no, collected_on)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id,
          me.school_id,
          line.kind,
          data.studentId || null,
          line.amount,
          data.notes || null,
          me.user_id,
          officer,
          term,
          receiptNo,
          collectedOn,
        ],
      );
      await postDouble(sql, {
        schoolId: me.school_id,
        date: collectedOn,
        term,
        refType: "SERVICE",
        refId: id,
        memo: `${line.kind} ${receiptNo}`,
        userId: me.user_id,
        debitAccount: "CASH",
        creditAccount: line.kind === "BUS" ? "BUS_INCOME" : "FEEDING_INCOME",
        amount: line.amount,
      });
      await logReceipt(sql, me.school_id, id, "ISSUED", me.user_id, receiptNo);
      await writeAudit(sql, me, "SERVICE", "service", id, `${line.kind} · ${receiptNo} · ${line.amount} · by ${officer}`);
      ids.push(id);
      receipts.push({ id, receiptNo, kind: line.kind });
      if (data.studentId && !data.skipEnroll) {
        await upsertServiceEnrollment(sql, {
          schoolId: me.school_id,
          studentId: data.studentId,
          onFeeding: line.kind === "FEEDING" ? true : undefined,
          onBus: line.kind === "BUS" ? true : undefined,
          enrolledBy: me.user_id,
        });
      }
    }

    let sms: { ok: boolean; mocked?: boolean; error?: string; provider?: string } = {
      ok: true,
      mocked: true,
    };
    if (data.studentId && !data.silent) {
      const st = await sql.query<{ student: string; parent_phone: string | null; phone: string | null }>(
        `select (first_name || ' ' || last_name) as student, parent_phone, phone
         from students where id = $1 and school_id = $2`,
        [data.studentId, me.school_id],
      );
      if (st[0]) {
        const { receiptText, sendSms } = await import("@/lib/sms");
        const total = lines.reduce((a, l) => a + l.amount, 0);
        const kindLabel =
          lines.length === 2 ? "Feeding & bus" : lines[0].kind === "BUS" ? "Bus" : "Feeding";
        const sent = await sendSms(
          st[0].parent_phone || st[0].phone,
          receiptText({
            studentName: st[0].student,
            amount: total,
            receiptNo: receipts.map((r) => r.receiptNo).join(", "),
            balance: 0,
            kind: kindLabel,
          }),
        );
        sms = sent;
        if (!sent.ok) {
          await writeAudit(sql, me, "SMS_FAIL", "service", ids[0], sent.error || "SMS failed");
        }
      }
    }
    return { ok: true, sms, n: lines.length, receipts };
  });

export const updateServiceTick = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1), amount: z.number().positive() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canServices(me.role)) throw new Error("Service desk access required");
    const row = await sql.query<{
      id: string;
      kind: string;
      amount: string;
      term: string | null;
      collected_on: string | null;
      receipt_no: string | null;
    }>(
      `select id, kind, amount::text, term, collected_on::text, receipt_no
       from service_collections where id = $1 and school_id = $2`,
      [data.id, me.school_id],
    );
    if (!row[0]) throw new Error("That tick was not found");
    await adjustServiceAmount(sql, me, row[0], data.amount);
    await writeAudit(
      sql,
      me,
      "SERVICE_EDIT",
      "service",
      row[0].id,
      `${row[0].kind} · ${row[0].receipt_no || row[0].id} · ${data.amount}`,
    );
    return {
      ok: true,
      id: row[0].id,
      amount: data.amount,
      receiptNo: row[0].receipt_no || row[0].id,
      kind: row[0].kind as "BUS" | "FEEDING",
    };
  });

export const voidServiceTick = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canServices(me.role)) throw new Error("Service desk access required");
    const row = await sql.query<{
      amount: string;
      kind: string;
      term: string | null;
      collected_on: string | null;
      receipt_no: string | null;
    }>(
      `select amount::text, kind, term, collected_on::text, receipt_no
       from service_collections where id = $1 and school_id = $2`,
      [data.id, me.school_id],
    );
    if (row[0]) {
      await postDouble(sql, {
        schoolId: me.school_id,
        date: (row[0].collected_on || todayIso()).slice(0, 10),
        term: row[0].term || termFromDate(row[0].collected_on || todayIso()),
        refType: "VOID",
        refId: data.id,
        memo: `Clear ${row[0].kind} ${row[0].receipt_no || data.id}`,
        userId: me.user_id,
        debitAccount: row[0].kind === "BUS" ? "BUS_INCOME" : "FEEDING_INCOME",
        creditAccount: "CASH",
        amount: num(row[0].amount),
      });
      await writeAudit(
        sql,
        me,
        "SERVICE_VOID",
        "service",
        data.id,
        `Cleared ${row[0].kind} · ${row[0].receipt_no || data.id}`,
      );
    }
    await sql.query(`delete from service_collections where id = $1 and school_id = $2`, [
      data.id,
      me.school_id,
    ]);
    return { ok: true };
  });

export const listServices = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canServices(me.role)) throw new Error("Service desk access required");
    await ensureServiceReceipts(sql);
    return sql.query<{
      id: string;
      kind: string;
      amount: string;
      notes: string | null;
      collected_at: string;
      collected_on: string | null;
      student: string | null;
      recorded_name: string | null;
      class_name: string | null;
      receipt_no: string;
    }>(
      `select c.id, c.kind, c.amount::text, c.notes, c.collected_at::text, c.collected_on::text,
              case when s.id is null then null else s.first_name || ' ' || s.last_name end as student,
              coalesce(c.recorded_name, nullif(trim(st.first_name || ' ' || st.last_name), '')) as recorded_name,
              s.class_name,
              coalesce(c.receipt_no, c.id) as receipt_no
       from service_collections c
       left join students s on s.id = c.student_id
       left join staff st on st.user_id = c.recorded_by
       where c.school_id = $1 order by s.class_name, s.last_name, s.first_name, c.collected_at desc limit 4000`,
      [me.school_id],
    );
  });

export const listServiceRoster = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ monday: z.string().optional() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canServices(me.role)) throw new Error("Service desk access required");
    await ensureServiceReceipts(sql);
    const monday = mondayOf(data.monday);
    const days = weekDayIsos(monday);
    const friday = days[4];
    const enrolled = await sql.query<{
      id: string;
      student_id: string;
      first_name: string;
      last_name: string;
      admission_no: string;
      class_name: string;
      on_feeding: boolean;
      on_bus: boolean;
      feeding_rate: string;
      bus_rate: string;
    }>(
      `select e.id, e.student_id, s.first_name, s.last_name, s.admission_no, s.class_name,
              e.on_feeding, e.on_bus, e.feeding_rate::text, e.bus_rate::text
       from service_enrollments e
       join students s on s.id = e.student_id
       where e.school_id = $1 and e.active = true and (e.on_feeding = true or e.on_bus = true)
         and coalesce(s.status,'ACTIVE') <> 'GRADUATED'`,
      [me.school_id],
    );
    const paid = await sql.query<{
      id: string;
      student_id: string;
      kind: string;
      amount: string;
      collected_on: string;
      receipt_no: string;
      collected_at: string;
    }>(
      `select c.id, c.student_id, c.kind, c.amount::text, c.collected_on::text as collected_on,
              coalesce(c.receipt_no, c.id) as receipt_no, c.collected_at::text
       from service_collections c
       where c.school_id = $1 and c.student_id is not null
         and c.collected_on >= $2 and c.collected_on <= $3
       order by c.collected_at desc`,
      [me.school_id, monday, friday],
    );
    type Cell = { id: string; amount: number; receiptNo: string };
    const cells = new Map<string, Cell>();
    for (const p of paid) {
      const key = `${p.student_id}|${p.kind}|${p.collected_on}`;
      if (cells.has(key)) continue;
      cells.set(key, { id: p.id, amount: num(p.amount), receiptNo: p.receipt_no });
    }
    const pupils = enrolled
      .map((e) => {
        const feeding: Record<string, Cell> = {};
        const bus: Record<string, Cell> = {};
        for (const day of days) {
          const f = cells.get(`${e.student_id}|FEEDING|${day}`);
          const b = cells.get(`${e.student_id}|BUS|${day}`);
          if (f) feeding[day] = f;
          if (b) bus[day] = b;
        }
        return {
          enrollmentId: e.id,
          studentId: e.student_id,
          firstName: e.first_name,
          lastName: e.last_name,
          name: `${e.first_name} ${e.last_name}`.trim(),
          admissionNo: e.admission_no,
          className: e.class_name || "Unassigned",
          onFeeding: Boolean(e.on_feeding),
          onBus: Boolean(e.on_bus),
          feedingRate: num(e.feeding_rate),
          busRate: num(e.bus_rate),
          feeding,
          bus,
        };
      })
      .sort(
        (a, b) =>
          sortClass(a.className, b.className) ||
          sortAlpha(a.firstName, b.firstName) ||
          sortAlpha(a.lastName, b.lastName),
      );
    const groups: { className: string; students: typeof pupils }[] = [];
    for (const p of pupils) {
      const last = groups[groups.length - 1];
      if (last && last.className === p.className) last.students.push(p);
      else groups.push({ className: p.className, students: [p] });
    }
    return { monday, days, groups, n: pupils.length };
  });

export const enrollOnService = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      studentId: z.string().min(1),
      onFeeding: z.boolean(),
      onBus: z.boolean(),
      feedingRate: z.number().min(0).optional(),
      busRate: z.number().min(0).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canServices(me.role)) throw new Error("Service desk access required");
    await ensureServiceReceipts(sql);
    if (!data.onFeeding && !data.onBus) throw new Error("Tick feeding, bus, or both");
    const st = await sql.query<{ id: string; first_name: string; last_name: string }>(
      `select id, first_name, last_name from students where id = $1 and school_id = $2`,
      [data.studentId, me.school_id],
    );
    if (!st[0]) throw new Error("Student is not enrolled in the school");
    await upsertServiceEnrollment(sql, {
      schoolId: me.school_id,
      studentId: data.studentId,
      onFeeding: data.onFeeding,
      onBus: data.onBus,
      feedingRate: data.feedingRate,
      busRate: data.busRate,
      enrolledBy: me.user_id,
    });
    await writeAudit(
      sql,
      me,
      "SERVICE_ENROLL",
      "service_enrollments",
      data.studentId,
      `${st[0].first_name} ${st[0].last_name} · feeding=${data.onFeeding} bus=${data.onBus}`,
    );
    return { ok: true };
  });

export const dropFromService = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ studentId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canServices(me.role)) throw new Error("Service desk access required");
    await ensureServiceReceipts(sql);
    await sql.query(
      `update service_enrollments
       set on_feeding = false, on_bus = false, active = false
       where school_id = $1 and student_id = $2`,
      [me.school_id, data.studentId],
    );
    await writeAudit(sql, me, "SERVICE_DROP", "service_enrollments", data.studentId, "Removed from feeding/bus list");
    return { ok: true };
  });


export const seedClasses = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canAcademic(me.role)) throw new Error("Academic access required");
    for (const name of GHANA_CLASS_LEVELS) {
      await sql.query(
        `insert into classes (id, school_id, name) values ($1,$2,$3)
         on conflict (school_id, name) do nothing`,
        [crypto.randomUUID(), me.school_id, name],
      );
    }
    return { ok: true, count: GHANA_CLASS_LEVELS.length };
  });

export const listClasses = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    await ensureSubjectCatalog(sql, me.school_id);
    await ensureClassDefaultSubjects(sql, me.school_id);
    return sql.query<{ id: string; name: string }>(
      `select id, name from classes where school_id = $1`,
      [me.school_id],
    );
  });

export const assignSubjects = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      className: z.string().min(1),
      teacherUserId: z.string().min(1),
      subjects: z.array(z.string()).min(1),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canAcademic(me.role)) throw new Error("Academic access required");
    const teacher = await sql.query<{ user_id: string }>(
      `select user_id from staff where school_id = $1 and (user_id = $2 or id = $2) limit 1`,
      [me.school_id, data.teacherUserId],
    );
    const teacherUserId = teacher[0]?.user_id || data.teacherUserId;
    for (const subject of data.subjects) {
      await sql.query(
        `insert into class_subjects (id, school_id, class_name, subject_name, teacher_user_id)
         values ($1,$2,$3,$4,$5)
         on conflict (school_id, class_name, subject_name)
         do update set teacher_user_id = excluded.teacher_user_id`,
        [crypto.randomUUID(), me.school_id, data.className, subject, teacherUserId],
      );
    }
    return { ok: true, n: data.subjects.length };
  });

export const renameClassSubject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string().min(1),
      subjectName: z.string().min(1).max(80),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canAcademic(me.role)) throw new Error("Academic access required");
    const name = data.subjectName.trim();
    if (!name) throw new Error("Subject name is required");
    const row = await sql.query<{ class_name: string; subject_name: string }>(
      `select class_name, subject_name from class_subjects where id = $1 and school_id = $2`,
      [data.id, me.school_id],
    );
    if (!row[0]) throw new Error("Subject not found");
    const clash = await sql.query<{ id: string }>(
      `select id from class_subjects
       where school_id = $1 and class_name = $2 and lower(subject_name) = $3 and id <> $4`,
      [me.school_id, row[0].class_name, name.toLowerCase(), data.id],
    );
    if (clash[0]) throw new Error("That class already has this subject name");
    const old = row[0].subject_name;
    await sql.query(`update class_subjects set subject_name = $1 where id = $2 and school_id = $3`, [
      name,
      data.id,
      me.school_id,
    ]);
    await sql.query(
      `update student_marks set subject = $1
       where school_id = $2 and class_name = $3 and subject = $4`,
      [name, me.school_id, row[0].class_name, old],
    );
    await sql.query(
      `update homework set subject_name = $1
       where school_id = $2 and class_name = $3 and subject_name = $4`,
      [name, me.school_id, row[0].class_name, old],
    );
    await sql.query(
      `update timetable_slots set subject_name = $1
       where school_id = $2 and class_name = $3 and subject_name = $4`,
      [name, me.school_id, row[0].class_name, old],
    );
    await writeAudit(sql, me, "SUBJECT_RENAME", "class_subjects", data.id, `${row[0].class_name}: ${old} → ${name}`);
    return { ok: true };
  });

export const deleteClassSubject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canAcademic(me.role)) throw new Error("Academic access required");
    const row = await sql.query<{ class_name: string; subject_name: string }>(
      `select class_name, subject_name from class_subjects where id = $1 and school_id = $2`,
      [data.id, me.school_id],
    );
    if (!row[0]) throw new Error("Subject not found");
    await sql.query(`delete from class_subjects where id = $1 and school_id = $2`, [data.id, me.school_id]);
    await writeAudit(
      sql,
      me,
      "SUBJECT_DELETE",
      "class_subjects",
      data.id,
      `${row[0].class_name}: removed ${row[0].subject_name}`,
    );
    return { ok: true };
  });

async function ensureSubjectCatalog(sql: SqlClient, schoolId: string) {
  for (const [band, names] of Object.entries(GES_SUBJECTS)) {
    for (const name of names) {
      await sql.query(
        `insert into school_subjects (id, school_id, band, kind, name)
         values ($1,$2,$3,'GES',$4)
         on conflict (school_id, band, name) do nothing`,
        [crypto.randomUUID(), schoolId, band, name],
      );
    }
  }
}

async function ensureClassDefaultSubjects(sql: SqlClient, schoolId: string) {
  for (const [className, names] of Object.entries(CLASS_DEFAULT_SUBJECTS)) {
    const keep = names.map((n) => n.toLowerCase());
    const existing = await sql.query<{ id: string; subject_name: string }>(
      `select id, subject_name from class_subjects where school_id = $1 and class_name = $2`,
      [schoolId, className],
    );
    for (const row of existing) {
      if (!keep.includes(row.subject_name.toLowerCase())) {
        await sql.query(`delete from class_subjects where id = $1 and school_id = $2`, [row.id, schoolId]);
      }
    }
    for (const name of names) {
      await sql.query(
        `insert into class_subjects (id, school_id, class_name, subject_name)
         values ($1,$2,$3,$4)
         on conflict (school_id, class_name, subject_name) do nothing`,
        [crypto.randomUUID(), schoolId, className, name],
      );
    }
  }
}

export const listSubjectCatalog = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    await ensureSubjectCatalog(sql, me.school_id);
    await ensureClassDefaultSubjects(sql, me.school_id);
    return sql.query<{ id: string; band: string; kind: string; name: string }>(
      `select id, band, kind, name from school_subjects where school_id = $1
       order by band, kind, name`,
      [me.school_id],
    );
  });

export const saveCatalogSubject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string().optional(),
      band: z.enum(["NURSERY", "KG", "EARLY", "PRIMARY", "JHS", "EXTRA"]),
      name: z.string().min(1).max(80),
      kind: z.enum(["GES", "SCHOOL", "EXTRA"]).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canAcademic(me.role)) throw new Error("Academic access required");
    const name = data.name.trim();
    const kind = data.band === "EXTRA" ? "EXTRA" : (data.kind ?? (data.id ? undefined : "SCHOOL"));
    if (data.id) {
      const old = await sql.query<{ name: string; band: string }>(
        `select name, band from school_subjects where id = $1 and school_id = $2`,
        [data.id, me.school_id],
      );
      if (!old[0]) throw new Error("Subject not in catalogue");
      await sql.query(
        `update school_subjects set name = $1, band = $2 where id = $3 and school_id = $4`,
        [name, data.band, data.id, me.school_id],
      );
      if (old[0].name !== name) {
        await sql.query(
          `update class_subjects set subject_name = $1
           where school_id = $2 and subject_name = $3`,
          [name, me.school_id, old[0].name],
        );
        await sql.query(
          `update student_marks set subject = $1 where school_id = $2 and subject = $3`,
          [name, me.school_id, old[0].name],
        );
        await sql.query(
          `update homework set subject_name = $1 where school_id = $2 and subject_name = $3`,
          [name, me.school_id, old[0].name],
        );
        await sql.query(
          `update timetable_slots set subject_name = $1 where school_id = $2 and subject_name = $3`,
          [name, me.school_id, old[0].name],
        );
      }
      return { ok: true, id: data.id };
    }
    const id = crypto.randomUUID();
    await sql.query(
      `insert into school_subjects (id, school_id, band, kind, name)
       values ($1,$2,$3,$4,$5)
       on conflict (school_id, band, name) do update set kind = excluded.kind`,
      [id, me.school_id, data.band, kind || "SCHOOL", name],
    );
    return { ok: true, id };
  });

export const deleteCatalogSubject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canAcademic(me.role)) throw new Error("Academic access required");
    await sql.query(`delete from school_subjects where id = $1 and school_id = $2`, [
      data.id,
      me.school_id,
    ]);
    return { ok: true };
  });

export const importGesSubjects = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ band: z.enum(["NURSERY", "KG", "EARLY", "PRIMARY", "JHS", "ALL"]) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canAcademic(me.role)) throw new Error("Academic access required");
    const bands =
      data.band === "ALL" ? (["NURSERY", "KG", "EARLY", "PRIMARY", "JHS"] as const) : [data.band];
    let added = 0;
    for (const band of bands) {
      for (const name of GES_SUBJECTS[band]) {
        const row = await sql.query<{ id: string }>(
          `insert into school_subjects (id, school_id, band, kind, name)
           values ($1,$2,$3,'GES',$4)
           on conflict (school_id, band, name) do nothing
           returning id`,
          [crypto.randomUUID(), me.school_id, band, name],
        );
        if (row[0]) added += 1;
      }
    }
    await writeAudit(sql, me, "SUBJECT_GES", "school_subjects", me.school_id, `Imported GES ${data.band}: ${added} new`);
    return { added };
  });

export const listAssignments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    await ensureClassDefaultSubjects(sql, me.school_id);
    return sql.query<{
      id: string;
      class_name: string;
      subject_name: string;
      teacher: string | null;
    }>(
      `select cs.id, cs.class_name, cs.subject_name,
              case when st.id is null then null else st.first_name || ' ' || st.last_name end as teacher
       from class_subjects cs
       left join staff st on st.user_id = cs.teacher_user_id
       where cs.school_id = $1
       order by cs.class_name, cs.subject_name`,
      [me.school_id],
    );
  });

export const inviteStaff = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      email: z.string().email(),
      role: z.enum([
        "SUPER_ADMIN",
        "SCHOOL_ADMIN",
        "ACCOUNTANT",
        "TEACHER",
        "SERVICE_OFFICER",
        "PARENT",
      ]),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      password: z.string().min(8),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canStaff(me.role)) throw new Error("Only Super Admin or Accountant can issue logins");
    if (me.role === "ACCOUNTANT" && data.role === "SUPER_ADMIN") {
      throw new Error("Accountant cannot create a Super Admin login");
    }
    const email = cleanEmail(data.email);
    const name = `${data.firstName.trim()} ${data.lastName.trim()}`.trim();
    const existingStaff = await sql.query<{ id: string; user_id: string }>(
      `select id, user_id from staff where school_id = $1 and lower(email) = $2`,
      [me.school_id, email],
    );
    if (existingStaff[0]) {
      await sql.query(
        `update staff set role = $1, first_name = $2, last_name = $3 where id = $4`,
        [data.role, data.firstName.trim(), data.lastName.trim(), existingStaff[0].id],
      );
      await applyPasswordToUser(sql, existingStaff[0].user_id, data.password);
      await writeAudit(sql, me, "LOGIN_ISSUE", "staff", existingStaff[0].id, `Updated login ${email} · ${data.role}`);
      return { ok: true, updated: true };
    }
    let user = await sql.query<{ id: string }>(
      `select id from "user" where lower(email) = $1`,
      [email],
    );
    let userId = user[0]?.id;
    if (!userId) {
      userId = crypto.randomUUID();
      await sql.query(
        `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
         values ($1,$2,$3,true,now(),now())`,
        [userId, name, email],
      );
    }
    await applyPasswordToUser(sql, userId, data.password);
    await sql.query(
      `insert into staff (id, user_id, school_id, role, first_name, last_name, email)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        crypto.randomUUID(),
        userId,
        me.school_id,
        data.role,
        data.firstName.trim(),
        data.lastName.trim(),
        email,
      ],
    );
    await sql.query(`delete from invitations where school_id = $1 and lower(email) = $2`, [
      me.school_id,
      email,
    ]);
    await writeAudit(sql, me, "LOGIN_ISSUE", "staff", userId, `Issued login ${email} · ${data.role}`);
    return { ok: true, updated: false };
  });

export const listStaff = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    const staff = await sql.query<StaffRow & { password_set: boolean }>(
      `select s.id, s.user_id, s.school_id, s.role, s.first_name, s.last_name, s.email,
              exists (
                select 1 from account a
                where a."userId" = s.user_id and a.password is not null and a.password <> ''
              ) as password_set
       from staff s where s.school_id = $1 and s.role <> 'PARENT' order by s.role, s.last_name`,
      [me.school_id],
    );
    const invites = await sql.query<{
      email: string;
      role: string;
      first_name: string;
      last_name: string;
    }>(
      `select email, role, first_name, last_name from invitations where school_id = $1`,
      [me.school_id],
    );
    if (me.role === "TEACHER") {
      return { staff: staff.filter((s) => s.user_id === me.user_id), invites: [], me };
    }
    if (me.role !== "SUPER_ADMIN" && me.role !== "ACCOUNTANT") {
      for (const s of staff) s.password_set = false;
    }
    return { staff, invites: canStaff(me.role) ? invites : [], me };
  });

export const markAttendance = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      studentId: z.string(),
      className: z.string(),
      day: z.string(),
      status: z.enum(["Present", "Absent", "Late"]),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (me.role !== "TEACHER" && me.role !== "SUPER_ADMIN" && me.role !== "SCHOOL_ADMIN") {
      throw new Error("Attendance is for teachers");
    }
    const st = await sql.query<{ id: string; class_name: string }>(
      `select id, class_name from students where id = $1 and school_id = $2`,
      [data.studentId, me.school_id],
    );
    if (!st[0]) throw new Error("Student not found");
    if (st[0].class_name !== data.className) {
      throw new Error("That student is not in the class you selected");
    }
    if (me.role === "TEACHER") {
      const hit = await sql.query<{ id: string }>(
        `select id from class_subjects
         where school_id = $1 and (teacher_user_id = $2 or teacher_user_id = $3) and class_name = $4
         limit 1`,
        [me.school_id, me.user_id, me.id, st[0].class_name],
      );
      if (!hit[0]) {
        throw new Error(
          `You are not assigned to ${st[0].class_name}. Ask School Admin to assign you.`,
        );
      }
    }
    await sql.query(
      `insert into attendance (id, school_id, student_id, class_name, day, status, marked_by)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (student_id, day) do update set status = excluded.status, class_name = excluded.class_name, marked_by = excluded.marked_by`,
      [
        crypto.randomUUID(),
        me.school_id,
        st[0].id,
        st[0].class_name,
        data.day,
        data.status,
        me.user_id,
      ],
    );
    return { ok: true };
  });

export const listAttendance = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ day: z.string(), className: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (me.role !== "TEACHER" && me.role !== "SUPER_ADMIN" && me.role !== "SCHOOL_ADMIN") {
      throw new Error("Attendance is for teachers");
    }
    if (me.role === "TEACHER") {
      const hit = await sql.query<{ id: string }>(
        `select id from class_subjects
         where school_id = $1 and (teacher_user_id = $2 or teacher_user_id = $3) and class_name = $4
         limit 1`,
        [me.school_id, me.user_id, me.id, data.className],
      );
      if (!hit[0]) return [];
    }
    return sql.query<{ student_id: string; status: string }>(
      `select student_id, status from attendance
       where school_id = $1 and day = $2 and class_name = $3`,
      [me.school_id, data.day, data.className],
    );
  });

function canMarks(role: StaffRole) {
  return role === "TEACHER" || role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN";
}

async function teacherLoad(
  sql: Awaited<ReturnType<typeof getSql>>,
  schoolId: string,
  userId: string,
) {
  const staff = await sql.query<{ id: string }>(
    `select id from staff where school_id = $1 and user_id = $2 limit 1`,
    [schoolId, userId],
  );
  const staffId = staff[0]?.id ?? userId;
  return sql.query<{ class_name: string; subject_name: string }>(
    `select class_name, subject_name from class_subjects
     where school_id = $1 and (teacher_user_id = $2 or teacher_user_id = $3)
     order by class_name, subject_name`,
    [schoolId, userId, staffId],
  );
}

async function assertTeacherMayEnterMark(
  sql: Awaited<ReturnType<typeof getSql>>,
  me: StaffRow,
  studentId: string,
  subject: string,
): Promise<{ id: string; class_name: string }> {
  const st = await sql.query<{ id: string; class_name: string }>(
    `select id, class_name from students where id = $1 and school_id = $2`,
    [studentId, me.school_id],
  );
  if (!st[0]) throw new Error("Student not found");
  if (me.role !== "TEACHER") return st[0];
  const hit = await sql.query<{ id: string }>(
    `select id from class_subjects
     where school_id = $1 and (teacher_user_id = $2 or teacher_user_id = $3)
       and class_name = $4 and subject_name = $5
     limit 1`,
    [me.school_id, me.user_id, me.id, st[0].class_name, subject],
  );
  if (!hit[0]) {
    throw new Error(
      `You are not assigned to teach ${subject} in ${st[0].class_name}. Ask School Admin to assign you.`,
    );
  }
  return st[0];
}

export const listTeachingLoad = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canMarks(me.role)) throw new Error("Only teachers can view a teaching load");
    if (me.role === "TEACHER") {
      return { me, load: await teacherLoad(sql, me.school_id, me.user_id) };
    }
    const load = await sql.query<{ class_name: string; subject_name: string }>(
      `select class_name, subject_name from class_subjects
       where school_id = $1 order by class_name, subject_name`,
      [me.school_id],
    );
    return { me, load };
  });

export const saveMark = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      studentId: z.string().min(1),
      className: z.string().min(1),
      subject: z.string().min(1),
      term: z.string().min(1),
      assessmentType: z.string().min(1).max(80).default("Class test"),
      score: z.number().min(0).max(100),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canMarks(me.role)) throw new Error("Only teachers can enter marks");
    const st = await assertTeacherMayEnterMark(sql, me, data.studentId, data.subject.trim());
    if (me.role === "TEACHER" && data.className !== st.class_name) {
      throw new Error("Student is not in the class you selected");
    }
    const kind = data.assessmentType.trim() || "Class test";
    await sql.query(
      `alter table student_marks add column if not exists assessment_type text not null default 'Class test'`,
    );
    await sql.query(
      `alter table student_marks drop constraint if exists student_marks_student_id_subject_term_key`,
    );
    await sql.query(
      `create unique index if not exists student_marks_unique_assessment
       on student_marks (student_id, subject, term, assessment_type)`,
    );
    await sql.query(
      `insert into student_marks (id, school_id, student_id, class_name, subject, term, assessment_type, score, out_of, recorded_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,100,$9)
       on conflict (student_id, subject, term, assessment_type) do update set score = excluded.score, class_name = excluded.class_name, recorded_by = excluded.recorded_by`,
      [
        crypto.randomUUID(),
        me.school_id,
        st.id,
        st.class_name,
        data.subject.trim(),
        data.term,
        kind,
        data.score,
        me.user_id,
      ],
    );
    await writeAudit(
      sql,
      me,
      "MARK",
      "mark",
      st.id,
      `${st.class_name} · ${data.subject.trim()} · ${kind} · ${data.term} · ${data.score}/100`,
    );
    return { ok: true };
  });

export const listAccumulatedMarks = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    const rows = await sql.query<{
      id: string;
      student_id: string;
      class_name: string;
      subject: string;
      term: string;
      assessment_type: string;
      score: string;
      admission_no: string;
      first_name: string;
      last_name: string;
    }>(
      `select m.id, m.student_id, m.class_name, m.subject, m.term,
              coalesce(m.assessment_type,'Class test') as assessment_type, m.score::text,
              s.admission_no, s.first_name, s.last_name
       from student_marks m
       join students s on s.id = m.student_id
       where m.school_id = $1
       order by m.class_name, s.last_name, s.first_name, m.term, m.subject, m.assessment_type`,
      [me.school_id],
    );
    if (me.role === "TEACHER") {
      const assigned = await teacherLoad(sql, me.school_id, me.user_id);
      if (assigned.length === 0) return [];
      const allow = new Set(assigned.map((a) => `${a.class_name}\0${a.subject_name}`));
      return rows.filter((r) => allow.has(`${r.class_name}\0${r.subject}`));
    }
    return rows;
  });

export const getStudentRecord = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ studentId: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    const st = await sql.query<{
      id: string;
      class_name: string;
      parent_email: string | null;
    }>(
      `select id, class_name, parent_email from students where id = $1 and school_id = $2`,
      [data.studentId, me.school_id],
    );
    if (!st[0]) throw new Error("Student not found");
    if (me.role === "PARENT") {
      const email = (me.email || "").toLowerCase();
      if (!st[0].parent_email || st[0].parent_email.toLowerCase() !== email) {
        throw new Error("You can only open your own child's record");
      }
    } else if (me.role === "TEACHER") {
      const hit = await sql.query<{ id: string }>(
        `select id from class_subjects
         where school_id = $1 and (teacher_user_id = $2 or teacher_user_id = $3) and class_name = $4
         limit 1`,
        [me.school_id, me.user_id, me.id, st[0].class_name],
      );
      if (!hit[0]) throw new Error("You can only open students in a class assigned to you");
    } else if (
      me.role !== "SUPER_ADMIN" &&
      me.role !== "SCHOOL_ADMIN" &&
      me.role !== "ACCOUNTANT"
    ) {
      throw new Error("You cannot open this student record");
    }
    const marks = await sql.query<{
      subject: string;
      term: string;
      assessment_type: string;
      score: string;
      class_name: string;
    }>(
      `select subject, term, coalesce(assessment_type,'Class test') as assessment_type, score::text, class_name
       from student_marks where school_id = $1 and student_id = $2
       order by term, subject, assessment_type`,
      [me.school_id, data.studentId],
    );
    const attendance = await sql.query<{ day: string; status: string; class_name: string }>(
      `select day, status, class_name from attendance
       where school_id = $1 and student_id = $2
       order by day desc limit 40`,
      [me.school_id, data.studentId],
    );
    await ensureServiceReceipts(sql);
    const services = await sql.query<{
      id: string;
      kind: string;
      amount: string;
      collected_at: string;
      recorded_name: string | null;
      receipt_no: string;
    }>(
      `select id, kind, amount::text, collected_at::text, recorded_name,
              coalesce(receipt_no, id) as receipt_no
       from service_collections where school_id = $1 and student_id = $2
       order by collected_at desc limit 40`,
      [me.school_id, data.studentId],
    );
    const bills = await sql.query<{
      invoice_no: string;
      term: string;
      description: string;
      total: string;
      paid: string;
    }>(
      `select invoice_no, term, description, total::text, paid::text
       from billings where school_id = $1 and student_id = $2
       order by created_at desc`,
      [me.school_id, data.studentId],
    );
    const receipts = await sql.query<{
      id: string;
      receipt_no: string;
      amount: string;
      paid_at: string;
      status: string | null;
      description: string;
    }>(
      `select p.id, p.receipt_no, p.amount::text, p.paid_at::text, p.status, b.description
       from payments p
       join billings b on b.id = p.billing_id
       where p.school_id = $1 and b.student_id = $2
       order by p.paid_at desc`,
      [me.school_id, data.studentId],
    );
    return { marks, attendance, services, bills, receipts };
  });

function requireSuper(role: StaffRole) {
  if (role !== "SUPER_ADMIN") throw new Error("Only Super Admin can do this");
}

export const updateStudent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    enrollSchema.extend({
      id: z.string(),
      admissionNo: z.string().trim().min(2).max(32).optional(),
      status: z.enum(["ACTIVE", "LEFT", "GRADUATED"]).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canEnroll(me.role)) throw new Error("Only Super Admin or Accountant can change student details");
    await ensureStudentColumns(sql);
    const current = await sql.query<{
      photo_url: string | null;
      parent_email: string | null;
      parent_name: string | null;
      admission_no: string;
    }>(
      `select photo_url, parent_email, parent_name, admission_no
       from students where id = $1 and school_id = $2`,
      [data.id, me.school_id],
    );
    if (!current[0]) throw new Error("Student not found");

    let admission = current[0].admission_no;
    if (data.admissionNo) {
      const next = data.admissionNo.replace(/\s+/g, "").toUpperCase();
      if (next !== current[0].admission_no) {
        const clash = await sql.query<{ id: string }>(
          `select id from students where school_id = $1 and admission_no = $2 and id <> $3`,
          [me.school_id, next, data.id],
        );
        if (clash[0]) throw new Error(`Admission number ${next} is already used`);
        admission = next;
      }
    }

    const parentEmail = (data.parentEmail || "").toLowerCase().trim() || null;
    const oldEmail = (current[0].parent_email || "").toLowerCase().trim();
    if (parentEmail && parentEmail !== oldEmail) {
      const parentStaff = oldEmail
        ? await sql.query<{ id: string; user_id: string }>(
            `select id, user_id from staff where school_id = $1 and lower(email) = $2 and role = 'PARENT'`,
            [me.school_id, oldEmail],
          )
        : [];
      const taken = await sql.query<{ id: string }>(
        `select id from "user" where lower(email) = $1`,
        [parentEmail],
      );
      if (taken[0] && taken[0].id !== parentStaff[0]?.user_id) {
        throw new Error("That parent email already has a login");
      }
    }

    const { persistStudentPhoto } = await import("@/lib/student-photo");
    const photoUrl = await persistStudentPhoto(data.photoUrl, current[0].photo_url);
    await sql.query(
      `update students set first_name=$1, last_name=$2, class_name=$3, gender=$4, dob=$5,
        phone=$6, address=$7, notes=$8, parent_name=$9, parent_phone=$10, parent_email=$11,
        previous_school=$12, nhis_number=$13, photo_url=$14, enrolled_on=$15,
        admission_no=$16, status=$17
       where id=$18 and school_id=$19`,
      [
        data.firstName.trim(),
        data.lastName.trim(),
        data.className,
        data.gender || null,
        data.dob || null,
        data.phone || null,
        data.address || null,
        data.notes || null,
        data.parentName || null,
        data.parentPhone || null,
        parentEmail,
        data.previousSchool || null,
        data.nhisNumber || null,
        photoUrl,
        (data.enrolledOn || todayIso()).slice(0, 10),
        admission,
        data.status || "ACTIVE",
        data.id,
        me.school_id,
      ],
    );

    if (parentEmail && oldEmail && parentEmail !== oldEmail) {
      const parentStaff = await sql.query<{ id: string; user_id: string }>(
        `select id, user_id from staff where school_id = $1 and lower(email) = $2 and role = 'PARENT'`,
        [me.school_id, oldEmail],
      );
      if (parentStaff[0]) {
        await sql.query(`update staff set email = $1 where id = $2`, [parentEmail, parentStaff[0].id]);
        await sql.query(`update "user" set email = $1, "updatedAt" = now() where id = $2`, [
          parentEmail,
          parentStaff[0].user_id,
        ]);
      }
    }
    const loginEmail = parentEmail || oldEmail;
    if (data.parentName && loginEmail) {
      const parts = data.parentName.trim().split(/\s+/);
      const first = parts[0] || "Parent";
      const last = parts.slice(1).join(" ") || "Guardian";
      await sql.query(
        `update staff set first_name = $1, last_name = $2 where school_id = $3 and lower(email) = $4 and role = 'PARENT'`,
        [first, last, me.school_id, loginEmail],
      );
    }

    await writeAudit(
      sql,
      me,
      "STUDENT_EDIT",
      "student",
      data.id,
      `Updated ${data.firstName.trim()} ${data.lastName.trim()} · ${admission}`,
    );
    return { ok: true };
  });

export const deleteStudent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    requireSuper(me.role);
    await ensureCumulativeTable(sql);
    await sql.query(`delete from cumulative_records where student_id = $1 and school_id = $2`, [
      data.id,
      me.school_id,
    ]);
    await sql.query(
      `delete from payments where school_id = $1 and billing_id in
        (select id from billings where student_id = $2)`,
      [me.school_id, data.id],
    );
    await sql.query(`delete from billings where school_id = $1 and student_id = $2`, [
      me.school_id,
      data.id,
    ]);
    await sql.query(`delete from attendance where school_id = $1 and student_id = $2`, [
      me.school_id,
      data.id,
    ]);
    await sql.query(`delete from student_marks where school_id = $1 and student_id = $2`, [
      me.school_id,
      data.id,
    ]);
    await sql.query(
      `update service_collections set student_id = null where school_id = $1 and student_id = $2`,
      [me.school_id, data.id],
    );
    await sql.query(`delete from students where id = $1 and school_id = $2`, [
      data.id,
      me.school_id,
    ]);
    return { ok: true };
  });

export const updateStaffProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string(),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
      role: z.enum([
        "SUPER_ADMIN",
        "SCHOOL_ADMIN",
        "ACCOUNTANT",
        "TEACHER",
        "SERVICE_OFFICER",
        "PARENT",
      ]),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    requireSuper(me.role);
    const email = cleanEmail(data.email);
    const row = await sql.query<{ user_id: string }>(
      `select user_id from staff where id = $1 and school_id = $2`,
      [data.id, me.school_id],
    );
    if (!row[0]) throw new Error("Profile not found");
    await sql.query(
      `update staff set first_name=$1, last_name=$2, email=$3, role=$4 where id=$5 and school_id=$6`,
      [data.firstName, data.lastName, email, data.role, data.id, me.school_id],
    );
    await sql.query(`update "user" set name=$1, email=$2 where id=$3`, [
      `${data.firstName} ${data.lastName}`,
      email,
      row[0].user_id,
    ]);
    return { ok: true };
  });

export const setStaffPassword = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string(),
      password: z.string().min(8),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canStaff(me.role)) throw new Error("Only Super Admin or Accountant can set logins");
    const row = await sql.query<{ user_id: string; role: StaffRole }>(
      `select user_id, role from staff where id = $1 and school_id = $2`,
      [data.id, me.school_id],
    );
    if (!row[0]) throw new Error("Profile not found");
    if (me.role === "ACCOUNTANT" && row[0].role === "SUPER_ADMIN") {
      throw new Error("Accountant cannot change a Super Admin password");
    }
    if (data.password.length < 8) throw new Error("Password must be at least 8 characters");
    await applyPasswordToUser(sql, row[0].user_id, data.password);
    return { ok: true };
  });

export const deleteStaffProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    requireSuper(me.role);
    const row = await sql.query<{ user_id: string; role: StaffRole }>(
      `select user_id, role from staff where id = $1 and school_id = $2`,
      [data.id, me.school_id],
    );
    if (!row[0]) throw new Error("Profile not found");
    if (row[0].user_id === me.user_id) throw new Error("You cannot delete your own profile");
    if (row[0].role === "SUPER_ADMIN") {
      const n = await sql.query<{ n: number }>(
        `select count(*)::int as n from staff where school_id = $1 and role = 'SUPER_ADMIN'`,
        [me.school_id],
      );
      if ((n[0]?.n ?? 0) <= 1) throw new Error("Keep at least one Super Admin");
    }
    await sql.query(`delete from staff where id = $1 and school_id = $2`, [data.id, me.school_id]);
    await sql.query(`delete from "session" where "userId" = $1`, [row[0].user_id]);
    await sql.query(`delete from account where "userId" = $1`, [row[0].user_id]);
    await sql.query(`delete from "user" where id = $1`, [row[0].user_id]);
    return { ok: true };
  });

export const deleteInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ email: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    requireSuper(me.role);
    await sql.query(`delete from invitations where school_id = $1 and lower(email) = $2`, [
      me.school_id,
      data.email.toLowerCase(),
    ]);
    return { ok: true };
  });

export const updateBilling = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string(),
      term: z.string().min(1),
      description: z.string().min(1),
      total: z.number().positive(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role)) throw new Error("Finance access required");
    const bill = await sql.query<{ paid: string }>(
      `select paid::text from billings where id = $1 and school_id = $2`,
      [data.id, me.school_id],
    );
    if (!bill[0]) throw new Error("Billing not found");
    if (data.total + 0.001 < num(bill[0].paid)) throw new Error("Total cannot be less than already paid");
    await sql.query(
      `update billings set term=$1, description=$2, total=$3 where id=$4 and school_id=$5`,
      [data.term, data.description, data.total, data.id, me.school_id],
    );
    return { ok: true };
  });

export const deleteBilling = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    requireSuper(me.role);
    await sql.query(`delete from payments where school_id = $1 and billing_id = $2`, [
      me.school_id,
      data.id,
    ]);
    await sql.query(`delete from billings where id = $1 and school_id = $2`, [
      data.id,
      me.school_id,
    ]);
    return { ok: true };
  });

async function cancelPostedPayment(
  sql: SqlClient,
  me: StaffRow,
  paymentId: string,
  action: "VOID" | "REFUND",
  reason: string,
) {
  const p = await sql.query<{
    id: string;
    billing_id: string;
    amount: string;
    status: string | null;
    receipt_no: string;
    term: string;
  }>(
    `select p.id, p.billing_id, p.amount::text, p.status, p.receipt_no, b.term
     from payments p join billings b on b.id = p.billing_id
     where p.id = $1 and p.school_id = $2`,
    [paymentId, me.school_id],
  );
  if (!p[0]) throw new Error("Receipt not found");
  if (p[0].status && p[0].status !== "POSTED") {
    throw new Error("This receipt is already cancelled");
  }
  const amount = num(p[0].amount);
  await sql.query(
    `update payments set status = $1, void_reason = $2, voided_at = now(), voided_by = $3
     where id = $4 and school_id = $5`,
    [action, reason, me.user_id, paymentId, me.school_id],
  );
  await sql.query(
    `update billings set paid = greatest(0, paid - $1) where id = $2 and school_id = $3`,
    [amount, p[0].billing_id, me.school_id],
  );
  await postDouble(sql, {
    schoolId: me.school_id,
    date: todayIso(),
    term: p[0].term,
    refType: action,
    refId: paymentId,
    memo: `${action === "REFUND" ? "Refund" : "Void"} ${p[0].receipt_no} · ${reason}`,
    userId: me.user_id,
    debitAccount: "FEES_RECEIVABLE",
    creditAccount: "CASH",
    amount,
  });
  await logReceipt(
    sql,
    me.school_id,
    paymentId,
    action === "REFUND" ? "REFUNDED" : "VOIDED",
    me.user_id,
    reason,
  );
  await writeAudit(
    sql,
    me,
    action,
    "payment",
    paymentId,
    `${action} ${p[0].receipt_no} · ${reason}`,
  );
}

export const deletePayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    requireSuper(me.role);
    await cancelPostedPayment(sql, me, data.id, "VOID", "Super Admin cancelled receipt");
    return { ok: true };
  });

export const deleteOtherIncome = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    requireSuper(me.role);
    const row = await sql.query<{
      amount: string;
      income_date: string;
      term: string | null;
      description: string;
    }>(
      `select amount::text, income_date, term, description from other_incomes where id = $1 and school_id = $2`,
      [data.id, me.school_id],
    );
    if (row[0]) {
      await postDouble(sql, {
        schoolId: me.school_id,
        date: todayIso(),
        term: row[0].term || termFromDate(row[0].income_date),
        refType: "VOID",
        refId: data.id,
        memo: `Reverse income · ${row[0].description}`,
        userId: me.user_id,
        debitAccount: "OTHER_INCOME",
        creditAccount: "CASH",
        amount: num(row[0].amount),
      });
    }
    await sql.query(`delete from other_incomes where id = $1 and school_id = $2`, [
      data.id,
      me.school_id,
    ]);
    return { ok: true };
  });

export const deleteExpense = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    requireSuper(me.role);
    const row = await sql.query<{
      amount: string;
      expense_date: string;
      term: string | null;
      category: string;
      description: string | null;
    }>(
      `select amount::text, expense_date, term, category, description from expenses where id = $1 and school_id = $2`,
      [data.id, me.school_id],
    );
    if (row[0]) {
      await postDouble(sql, {
        schoolId: me.school_id,
        date: todayIso(),
        term: row[0].term || termFromDate(row[0].expense_date),
        refType: "VOID",
        refId: data.id,
        memo: `Reverse expense · ${row[0].description || row[0].category}`,
        userId: me.user_id,
        debitAccount: "CASH",
        creditAccount: row[0].category === "Staff allowance" ? "SALARY" : "EXPENSE",
        amount: num(row[0].amount),
      });
    }
    await sql.query(`delete from expenses where id = $1 and school_id = $2`, [
      data.id,
      me.school_id,
    ]);
    return { ok: true };
  });

export const deleteService = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    requireSuper(me.role);
    const row = await sql.query<{ amount: string; kind: string; term: string | null; collected_at: string }>(
      `select amount::text, kind, term, collected_at::text from service_collections where id = $1 and school_id = $2`,
      [data.id, me.school_id],
    );
    if (row[0]) {
      await postDouble(sql, {
        schoolId: me.school_id,
        date: todayIso(),
        term: row[0].term || termFromDate(row[0].collected_at),
        refType: "VOID",
        refId: data.id,
        memo: `Reverse ${row[0].kind}`,
        userId: me.user_id,
        debitAccount: row[0].kind === "BUS" ? "BUS_INCOME" : "FEEDING_INCOME",
        creditAccount: "CASH",
        amount: num(row[0].amount),
      });
    }
    await sql.query(`delete from service_collections where id = $1 and school_id = $2`, [
      data.id,
      me.school_id,
    ]);
    return { ok: true };
  });

function canAssignTasks(role: StaffRole) {
  return role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN";
}

export const createTask = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      title: z.string().min(1),
      details: z.string().optional(),
      assigneeUserId: z.string().min(1),
      studentId: z.string().optional(),
      dueDate: z.string().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canAssignTasks(me.role)) throw new Error("Only School Admin or Super Admin can assign tasks");
    const assignee = await sql.query<{ user_id: string }>(
      `select user_id from staff where user_id = $1 and school_id = $2`,
      [data.assigneeUserId, me.school_id],
    );
    if (!assignee[0]) throw new Error("Staff member not found");
    if (data.studentId) {
      const st = await sql.query<{ id: string }>(
        `select id from students where id = $1 and school_id = $2`,
        [data.studentId, me.school_id],
      );
      if (!st[0]) throw new Error("Student not found");
    }
    await sql.query(
      `insert into staff_tasks (id, school_id, title, details, assignee_user_id, student_id, due_date, status, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,'Open',$8)`,
      [
        crypto.randomUUID(),
        me.school_id,
        data.title.trim(),
        data.details || null,
        data.assigneeUserId,
        data.studentId || null,
        data.dueDate || null,
        me.user_id,
      ],
    );
    return { ok: true };
  });

export const listTasks = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    const ownOnly = me.role === "TEACHER" || me.role === "SERVICE_OFFICER" || me.role === "ACCOUNTANT";
    const rows = await sql.query<{
      id: string;
      title: string;
      details: string | null;
      status: string;
      due_date: string | null;
      assignee: string;
      assignee_user_id: string;
      student: string | null;
    }>(
      ownOnly
        ? `select t.id, t.title, t.details, t.status, t.due_date, t.assignee_user_id,
              (st.first_name || ' ' || st.last_name) as assignee,
              case when s.id is null then null else s.first_name || ' ' || s.last_name || ' (' || s.admission_no || ')' end as student
       from staff_tasks t
       join staff st on st.user_id = t.assignee_user_id
       left join students s on s.id = t.student_id
       where t.school_id = $1 and t.assignee_user_id = $2
       order by t.created_at desc
       limit 120`
        : `select t.id, t.title, t.details, t.status, t.due_date, t.assignee_user_id,
              (st.first_name || ' ' || st.last_name) as assignee,
              case when s.id is null then null else s.first_name || ' ' || s.last_name || ' (' || s.admission_no || ')' end as student
       from staff_tasks t
       join staff st on st.user_id = t.assignee_user_id
       left join students s on s.id = t.student_id
       where t.school_id = $1
       order by t.created_at desc
       limit 120`,
      ownOnly ? [me.school_id, me.user_id] : [me.school_id],
    );
    return { tasks: rows, me };
  });

export const setTaskStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string(), status: z.enum(["Open", "Done"]) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (canAssignTasks(me.role)) {
      await sql.query(`update staff_tasks set status = $1 where id = $2 and school_id = $3`, [
        data.status,
        data.id,
        me.school_id,
      ]);
    } else {
      await sql.query(
        `update staff_tasks set status = $1 where id = $2 and school_id = $3 and assignee_user_id = $4`,
        [data.status, data.id, me.school_id, me.user_id],
      );
    }
    return { ok: true };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canAssignTasks(me.role)) throw new Error("Cannot delete tasks");
    await sql.query(`delete from staff_tasks where id = $1 and school_id = $2`, [
      data.id,
      me.school_id,
    ]);
    return { ok: true };
  });

export const recordSalary = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      staffId: z.string().optional(),
      employeeName: z.string().min(1),
      payMonth: z.string().regex(/^\d{4}-\d{2}$/),
      gross: z.number().positive(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role)) throw new Error("Finance access required");
    const gross = Math.round(data.gross * 100) / 100;
    const ssnit = Math.round(gross * 0.055 * 100) / 100;
    const net = Math.round((gross - ssnit) * 100) / 100;
    const expenseId = crypto.randomUUID();
    const salaryId = crypto.randomUUID();
    const term = termFromDate(`${data.payMonth}-01`);
    await sql.query(
      `insert into expenses (id, school_id, category, description, amount, expense_date, recorded_by, term)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        expenseId,
        me.school_id,
        "Staff allowance",
        `Salary ${data.payMonth} · ${data.employeeName.trim()} (SSNIT ${ssnit.toFixed(2)})`,
        gross,
        `${data.payMonth}-01`,
        me.user_id,
        term,
      ],
    );
    await postDouble(sql, {
      schoolId: me.school_id,
      date: `${data.payMonth}-01`,
      term,
      refType: "SALARY",
      refId: salaryId,
      memo: `Salary ${data.payMonth} · ${data.employeeName.trim()}`,
      userId: me.user_id,
      debitAccount: "SALARY",
      creditAccount: "CASH",
      amount: gross,
    });
    await sql.query(
      `insert into salaries (id, school_id, staff_id, employee_name, pay_month, gross, ssnit, net, expense_id, recorded_by, term)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        salaryId,
        me.school_id,
        data.staffId || null,
        data.employeeName.trim(),
        data.payMonth,
        gross,
        ssnit,
        net,
        expenseId,
        me.user_id,
        term,
      ],
    );
    return { id: salaryId, ssnit, net };
  });

export const listSalaries = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role)) throw new Error("Finance access required");
    return sql.query<{
      id: string;
      employee_name: string;
      pay_month: string;
      gross: string;
      ssnit: string;
      net: string;
    }>(
      `select id, employee_name, pay_month, gross::text, ssnit::text, net::text
       from salaries where school_id = $1 order by pay_month desc, created_at desc`,
      [me.school_id],
    );
  });

export const deleteSalary = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role)) throw new Error("Finance access required");
    const row = await sql.query<{
      expense_id: string | null;
      gross: string;
      pay_month: string;
      term: string | null;
      employee_name: string;
    }>(
      `select expense_id, gross::text, pay_month, term, employee_name from salaries where id = $1 and school_id = $2`,
      [data.id, me.school_id],
    );
    if (!row[0]) throw new Error("Salary not found");
    await postDouble(sql, {
      schoolId: me.school_id,
      date: todayIso(),
      term: row[0].term || termFromDate(`${row[0].pay_month}-01`),
      refType: "VOID",
      refId: data.id,
      memo: `Reverse salary · ${row[0].employee_name} ${row[0].pay_month}`,
      userId: me.user_id,
      debitAccount: "CASH",
      creditAccount: "SALARY",
      amount: num(row[0].gross),
    });
    if (row[0].expense_id) {
      await sql.query(`delete from expenses where id = $1 and school_id = $2`, [
        row[0].expense_id,
        me.school_id,
      ]);
    }
    await sql.query(`delete from salaries where id = $1 and school_id = $2`, [data.id, me.school_id]);
    return { ok: true };
  });

const NEXT_TERM: Record<string, string> = {
  "1st Term": "2nd Term",
  "2nd Term": "3rd Term",
  "3rd Term": "1st Term",
};

export const closeTerm = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ term: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role)) throw new Error("Finance access required");
    if (!NEXT_TERM[data.term]) throw new Error("Term must be 1st, 2nd, or 3rd Term");
    const next = NEXT_TERM[data.term];
    const billed = await sql.query<{ s: string }>(
      `select coalesce(sum(total),0)::text as s from billings where school_id = $1 and term = $2`,
      [me.school_id, data.term],
    );
    const collected = await sql.query<{ s: string }>(
      `select coalesce(sum(p.amount),0)::text as s
       from payments p
       join billings b on b.id = p.billing_id
       where p.school_id = $1 and b.term = $2 and coalesce(p.status, 'POSTED') = 'POSTED'`,
      [me.school_id, data.term],
    );
    const expenses = await sql.query<{ s: string }>(
      `select coalesce(sum(amount),0)::text as s from expenses where school_id = $1 and term = $2`,
      [me.school_id, data.term],
    );
    const other = await sql.query<{ s: string }>(
      `select coalesce(sum(amount),0)::text as s from other_incomes where school_id = $1 and term = $2`,
      [me.school_id, data.term],
    );
    const services = await sql.query<{ s: string }>(
      `select coalesce(sum(amount),0)::text as s from service_collections where school_id = $1 and term = $2`,
      [me.school_id, data.term],
    );
    const billedN = num(billed[0]?.s);
    const collectedN = num(collected[0]?.s);
    const outstanding = Math.max(0, billedN - collectedN);
    const id = crypto.randomUUID();
    await sql.query(
      `insert into term_settlements (
        id, school_id, term, next_term, billed, collected, expenses, other_income, services, outstanding, closed_by
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      on conflict (school_id, term) do update set
        next_term = excluded.next_term,
        billed = excluded.billed,
        collected = excluded.collected,
        expenses = excluded.expenses,
        other_income = excluded.other_income,
        services = excluded.services,
        outstanding = excluded.outstanding,
        closed_by = excluded.closed_by,
        closed_at = now()`,
      [
        id,
        me.school_id,
        data.term,
        next,
        billedN,
        collectedN,
        num(expenses[0]?.s),
        num(other[0]?.s),
        num(services[0]?.s),
        outstanding,
        me.user_id,
      ],
    );
    const debts = await sql.query<{
      student_id: string;
      total: string;
      paid: string;
      first_name: string;
      last_name: string;
    }>(
      `select b.student_id, b.total::text, b.paid::text, s.first_name, s.last_name
       from billings b join students s on s.id = b.student_id
       where b.school_id = $1 and b.term = $2 and b.total > b.paid`,
      [me.school_id, data.term],
    );
    let carried = 0;
    for (const row of debts) {
      const due = num(row.total) - num(row.paid);
      if (due <= 0) continue;
      carried += due;
      const invoiceNo = `DIS-ARREARS-${Date.now().toString().slice(-6)}${Math.floor(10 + Math.random() * 89)}`;
      const billId = crypto.randomUUID();
      await sql.query(
        `insert into billings (id, school_id, student_id, invoice_no, term, description, total, paid)
         values ($1,$2,$3,$4,$5,$6,$7,0)`,
        [
          billId,
          me.school_id,
          row.student_id,
          invoiceNo,
          next,
          `Arrears from ${data.term} · ${row.first_name} ${row.last_name}`,
          due,
        ],
      );
      await postDouble(sql, {
        schoolId: me.school_id,
        date: todayIso(),
        term: next,
        refType: "BILLING",
        refId: billId,
        memo: invoiceNo,
        userId: me.user_id,
        debitAccount: "FEES_RECEIVABLE",
        creditAccount: "FEE_INCOME",
        amount: due,
      });
    }
    await writeAudit(
      sql,
      me,
      "CLOSE_TERM",
      "term",
      data.term,
      `Closed ${data.term} · outstanding ${outstanding} · carried ${carried} to ${next}`,
    );
    return { outstanding, carried, next };
  });

export const listTermSettlements = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role)) throw new Error("Finance access required");
    return sql.query<{
      id: string;
      term: string;
      next_term: string;
      billed: string;
      collected: string;
      expenses: string;
      outstanding: string;
      closed_at: string;
    }>(
      `select id, term, next_term, billed::text, collected::text, expenses::text, outstanding::text, closed_at::text
       from term_settlements where school_id = $1 order by closed_at desc`,
      [me.school_id],
    );
  });

export const cancelReceipt = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string().min(1),
      action: z.enum(["VOID", "REFUND"]),
      reason: z.string().min(3).max(300),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role)) throw new Error("Finance access required");
    await cancelPostedPayment(sql, me, data.id, data.action, data.reason.trim());
    return { ok: true };
  });

export const logReceiptPrint = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role) && !canServices(me.role) && me.role !== "PARENT") {
      throw new Error("Finance access required");
    }
    await logReceipt(sql, me.school_id, data.id, "REPRINTED", me.user_id);
    return { ok: true };
  });

export const listReceiptEvents = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role) && !canServices(me.role) && me.role !== "PARENT") {
      throw new Error("Finance access required");
    }
    return sql.query<{ id: string; action: string; reason: string | null; created_at: string }>(
      `select id, action, reason, created_at::text
       from receipt_events where school_id = $1 and payment_id = $2
       order by created_at asc`,
      [me.school_id, data.id],
    );
  });

export const listLedger = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      from: z.string().min(8),
      to: z.string().min(8),
      account: z.string().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role)) throw new Error("Finance access required");
    const params: unknown[] = [me.school_id, data.from, data.to];
    let extra = "";
    if (data.account) {
      extra = " and account = $4";
      params.push(data.account);
    }
    return sql.query<{
      id: string;
      entry_date: string;
      term: string;
      account: string;
      debit: string;
      credit: string;
      ref_type: string;
      memo: string | null;
    }>(
      `select id, entry_date, term, account, debit::text, credit::text, ref_type, memo
       from ledger_entries
       where school_id = $1 and entry_date >= $2 and entry_date <= $3${extra}
       order by entry_date, created_at
       limit 800`,
      params,
    );
  });

export const getCashDay = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ date: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role)) throw new Error("Finance access required");
    const prev = await sql.query<{ counted: string; recon_date: string }>(
      `select counted::text, recon_date from cash_reconciliations
       where school_id = $1 and recon_date < $2
       order by recon_date desc limit 1`,
      [me.school_id, data.date],
    );
    const cash = await sql.query<{ receipts: string; payouts: string }>(
      `select coalesce(sum(debit),0)::text as receipts, coalesce(sum(credit),0)::text as payouts
       from ledger_entries
       where school_id = $1 and account = 'CASH' and entry_date = $2`,
      [me.school_id, data.date],
    );
    const opening = num(prev[0]?.counted);
    const receipts = num(cash[0]?.receipts);
    const payouts = num(cash[0]?.payouts);
    const expected = Math.round((opening + receipts - payouts) * 100) / 100;
    const saved = await sql.query<{
      counted: string;
      variance: string;
      notes: string | null;
    }>(
      `select counted::text, variance::text, notes from cash_reconciliations
       where school_id = $1 and recon_date = $2`,
      [me.school_id, data.date],
    );
    return {
      date: data.date,
      term: termFromDate(data.date),
      opening,
      receipts,
      payouts,
      expected,
      counted: saved[0] ? num(saved[0].counted) : expected,
      variance: saved[0] ? num(saved[0].variance) : 0,
      notes: saved[0]?.notes ?? "",
      saved: Boolean(saved[0]),
      previousDate: prev[0]?.recon_date ?? null,
    };
  });

export const saveCashDay = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      date: z.string().min(8),
      counted: z.number().min(0),
      notes: z.string().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role)) throw new Error("Finance access required");
    const prev = await sql.query<{ counted: string }>(
      `select counted::text from cash_reconciliations
       where school_id = $1 and recon_date < $2
       order by recon_date desc limit 1`,
      [me.school_id, data.date],
    );
    const cash = await sql.query<{ receipts: string; payouts: string }>(
      `select coalesce(sum(debit),0)::text as receipts, coalesce(sum(credit),0)::text as payouts
       from ledger_entries
       where school_id = $1 and account = 'CASH' and entry_date = $2`,
      [me.school_id, data.date],
    );
    const opening = num(prev[0]?.counted);
    const receipts = num(cash[0]?.receipts);
    const payouts = num(cash[0]?.payouts);
    const expected = Math.round((opening + receipts - payouts) * 100) / 100;
    const variance = Math.round((data.counted - expected) * 100) / 100;
    await sql.query(
      `insert into cash_reconciliations
        (id, school_id, recon_date, term, opening, receipts, payouts, expected, counted, variance, notes, recorded_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       on conflict (school_id, recon_date) do update set
         term = excluded.term,
         opening = excluded.opening,
         receipts = excluded.receipts,
         payouts = excluded.payouts,
         expected = excluded.expected,
         counted = excluded.counted,
         variance = excluded.variance,
         notes = excluded.notes,
         recorded_by = excluded.recorded_by`,
      [
        crypto.randomUUID(),
        me.school_id,
        data.date,
        termFromDate(data.date),
        opening,
        receipts,
        payouts,
        expected,
        data.counted,
        variance,
        data.notes?.trim() || null,
        me.user_id,
      ],
    );
    await writeAudit(sql, me, "CASH", "cash", data.date, `Till count ${data.counted} · variance ${variance}`);
    return { ok: true, variance };
  });

export const listCashDays = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role)) throw new Error("Finance access required");
    return sql.query<{
      recon_date: string;
      expected: string;
      counted: string;
      variance: string;
    }>(
      `select recon_date, expected::text, counted::text, variance::text
       from cash_reconciliations where school_id = $1
       order by recon_date desc limit 40`,
      [me.school_id],
    );
  });

export const getFinanceReport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      year: z.string().min(4),
      term: z.string().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canFinance(me.role)) throw new Error("Finance access required");
    const range = academicYearRange(data.year);
    const termFilter = data.term ? " and term = $4" : "";
    const params: unknown[] = data.term
      ? [me.school_id, range.from, range.to, data.term]
      : [me.school_id, range.from, range.to];
    const billed = await sql.query<{ s: string }>(
      `select coalesce(sum(total),0)::text as s from billings
       where school_id = $1 and left(created_at::text,10) >= $2 and left(created_at::text,10) <= $3${termFilter}`,
      params,
    );
    const collected = await sql.query<{ s: string }>(
      `select coalesce(sum(p.amount),0)::text as s
       from payments p join billings b on b.id = p.billing_id
       where p.school_id = $1 and left(p.paid_at::text,10) >= $2 and left(p.paid_at::text,10) <= $3
         and coalesce(p.status,'POSTED') = 'POSTED'${data.term ? " and b.term = $4" : ""}`,
      params,
    );
    const accounts = await sql.query<{ account: string; debit: string; credit: string }>(
      `select account, coalesce(sum(debit),0)::text as debit, coalesce(sum(credit),0)::text as credit
       from ledger_entries
       where school_id = $1 and entry_date >= $2 and entry_date <= $3${termFilter}
       group by account order by account`,
      params,
    );
    const billedN = num(billed[0]?.s);
    const collectedN = num(collected[0]?.s);
    const map = Object.fromEntries(accounts.map((a) => [a.account, { debit: num(a.debit), credit: num(a.credit) }]));
    const cash = (map.CASH?.debit ?? 0) - (map.CASH?.credit ?? 0);
    const expenses = (map.EXPENSE?.debit ?? 0) + (map.SALARY?.debit ?? 0);
    return {
      year: data.year,
      term: data.term || "Full year",
      from: range.from,
      to: range.to,
      billed: billedN,
      collected: collectedN,
      outstanding: Math.max(0, billedN - collectedN),
      expenses,
      otherIncome: map.OTHER_INCOME?.credit ?? 0,
      bus: map.BUS_INCOME?.credit ?? 0,
      feeding: map.FEEDING_INCOME?.credit ?? 0,
      cash,
      accounts,
    };
  });

export const listAudit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ actorId: z.string().optional(), q: z.string().optional() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (me.role !== "SUPER_ADMIN" && !canFinance(me.role)) throw new Error("Admin access required");
    const params: unknown[] = [me.school_id];
    const where = ["school_id = $1"];
    if (data.actorId) {
      params.push(data.actorId);
      where.push(`actor_id = $${params.length}`);
    }
    if (data.q?.trim()) {
      params.push(`%${data.q.trim().toLowerCase()}%`);
      where.push(
        `(lower(summary) like $${params.length} or lower(action) like $${params.length} or lower(coalesce(actor_email,'')) like $${params.length})`,
      );
    }
    return sql.query<{
      id: string;
      actor_email: string | null;
      actor_role: string | null;
      action: string;
      entity: string;
      summary: string;
      ip: string | null;
      created_at: string;
    }>(
      `select id, actor_email, actor_role, action, entity, summary, ip, created_at::text
       from audit_events where ${where.join(" and ")}
       order by created_at desc limit 200`,
      params,
    );
  });

export const listLoginHistory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (me.role !== "SUPER_ADMIN" && !canFinance(me.role)) throw new Error("Admin access required");
    return sql.query<{
      id: string;
      email: string | null;
      event: string;
      ip: string | null;
      user_agent: string | null;
      created_at: string;
      name: string | null;
    }>(
      `select l.id, l.email, l.event, l.ip, l.user_agent, l.created_at::text,
              case when s.id is null then l.email else s.first_name || ' ' || s.last_name end as name
       from login_events l
       left join staff s on s.user_id = l.user_id
       where l.school_id = $1
       order by l.created_at desc limit 150`,
      [me.school_id],
    );
  });

export const listLiveSessions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canAdmin(me.role)) throw new Error("Only Super Admin or School Admin can view sessions");
    return sql.query<{
      id: string;
      email: string | null;
      name: string | null;
      ip: string | null;
      user_agent: string | null;
      created_at: string;
      expires_at: string;
    }>(
      `select sess.id, u.email, s.first_name || ' ' || s.last_name as name,
              sess."ipAddress" as ip, sess."userAgent" as user_agent,
              sess."createdAt"::text as created_at, sess."expiresAt"::text as expires_at
       from "session" sess
       join "user" u on u.id = sess."userId"
       left join staff s on s.user_id = sess."userId"
       where sess."expiresAt" > now()
       order by sess."createdAt" desc
       limit 80`,
    );
  });

export const noteLogin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    await noteLoginRow(sql, me, "LOGIN");
    return { ok: true };
  });

export { GES_SUBJECTS, bandForClass, nextClass };
export type { StaffRow };
export { ensureStaff, canAcademic, canMarks, writeAudit, teacherLoad };
