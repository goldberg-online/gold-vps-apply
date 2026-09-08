import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  deleteInvite,
  deleteStaffProfile,
  inviteStaff,
  listStaff,
  listStudents,
  listTeachingLoad,
  setStaffPassword,
  updateStaffProfile,
} from "@/lib/school";
import { ROLE_LABEL, ROLES, type StaffRole } from "@/lib/ghana";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { cleanEmail, cleanPassword, phoneSafePassword } from "@/lib/credentials";

export const Route = createFileRoute("/app/staff")({ component: StaffPage });

function StaffPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["staff"], queryFn: () => listStaff() });
  const students = useQuery({ queryKey: ["students"], queryFn: () => listStudents() });
  const loadQ = useQuery({ queryKey: ["teaching-load"], queryFn: () => listTeachingLoad(), enabled: list.data?.me.role === "TEACHER" });
  const isTeacher = list.data?.me.role === "TEACHER";
  const myClasses = useMemo(() => {
    const names = [...new Set((loadQ.data?.load ?? []).map((l) => l.class_name))];
    return names.map((className) => ({
      className,
      subjects: (loadQ.data?.load ?? []).filter((l) => l.class_name === className).map((l) => l.subject_name),
      students: (students.data ?? []).filter((s) => s.class_name === className),
    }));
  }, [loadQ.data, students.data]);
  const [form, setForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    role: "ACCOUNTANT" as StaffRole,
    password: "",
  });
  const isSuper = list.data?.me.role === "SUPER_ADMIN";
  const canIssue = isSuper || list.data?.me.role === "ACCOUNTANT";
  const issueRoles: StaffRole[] = isSuper
    ? ["ACCOUNTANT", "SCHOOL_ADMIN", "TEACHER", "SERVICE_OFFICER", "SUPER_ADMIN"]
    : ["ACCOUNTANT", "SCHOOL_ADMIN", "TEACHER", "SERVICE_OFFICER"];
  const [openId, setOpenId] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ email: string; password: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const mut = useMutation({
    mutationFn: () =>
      inviteStaff({
        data: {
          ...form,
          email: cleanEmail(form.email),
          password: cleanPassword(form.password),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      setIssued({
        email: cleanEmail(form.email),
        password: cleanPassword(form.password),
        name: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
      });
      setCopied(false);
      setForm({ email: "", firstName: "", lastName: "", role: "ACCOUNTANT", password: "" });
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      {isTeacher ? (
        <Card title="My assigned classes" desc="Students in the classes School Admin assigned to you. Open Marks to enter scores.">
          {loadQ.isLoading ? <p className="text-sm text-muted">Loading your classes…</p> : null}
          {myClasses.length === 0 && !loadQ.isLoading ? (
            <p className="text-sm text-muted">You have no class yet. Ask School Admin to assign you a class and subject on Academic.</p>
          ) : (
            <ul className="space-y-4">
              {myClasses.map((c) => (
                <li key={c.className}>
                  <p className="text-sm font-medium">{c.className}</p>
                  <p className="text-xs text-muted">{c.subjects.join(" · ") || "No subject yet"}</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {c.students.length === 0 ? (
                      <li className="text-muted">No students in this class yet.</li>
                    ) : (
                      c.students.map((s) => (
                        <li key={s.id} className="flex justify-between gap-2">
                          <span>
                            {s.first_name} {s.last_name}
                            <span className="ml-2 font-mono text-xs text-muted">{s.admission_no}</span>
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                  <Link to="/app/marks" className="mt-2 inline-block text-sm text-navy underline">
                    Enter marks for {c.className}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : canIssue ? (
      <Card
        title="Allocate a login"
        desc={
          isSuper
            ? "Super Admin can create Accountant, School Admin, Teacher, Service Officer, Parent, or another Super Admin. They sign in with this email and password — there is no public create-account page."
            : "Accountant can issue School Admin, Teacher, Service Officer, Parent, and other Accountant logins. Super Admin logins are Super Admin only."
        }
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <Field label="Role">
            <Select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as StaffRole })}
            >
              {issueRoles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="First name">
            <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
          </Field>
          <Field label="Last name">
            <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="text-base"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </Field>
          <Field label="Password for this login">
            <Input
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="text-base"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={8}
              autoComplete="off"
              placeholder="Letters and numbers — easy to type on a phone"
            />
          </Field>
          <button
            type="button"
            className="text-sm text-navy underline"
            onClick={() => setForm({ ...form, password: phoneSafePassword() })}
          >
            Make a phone-friendly password
          </button>
          {mut.isError ? <p className="text-sm text-bad">{(mut.error as Error).message}</p> : null}
          {mut.isSuccess ? <p className="text-sm text-good">Login issued. Send the box below — they must open Chrome or Safari, not WhatsApp’s in-app page.</p> : null}
          {issued ? (
            <div className="rounded-[12px] border border-navy/20 bg-bg p-3 text-sm">
              <p className="font-medium text-navy">{issued.name}</p>
              <p className="mt-1 font-mono">Email: {issued.email}</p>
              <p className="font-mono">Password: {issued.password}</p>
              <Button
                type="button"
                variant="ghost"
                className="mt-2 w-full"
                onClick={() => {
                  const text = `DIS ONLINE login for ${issued.name}\nOpen in Chrome or Safari (not inside WhatsApp):\nEmail: ${issued.email}\nPassword: ${issued.password}`;
                  void navigator.clipboard.writeText(text).then(() => setCopied(true));
                }}
              >
                {copied ? "Copied" : "Copy to send on WhatsApp"}
              </Button>
            </div>
          ) : null}
          <Button type="submit" className="w-full" disabled={mut.isPending}>
            {mut.isPending ? "Saving…" : `Allocate ${ROLE_LABEL[form.role]} login`}
          </Button>
        </form>
      </Card>
      ) : (
        <Card title="Staff directory" desc="View-only. Assign work from Assign tasks. You cannot create logins or change finance.">
          <p className="text-sm text-muted">
            Open a name for the full profile, then use Assign tasks to give that person work (optionally tied to a student).
          </p>
        </Card>
      )}
      <Card title="Staff on DIS ONLINE" desc="Open a name to see the full profile.">
        <ul className="space-y-2">
          {(list.data?.staff ?? []).map((s) => (
            <li key={s.id} className="rounded-[12px] border border-line">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm"
                onClick={() => setOpenId(openId === s.id ? null : s.id)}
              >
                <span>
                  {s.first_name} {s.last_name}
                  <span className="block text-xs text-muted">{s.email}</span>
                </span>
                <span className="text-xs text-gold">
                  {ROLE_LABEL[s.role]} {openId === s.id ? "▴" : "▾"}
                </span>
              </button>
              {openId === s.id ? (
                <ProfileEditor
                  staff={s}
                  selfId={list.data?.me.id}
                  isSuper={!!isSuper}
                  canIssue={!!canIssue}
                  onDone={() => qc.invalidateQueries({ queryKey: ["staff"] })}
                />
              ) : null}
            </li>
          ))}
        </ul>
        {(list.data?.invites.length ?? 0) > 0 ? (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-muted">Waiting to sign in</p>
            <ul className="mt-2 space-y-2 text-sm">
              {list.data!.invites.map((i) => (
                <li key={i.email} className="flex items-center justify-between gap-2">
                  <span>
                    {i.first_name} {i.last_name} · {i.email} · {i.role}
                  </span>
                  <Button
                    variant="danger"
                    className="min-h-9 px-3 text-xs"
                    onClick={() =>
                      deleteInvite({ data: { email: i.email } }).then(() =>
                        qc.invalidateQueries({ queryKey: ["staff"] }),
                      )
                    }
                  >
                    Delete invite
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function ProfileEditor({
  staff,
  selfId,
  isSuper,
  canIssue,
  onDone,
}: {
  staff: {
    id: string;
    user_id: string;
    role: StaffRole;
    first_name: string;
    last_name: string;
    email: string;
    password_set?: boolean;
  };
  selfId?: string;
  isSuper: boolean;
  canIssue: boolean;
  onDone: () => void;
}) {
  const [firstName, setFirstName] = useState(staff.first_name);
  const [lastName, setLastName] = useState(staff.last_name);
  const [email, setEmail] = useState(staff.email);
  const [role, setRole] = useState<StaffRole>(staff.role);
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      updateStaffProfile({ data: { id: staff.id, firstName, lastName, email, role } }),
    onSuccess: () => {
      setMsg("Profile saved");
      onDone();
    },
    onError: (e) => setErr((e as Error).message),
  });
  const pw = useMutation({
    mutationFn: async () => {
      if (password !== confirmPw) throw new Error("New passwords do not match");
      return setStaffPassword({ data: { id: staff.id, password: cleanPassword(password) } });
    },
    onSuccess: () => {
      setPassword("");
      setConfirmPw("");
      setErr(null);
      setMsg(`Password saved for ${staff.email}. They sign in with this email and the new password.`);
      onDone();
    },
    onError: (e) => setErr((e as Error).message),
  });
  const del = useMutation({
    mutationFn: () => deleteStaffProfile({ data: { id: staff.id } }),
    onSuccess: onDone,
    onError: (e) => setErr((e as Error).message),
  });

  return (
    <div className="space-y-3 border-t border-line px-3 py-3">
      <p className="text-xs text-muted">Complete profile · login id {staff.user_id.slice(0, 8)}…</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name">
          <Input disabled={!isSuper} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </Field>
        <Field label="Last name">
          <Input disabled={!isSuper} value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </Field>
        <Field label="Email">
          <Input disabled={!isSuper} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Role">
          <Select disabled={!isSuper} value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {isSuper || (canIssue && staff.role !== "SUPER_ADMIN") ? (
      <form
        className="space-y-3 rounded-[12px] bg-bg p-3"
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          pw.mutate();
        }}
      >
        <p className="text-xs uppercase tracking-wide text-muted">Password</p>
        <p className="text-sm">
          Login email: <span className="font-medium">{staff.email}</span>
        </p>
        <p className="text-sm text-muted">
          {staff.password_set
            ? "A password is on file, stored encrypted. It cannot be displayed. Set a new one below."
            : "No email password yet. Set one so they can sign in with this email."}
        </p>
        <Field label="New password">
          <Input
            type="text"
            value={password}
            minLength={8}
            required
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 8 characters"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="text-base"
          />
        </Field>
        <Field label="Confirm new password">
          <Input
            type="password"
            value={confirmPw}
            minLength={8}
            required
            onChange={(e) => setConfirmPw(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Button type="submit" className="w-full" disabled={pw.isPending}>
          {pw.isPending ? "Saving password…" : "Save new password"}
        </Button>
      </form>
      ) : (
        <p className="text-sm text-muted">
          School Admin can view this profile and assign tasks. Logins are issued by Super Admin or Accountant.
        </p>
      )}
      {err ? <p className="text-sm text-bad">{err}</p> : null}
      {msg ? <p className="text-sm text-good">{msg}</p> : null}
      {isSuper ? (
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
          Save profile
        </Button>
        {selfId !== staff.id ? (
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              if (confirm(`Permanently delete ${staff.first_name} ${staff.last_name}? This cannot be undone.`)) {
                del.mutate();
              }
            }}
            disabled={del.isPending}
          >
            Permanently delete
          </Button>
        ) : (
          <p className="self-center text-xs text-muted">You cannot delete your own profile.</p>
        )}
      </div>
      ) : null}
    </div>
  );
}
