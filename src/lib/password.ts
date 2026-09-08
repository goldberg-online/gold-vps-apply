import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { cleanEmail, cleanPassword } from "@/lib/credentials";

async function sha(value: string) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(value).digest("hex");
}

export async function applyPasswordToUser(
  sql: Awaited<ReturnType<typeof getSql>>,
  userId: string,
  password: string,
) {
  const { hashPassword } = await import("better-auth/crypto");
  const secret = cleanPassword(password);
  if (secret.length < 8) throw new Error("Password must be at least 8 characters");
  const hash = await hashPassword(secret);
  const existing = await sql.query<{ id: string }>(
    `select id from account where "userId" = $1 and "providerId" = 'credential'`,
    [userId],
  );
  if (existing[0]) {
    await sql.query(`update account set password = $1, "updatedAt" = now() where id = $2`, [
      hash,
      existing[0].id,
    ]);
    return;
  }
  await sql.query(
    `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
     values ($1,$2,'credential',$3,$4,now(),now())`,
    [crypto.randomUUID(), userId, userId, hash],
  );
}

export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator(z.object({ email: z.string().email() }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const email = cleanEmail(data.email);
    const user = await sql.query<{ id: string }>(
      `select id from "user" where lower(email) = $1`,
      [email],
    );
    if (!user[0]) throw new Error("No account was created with that email");
    const { randomBytes } = await import("node:crypto");
    const token = randomBytes(24).toString("hex");
    const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await sql.query(
      `insert into password_resets (id, email, token_hash, expires_at)
       values ($1,$2,$3,$4)`,
      [crypto.randomUUID(), email, await sha(token), expires],
    );
    return { ok: true as const, token, email };
  });

export const completePasswordReset = createServerFn({ method: "POST" })
  .validator(
    z.object({
      email: z.string().email(),
      token: z.string().min(8),
      password: z.string().min(8),
      confirm: z.string().min(8),
    }),
  )
  .handler(async ({ data }) => {
    if (cleanPassword(data.password) !== cleanPassword(data.confirm)) throw new Error("New passwords do not match");
    const sql = await getSql();
    const email = cleanEmail(data.email);
    const rows = await sql.query<{ id: string }>(
      `select id from password_resets
       where email = $1 and token_hash = $2 and used_at is null and expires_at > now()
       order by created_at desc limit 1`,
      [email, await sha(data.token)],
    );
    if (!rows[0]) throw new Error("Reset expired or invalid. Request a new one with the same email.");
    const user = await sql.query<{ id: string }>(
      `select id from "user" where lower(email) = $1`,
      [email],
    );
    if (!user[0]) throw new Error("No account was created with that email");
    await applyPasswordToUser(sql, user[0].id, data.password);
    await sql.query(`update password_resets set used_at = now() where id = $1`, [rows[0].id]);
    return { ok: true as const };
  });

export const changeOwnPassword = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      current: z.string().min(1),
      next: z.string().min(8),
      confirm: z.string().min(8),
    }),
  )
  .handler(async ({ context, data }) => {
    if (cleanPassword(data.next) !== cleanPassword(data.confirm)) throw new Error("New passwords do not match");
    const sql = await getSql();
    const acc = await sql.query<{ password: string | null }>(
      `select password from account where "userId" = $1 and "providerId" = 'credential'`,
      [context.userId],
    );
    if (!acc[0]?.password) throw new Error("This account has no email password yet. Set one below using Reset, or ask Super Admin.");
    const { verifyPassword } = await import("better-auth/crypto");
    const ok = await verifyPassword({ hash: acc[0].password, password: cleanPassword(data.current) });
    if (!ok) throw new Error("Current password is wrong");
    await applyPasswordToUser(sql, context.userId, data.next);
    return { ok: true as const };
  });
