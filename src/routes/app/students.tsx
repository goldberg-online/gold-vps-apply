import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { deleteStudent, enrollStudent, getMe, getStudentRecord, listStudents, updateStudent } from "@/lib/school";
import { getCumulativeRecord } from "@/lib/academic-ops";
import { CumulativeRecordSheet } from "@/components/cumulative-record";
import { GHANA_CLASS_LEVELS, formatGhs, num, sortAlpha } from "@/lib/ghana";
import { Button, Card, Field, Input, Money, Select } from "@/components/ui";

export const Route = createFileRoute("/app/students")({ component: FamiliesPage });

async function readPhoto(file: File | undefined): Promise<string | undefined> {
  if (!file) return undefined;
  if (file.size > 2 * 1024 * 1024) throw new Error("Photo must be 2 MB or smaller");
  if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Photo must be JPG, PNG, or WebP");
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read photo"));
    reader.readAsDataURL(file);
  });
}

function Avatar({ src, name }: { src?: string | null; name: string }) {
  if (src) {
    return <img src={src} alt={name} className="h-12 w-12 rounded-full border border-gold/40 object-cover" />;
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span className="grid h-12 w-12 place-items-center rounded-full border border-line bg-bg text-xs text-muted">
      {initials || "—"}
    </span>
  );
}

function nameKey(first: string, last: string) {
  return `${first} ${last}`.trim().toLowerCase().replace(/\s+/g, " ");
}

