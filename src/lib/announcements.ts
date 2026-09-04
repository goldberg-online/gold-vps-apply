import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { type StaffRole } from "@/lib/ghana";
import { ensureStaff, writeAudit } from "@/lib/school";

type Sql = Awaited<ReturnType<typeof getSql>>;

export type AnnouncementAudience = "ALL" | "PARENTS" | "STAFF";

export const AUDIENCE_LABEL: Record<AnnouncementAudience, string> = {
  ALL: "Everyone",
  PARENTS: "Parents",
  STAFF: "Staff",
};

function canAnnounce(role: StaffRole) {
  return role === "SUPER_ADMIN" || role === "ACCOUNTANT";
}

function visibleAudiences(role: StaffRole): AnnouncementAudience[] {
  if (canAnnounce(role)) return ["ALL", "PARENTS", "STAFF"];
  if (role === "PARENT") return ["ALL", "PARENTS"];
  return ["ALL", "STAFF"];
}

export async function ensureAnnouncementsTable(sql: Sql) {
  await sql.query(`
    create table if not exists announcements (
      id text primary key,
      school_id text not null,
      title text not null,
      body text not null,
      audience text not null default 'ALL',
      created_by text,
      created_at timestamptz not null default now()
    )
  `);
  await sql.query(
    `create index if not exists announcements_school_idx on announcements (school_id, created_at desc)`,
  );
}

export const listAnnouncements = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    await ensureAnnouncementsTable(sql);
    const vis = visibleAudiences(me.role);
    const ph = vis.map((_, i) => `$${i + 2}`).join(",");
    const items = await sql.query<{
      id: string;
      title: string;
      body: string;
      audience: AnnouncementAudience;
      created_at: string;
      author: string;
    }>(
      `select a.id, a.title, a.body, a.audience, a.created_at::text,
              coalesce(s.first_name || ' ' || s.last_name, 'Office') as author
       from announcements a
       left join staff s on s.user_id = a.created_by and s.school_id = a.school_id
       where a.school_id = $1 and a.audience in (${ph})
       order by a.created_at desc
       limit 40`,
      [me.school_id, ...vis],
    );
    return { me: { role: me.role, canPost: canAnnounce(me.role) }, items };
  });

export const postAnnouncement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      title: z.string().trim().min(1).max(120),
      body: z.string().trim().min(1).max(4000),
      audience: z.enum(["ALL", "PARENTS", "STAFF"]),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canAnnounce(me.role)) throw new Error("Only Accountant or Super Admin can send announcements");
    await ensureAnnouncementsTable(sql);
    const id = crypto.randomUUID();
    await sql.query(
      `insert into announcements (id, school_id, title, body, audience, created_by)
       values ($1,$2,$3,$4,$5,$6)`,
      [id, me.school_id, data.title, data.body, data.audience, me.user_id],
    );
    await writeAudit(
      sql,
      me,
      "ANNOUNCE",
      "announcement",
      id,
      `${data.audience}: ${data.title}`,
    );
    return { id };
  });

export const deleteAnnouncement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await ensureStaff(sql, context.userId);
    if (!canAnnounce(me.role)) throw new Error("Only Accountant or Super Admin can remove announcements");
    await ensureAnnouncementsTable(sql);
    await sql.query(`delete from announcements where id = $1 and school_id = $2`, [data.id, me.school_id]);
    await writeAudit(sql, me, "ANNOUNCE_DEL", "announcement", data.id, "Removed announcement");
    return { ok: true };
  });