function FamiliesPage() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMe() });
  const list = useQuery({ queryKey: ["students"], queryFn: () => listStudents() });
  const canEnroll = me.data && ["SUPER_ADMIN", "ACCOUNTANT"].includes(me.data.me.role);
  const isSuper = me.data?.me.role === "SUPER_ADMIN";
  const isParent = me.data?.me.role === "PARENT";
  const [openId, setOpenId] = useState<string | null>(null);
  const [openClass, setOpenClass] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const [dupOpen, setDupOpen] = useState(true);
  const dupGroups = useMemo(() => {
    const map = new Map<string, NonNullable<typeof list.data>>();
    for (const s of list.data ?? []) {
      const key = nameKey(s.first_name, s.last_name);
      if (!key) continue;
      const bucket = map.get(key) ?? [];
      bucket.push(s);
      map.set(key, bucket);
    }
    return [...map.values()].filter((g) => g.length > 1);
  }, [list.data]);
  const dupKeys = useMemo(() => new Set(dupGroups.map((g) => nameKey(g[0].first_name, g[0].last_name))), [dupGroups]);
  const delDup = useMutation({
    mutationFn: (id: string) => deleteStudent({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["dash"] });
    },
  });
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    className: "Primary 1",
    gender: "",
    dob: "",
    phone: "",
    address: "",
    notes: "",
    parentName: "",
    parentPhone: "",
    parentEmail: "",
    previousSchool: "",
    nhisNumber: "",
    photoUrl: "",
    enrolledOn: new Date().toISOString().slice(0, 10),
  });
  const mut = useMutation({
    mutationFn: () => enrollStudent({ data: form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["dash"] });
      setForm({
        firstName: "",
        lastName: "",
        className: form.className,
        gender: "",
        dob: "",
        phone: "",
        address: "",
        notes: "",
        parentName: "",
        parentPhone: "",
        parentEmail: "",
        previousSchool: "",
        nhisNumber: "",
        photoUrl: "",
        enrolledOn: form.enrolledOn,
      });
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      {dupGroups.length > 0 && dupOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy/70 p-4" role="dialog" aria-modal="true" aria-labelledby="dup-title">
          <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-[16px] border border-line bg-surface p-5 shadow-xl">
            <h2 id="dup-title" className="text-lg font-semibold text-navy">Same names enrolled more than once</h2>
            <p className="mt-1 text-sm text-muted">
              {dupGroups.length} name{dupGroups.length === 1 ? "" : "s"} match more than one admission. Keep the correct record and remove the extra one.
            </p>
            <ul className="mt-4 space-y-4">
              {dupGroups.map((group) => {
                const title = `${group[0].first_name} ${group[0].last_name}`;
                return (
                  <li key={nameKey(group[0].first_name, group[0].last_name)} className="rounded-[12px] border border-gold/50 bg-bg p-3">
                    <p className="font-semibold text-navy">{title}</p>
                    <ul className="mt-2 space-y-2">
                      {group.map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span>
                            <span className="font-mono text-xs text-muted">{s.admission_no}</span>
                            <span className="mt-0.5 block">
                              {s.class_name || "Unassigned"}
                              {s.enrolled_on ? ` · enrolled ${s.enrolled_on}` : ""}
                            </span>
                          </span>
                          <span className="flex gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => {
                                setFind(s.admission_no);
                                setOpenClass(s.class_name || "Unassigned");
                                setOpenId(s.id);
                                setDupOpen(false);
                              }}
                            >
                              Open
                            </Button>
                            {isSuper ? (
                              <Button
                                type="button"
                                variant="ghost"
                                disabled={delDup.isPending}
                                onClick={() => {
                                  if (confirm(`Delete the extra record ${s.admission_no} for ${title}?`)) {
                                    delDup.mutate(s.id);
                                  }
                                }}
                              >
                                Delete
                              </Button>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
            {delDup.isError ? <p className="mt-3 text-sm text-bad">{(delDup.error as Error).message}</p> : null}
            <Button type="button" className="mt-4 w-full" onClick={() => setDupOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      ) : null}
      {dupGroups.length > 0 && !dupOpen ? (
        <div className="lg:col-span-2">
          <button
            type="button"
            className="w-full rounded-[12px] border border-gold/50 bg-gold/10 px-4 py-3 text-left text-sm font-medium text-navy"
            onClick={() => setDupOpen(true)}
          >
            {dupGroups.length} name{dupGroups.length === 1 ? "" : "s"} enrolled more than once — tap to fix
          </button>
        </div>
      ) : null}
      {canEnroll ? (
        <Card
          title="Enroll family"
          desc="One record: child + parent. A GES cumulative record is opened automatically and stays on the academic record."
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (mut.isPending) return;
              const key = nameKey(form.firstName, form.lastName);
              const hits = (list.data ?? []).filter((s) => nameKey(s.first_name, s.last_name) === key);
              if (hits.length) {
                const lines = hits.map((s) => `${s.admission_no} · ${s.class_name} · enrolled ${s.enrolled_on || "—"}`).join("\n");
                if (!window.confirm(`This name is already enrolled:\n${lines}\n\nSave another record anyway?`)) return;
              }
              mut.mutate();
            }}
          >
            <p className="text-xs uppercase tracking-wide text-muted">Student</p>
            <Field label="Student photo">
              <div className="flex items-center gap-3">
                <Avatar src={form.photoUrl || null} name={`${form.firstName} ${form.lastName}`} />
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    try {
                      const url = await readPhoto(file);
                      if (url) setForm({ ...form, photoUrl: url });
                    } catch (err) {
                      window.alert(err instanceof Error ? err.message : "Photo failed");
                    }
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-muted">JPG, PNG or WebP · max 2 MB</p>
            </Field>
            <Field label="First name">
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
            </Field>
            <Field label="Last name">
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
            </Field>
            <Field label="Class">
              <Select value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })}>
                {[...GHANA_CLASS_LEVELS].sort(sortAlpha).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Date of enrollment">
              <Input type="date" value={form.enrolledOn} onChange={(e) => setForm({ ...form, enrolledOn: e.target.value })} required />
            </Field>
            <Field label="Date of birth">
              <Input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
            </Field>
            <Field label="Previous school">
              <Input
                value={form.previousSchool}
                onChange={(e) => setForm({ ...form, previousSchool: e.target.value })}
                placeholder="Name of former school"
              />
            </Field>
            <Field label="Ghana NHIS number">
              <Input
                value={form.nhisNumber}
                onChange={(e) => setForm({ ...form, nhisNumber: e.target.value })}
                placeholder="Health insurance ID"
              />
            </Field>
            <Field label="Gender">
              <Select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="">Select</option>
                <option>Female</option>
                <option>Male</option>
              </Select>
            </Field>
            <p className="pt-1 text-xs uppercase tracking-wide text-muted">Parent / guardian</p>
            <Field label="Parent name">
              <Input value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} required />
            </Field>
            <Field label="Parent phone">
              <Input value={form.parentPhone} onChange={(e) => setForm({ ...form, parentPhone: e.target.value })} required />
            </Field>
            <Field label="Parent email (for login)">
              <Input type="email" value={form.parentEmail} onChange={(e) => setForm({ ...form, parentEmail: e.target.value })} />
            </Field>
            <Field label="Home address">
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
            <Field label="Notes">
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            {mut.isError ? <p className="text-sm text-bad">{(mut.error as Error).message}</p> : null}
            {mut.isSuccess ? (
              <div className="rounded-[12px] border border-good/40 bg-bg p-3 text-sm">
                <p className="text-good">Family enrolled · {mut.data.admission}</p>
                <p className="mt-1 text-xs text-muted">GES cumulative record opened and attached to the academic record.</p>
                <p className="mt-2 text-xs uppercase tracking-wide text-muted">Login (parent / student)</p>
                <p className="font-mono text-navy">{mut.data.loginEmail}</p>
                {mut.data.reused ? (
                  <p className="mt-1 text-xs text-muted">This parent already had a login. Password was not changed.</p>
                ) : (
                  <>
                    <p className="mt-1 font-mono text-navy">{mut.data.password}</p>
                    <p className="mt-1 text-xs text-muted">Give this password to the parent. They sign in on behalf of the child.</p>
                  </>
                )}
              </div>
            ) : null}
            <Button type="submit" className="w-full" disabled={mut.isPending}>
              {mut.isPending ? "Saving…" : "Save student & parent"}
            </Button>
          </form>
        </Card>
      ) : (
        <Card
          title={isParent ? "Your children" : "Students & parents"}
          desc={
            isParent
              ? "You are signed in as the parent. Open a name for the full family record."
              : "One directory — child and parent together. Enrollment is Accountant / Super Admin."
          }
        >
          <p className="text-sm text-muted">
            {isParent
              ? "Most children do not have phones. This login is yours for the student."
              : "There is no separate parent page."}
          </p>
        </Card>
      )}
      <Card title={`Families (${list.data?.length ?? 0})`} desc="Open a class, then a name. Every class list is A–Z.">
        {list.isError ? <p className="text-sm text-bad">{(list.error as Error).message}</p> : null}
        <Field label="Find enrolled student">
          <Input
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder="Start typing a name or DISST…"
          />
        </Field>
        <ul className="mt-3 space-y-2">
          {(() => {
            const filtered = (list.data ?? []).filter((s) => {
              const q = find.trim().toLowerCase();
              if (!q) return true;
              return `${s.first_name} ${s.last_name} ${s.admission_no} ${s.class_name} ${s.parent_name ?? ""}`
                .toLowerCase()
                .includes(q);
            });
            const classes = [...new Set(filtered.map((s) => s.class_name || "Unassigned"))].sort(sortAlpha);
            if (filtered.length === 0) return <li className="py-6 text-sm text-muted">No families yet.</li>;
            return classes.map((cls) => {
              const kids = filtered
                .filter((s) => (s.class_name || "Unassigned") === cls)
                .slice()
                .sort((a, b) => sortAlpha(`${a.last_name} ${a.first_name}`, `${b.last_name} ${b.first_name}`));
              const open = openClass === cls || !!find.trim();
              return (
                <li key={cls} className="rounded-[12px] border border-line">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-3 text-left"
                    onClick={() => setOpenClass(openClass === cls ? null : cls)}
                  >
                    <span className="font-semibold text-navy">{cls}</span>
                    <span className="text-xs text-muted">{kids.length} student{kids.length === 1 ? "" : "s"}</span>
                  </button>
                  {open ? (
                    <ul className="space-y-2 border-t border-line px-2 py-2">
                      {kids.map((s) => (
                        <li key={s.id} className={`rounded-[10px] bg-bg ${dupKeys.has(nameKey(s.first_name, s.last_name)) ? "ring-2 ring-gold" : ""}`}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm"
                            onClick={() => setOpenId(openId === s.id ? null : s.id)}
                          >
                            <span className="flex min-w-0 items-center gap-3">
                              <Avatar src={s.photo_url} name={`${s.first_name} ${s.last_name}`} />
                              <span className="min-w-0">
                                <span className="font-mono text-xs text-muted">{s.admission_no}</span>
                                <span className="mt-0.5 block">
                                  {s.first_name} {s.last_name}
                                  {dupKeys.has(nameKey(s.first_name, s.last_name)) ? (
                                    <span className="ml-2 text-xs text-gold">Same name</span>
                                  ) : null}
                                  {s.status && s.status !== "ACTIVE" ? (
                                    <span className="ml-2 text-xs text-gold">{s.status}</span>
                                  ) : null}
                                </span>
                                <span className="block text-xs text-muted">
                                  Parent: {s.parent_name || "—"} · {s.parent_phone || "no phone"}
                                  {s.enrolled_on ? ` · enrolled ${s.enrolled_on}` : ""}
                                </span>
                              </span>
                            </span>
                            <span className="text-xs text-muted">{openId === s.id ? "▴" : "▾"}</span>
                          </button>
                          {openId === s.id ? (
                            <FamilyEditor
                              student={s}
                              canEdit={!!canEnroll}
                              canDelete={!!isSuper}
                              onDone={() => {
                                qc.invalidateQueries({ queryKey: ["students"] });
                                qc.invalidateQueries({ queryKey: ["dash"] });
                              }}
                            />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            });
          })()}
        </ul>
      </Card>
    </div>
  );
}

function FamilyEditor({
  student,
  canEdit,
  canDelete,
  onDone,
}: {
  student: {
    id: string;
    admission_no: string;
    first_name: string;
    last_name: string;
    class_name: string;
    gender?: string | null;
    dob?: string | null;
    phone?: string | null;
    address?: string | null;
    notes?: string | null;
    parent_name?: string | null;
    parent_phone?: string | null;
    parent_email?: string | null;
    previous_school?: string | null;
    nhis_number?: string | null;
    photo_url?: string | null;
    enrolled_on?: string | null;
    status?: string | null;
  };
  canEdit: boolean;
  canDelete: boolean;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    firstName: student.first_name,
    lastName: student.last_name,
    className: student.class_name,
    gender: student.gender ?? "",
    dob: student.dob ?? "",
    phone: student.phone ?? "",
    address: student.address ?? "",
    notes: student.notes ?? "",
    parentName: student.parent_name ?? "",
    parentPhone: student.parent_phone ?? "",
    parentEmail: student.parent_email ?? "",
    previousSchool: student.previous_school ?? "",
    nhisNumber: student.nhis_number ?? "",
    photoUrl: student.photo_url ?? "",
    enrolledOn: student.enrolled_on ?? "",
    admissionNo: student.admission_no,
    status: (student.status === "LEFT" || student.status === "GRADUATED" ? student.status : "ACTIVE") as
      | "ACTIVE"
      | "LEFT"
      | "GRADUATED",
  });
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      updateStudent({
        data: {
          id: student.id,
          firstName: form.firstName,
          lastName: form.lastName,
          className: form.className,
          gender: form.gender,
          dob: form.dob,
          phone: form.phone,
          address: form.address,
          notes: form.notes,
          parentName: form.parentName,
          parentPhone: form.parentPhone,
          parentEmail: form.parentEmail,
          previousSchool: form.previousSchool,
          nhisNumber: form.nhisNumber,
          photoUrl: form.photoUrl,
          enrolledOn: form.enrolledOn,
          admissionNo: form.admissionNo,
          status: form.status,
        },
      }),
    onSuccess: onDone,
    onError: (e) => setErr((e as Error).message),
  });
  const del = useMutation({
    mutationFn: () => deleteStudent({ data: { id: student.id } }),
    onSuccess: onDone,
    onError: (e) => setErr((e as Error).message),
  });

  return (
    <div className="space-y-3 border-t border-line px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-navy">
        {canEdit ? "Change student details" : "Student details"}
      </p>
      {canEdit ? (
        <p className="text-xs text-muted">
          Super Admin and Accountant can correct any field, including admission number and parent login email.
        </p>
      ) : null}
      <Field label="Student photo">
        <div className="flex items-center gap-3">
          <Avatar src={form.photoUrl || student.photo_url} name={`${form.firstName} ${form.lastName}`} />
          {canEdit ? (
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                try {
                  const url = await readPhoto(file);
                  if (url) setForm({ ...form, photoUrl: url });
                } catch (err) {
                  setErr(err instanceof Error ? err.message : "Photo failed");
                }
              }}
            />
          ) : null}
        </div>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Admission number">
          <Input
            disabled={!canEdit}
            value={form.admissionNo}
            onChange={(e) => setForm({ ...form, admissionNo: e.target.value })}
          />
        </Field>
        <Field label="Status">
          <Select
            disabled={!canEdit}
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as "ACTIVE" | "LEFT" | "GRADUATED" })}
          >
            <option value="ACTIVE">On roll</option>
            <option value="LEFT">Left school</option>
            <option value="GRADUATED">Graduated</option>
          </Select>
        </Field>
        <Field label="First name">
          <Input disabled={!canEdit} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
        </Field>
        <Field label="Last name">
          <Input disabled={!canEdit} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        </Field>
        <Field label="Class">
          <Select disabled={!canEdit} value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })}>
            {[...GHANA_CLASS_LEVELS].sort(sortAlpha).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Gender">
          <Select disabled={!canEdit} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
            <option value="">Select</option>
            <option>Female</option>
            <option>Male</option>
          </Select>
        </Field>
        <Field label="Date of birth">
          <Input disabled={!canEdit} type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
        </Field>
        <Field label="Date of enrollment">
          <Input disabled={!canEdit} type="date" value={form.enrolledOn} onChange={(e) => setForm({ ...form, enrolledOn: e.target.value })} />
        </Field>
        <Field label="Student phone">
          <Input disabled={!canEdit} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Previous school">
          <Input disabled={!canEdit} value={form.previousSchool} onChange={(e) => setForm({ ...form, previousSchool: e.target.value })} />
        </Field>
        <Field label="Ghana NHIS">
          <Input disabled={!canEdit} value={form.nhisNumber} onChange={(e) => setForm({ ...form, nhisNumber: e.target.value })} />
        </Field>
      </div>
      <p className="pt-1 text-xs uppercase tracking-wide text-muted">Parent / guardian</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Parent name">
          <Input disabled={!canEdit} value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} />
        </Field>
        <Field label="Parent phone">
          <Input disabled={!canEdit} value={form.parentPhone} onChange={(e) => setForm({ ...form, parentPhone: e.target.value })} />
        </Field>
        <Field label="Parent email (login)">
          <Input disabled={!canEdit} value={form.parentEmail} onChange={(e) => setForm({ ...form, parentEmail: e.target.value })} />
        </Field>
        <Field label="Home address">
          <Input disabled={!canEdit} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
      </div>
      <Field label="Notes">
        <Input disabled={!canEdit} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </Field>
      {err ? <p className="text-sm text-bad">{err}</p> : null}
      {save.isSuccess ? <p className="text-sm text-good">Saved. The student record is updated.</p> : null}
      {canEdit || canDelete ? (
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <Button type="button" onClick={() => save.mutate()} disabled={save.isPending || !form.firstName.trim() || !form.lastName.trim()}>
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                if (confirm(`Permanently delete ${student.first_name} ${student.last_name} and parent details?`)) {
                  del.mutate();
                }
              }}
              disabled={del.isPending}
            >
              Permanently delete
            </Button>
          ) : null}
        </div>
      ) : null}
      <StudentSchoolRecord studentId={student.id} />
    </div>
  );
}

function StudentSchoolRecord({ studentId }: { studentId: string }) {
  const rec = useQuery({
    queryKey: ["student-record", studentId],
    queryFn: () => getStudentRecord({ data: { studentId } }),
  });
  const cum = useQuery({
    queryKey: ["cumulative", studentId],
    queryFn: () => getCumulativeRecord({ data: { studentId } }),
  });
  const marks = rec.data?.marks ?? [];
  const att = rec.data?.attendance ?? [];
  const bills = rec.data?.bills ?? [];
  const services = rec.data?.services ?? [];
  const receipts = rec.data?.receipts ?? [];
  const present = att.filter((a) => a.status === "Present").length;
  const bus = services.filter((s) => s.kind === "BUS").reduce((a, s) => a + num(s.amount), 0);
  const feeding = services.filter((s) => s.kind === "FEEDING").reduce((a, s) => a + num(s.amount), 0);
  const billed = bills.reduce((a, b) => a + num(b.total), 0);
  const paid = bills.reduce((a, b) => a + num(b.paid), 0);
  return (
    <div className="space-y-3 rounded-[12px] bg-bg p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-muted">Academic record · GES cumulative</p>
        <Link to="/app/cumulative" search={{ student: studentId }} className="text-xs text-navy underline">
          Open full card
        </Link>
      </div>
      {cum.isLoading ? <p className="text-sm text-muted">Loading GES card…</p> : null}
      {cum.data ? <CumulativeRecordSheet data={cum.data} /> : null}
      <p className="text-xs uppercase tracking-wide text-muted">Fees · bus · feeding</p>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <p>Billed <span className="block"><Money n={billed} kind="out" /></span></p>
        <p>Paid <span className="block"><Money n={paid} kind="in" /></span></p>
        <p>Bus <span className="block"><Money n={bus} kind="in" /></span></p>
        <p>Feeding <span className="block"><Money n={feeding} kind="in" /></span></p>
      </div>
      {bills.length ? (
        <ul className="space-y-1 text-sm">
          {bills.map((b) => (
            <li key={b.invoice_no} className="flex justify-between gap-2">
              <span>
                {b.term} · {b.description}
              </span>
              <span>
                <Money n={num(b.paid)} kind="in" /> / <Money n={num(b.total)} kind="out" />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No tuition bills yet.</p>
      )}
      <p className="text-xs uppercase tracking-wide text-muted">Fee receipts</p>
      {receipts.length === 0 ? (
        <p className="text-sm text-muted">No receipt numbers issued yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {receipts.map((r) => (
            <li key={r.id} className="flex justify-between gap-2">
              <Link to="/app/receipt/$id" params={{ id: r.id }} className="font-mono text-navy underline">
                {r.receipt_no}
              </Link>
              <span>
                {r.description} · <Money n={num(r.amount)} kind="in" />
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs uppercase tracking-wide text-muted">Bus & feeding paid</p>
      {services.length === 0 ? (
        <p className="text-sm text-muted">No bus or feeding payments yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {services.map((s) => (
            <li key={s.id} className="flex justify-between gap-2">
              <span>
                <Link to="/app/receipt/$id" params={{ id: s.id }} className="font-mono text-navy underline">
                  {s.receipt_no}
                </Link>
                <span className="mt-0.5 block text-xs text-muted">
                  {s.kind === "BUS" ? "Bus" : "Feeding"} · {String(s.collected_at).slice(0, 10)}
                  {s.recorded_name ? ` · ${s.recorded_name}` : ""}
                </span>
              </span>
              <Money n={num(s.amount)} kind="in" />
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs uppercase tracking-wide text-muted">Marks from teachers</p>
      {rec.isLoading ? <p className="text-sm text-muted">Loading record…</p> : null}
      {marks.length === 0 && !rec.isLoading ? (
        <p className="text-sm text-muted">No marks yet for this student.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {marks.map((m) => (
            <li key={`${m.term}-${m.subject}`} className="flex justify-between gap-2">
              <span>
                {m.class_name} · {m.term} · {m.subject}
                {m.assessment_type ? ` · ${m.assessment_type}` : ""}
              </span>
              <span className="font-mono">{m.score}/100</span>
            </li>
          ))}
        </ul>
      )}
      <p className="pt-2 text-xs uppercase tracking-wide text-muted">
        Attendance {att.length ? `· ${present}/${att.length} present` : ""}
      </p>
      {att.length === 0 && !rec.isLoading ? (
        <p className="text-sm text-muted">No attendance marked yet.</p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-auto text-sm">
          {att.map((a) => (
            <li key={a.day} className="flex justify-between gap-2">
              <span className="text-muted">
                {a.day} · {a.class_name}
              </span>
              <span>{a.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
