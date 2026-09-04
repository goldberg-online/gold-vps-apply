import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  assignSubjects,
  deleteCatalogSubject,
  deleteClassSubject,
  importGesSubjects,
  listAssignments,
  listClasses,
  listStaff,
  listSubjectCatalog,
  renameClassSubject,
  saveCatalogSubject,
  seedClasses,
} from "@/lib/school";
import { getCalendar, saveTermDates, setCurrentYear } from "@/lib/academic-ops";
import { GES_SUBJECTS, GHANA_CLASS_LEVELS, bandForClass } from "@/lib/ghana";
import { Button, Card, Field, Input, Select } from "@/components/ui";

export const Route = createFileRoute("/app/academic")({ component: AcademicPage });

function AcademicPage() {
  const qc = useQueryClient();
  const classes = useQuery({ queryKey: ["classes"], queryFn: () => listClasses() });
  const cal = useQuery({ queryKey: ["calendar"], queryFn: () => getCalendar() });
  const staff = useQuery({ queryKey: ["staff"], queryFn: () => listStaff() });
  const assigns = useQuery({ queryKey: ["asg"], queryFn: () => listAssignments() });
  const catalog = useQuery({ queryKey: ["subject-catalog"], queryFn: () => listSubjectCatalog() });
  const [className, setClassName] = useState("Nursery 1");
  const [teacherUserId, setTeacherUserId] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const band = bandForClass(className);
  const subjects = useMemo(() => {
    const rows = catalog.data ?? [];
    const core = rows.filter((r) => r.band === band).map((r) => r.name);
    const extra = rows.filter((r) => r.band === "EXTRA").map((r) => r.name);
    const names = [...core, ...extra.filter((n) => !core.includes(n))];
    return names.length ? names : GES_SUBJECTS[band];
  }, [catalog.data, band]);
  const teachers = (staff.data?.staff ?? []).filter((s) => s.role === "TEACHER" || s.role === "SUPER_ADMIN");
  const seed = useMutation({
    mutationFn: () => seedClasses(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["classes"] }),
  });
  const assign = useMutation({
    mutationFn: async () => {
      const extra = custom.trim();
      const subjects = extra && !picked.includes(extra) ? [...picked, extra] : picked;
      if (extra) {
        await saveCatalogSubject({
          data: { band, name: extra, kind: "SCHOOL" },
        });
      }
      return assignSubjects({ data: { className, teacherUserId, subjects } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asg"] });
      qc.invalidateQueries({ queryKey: ["subject-catalog"] });
      setPicked([]);
      setCustom("");
    },
  });
  const ordered = useMemo(() => {
    const names = new Set((classes.data ?? []).map((c) => c.name));
    return GHANA_CLASS_LEVELS.filter((n) => names.has(n));
  }, [classes.data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Academic structure</h1>
          <p className="text-sm text-ink/90">Creche → Nursery 1–2 → KG → Primary → JHS 3 (BECE)</p>
        </div>
        <Button variant="ghost" onClick={() => seed.mutate()} disabled={seed.isPending}>
          Create all class levels
        </Button>
      </div>
      <Card
        title="GES cumulative records"
        desc="Every enrolled pupil has a GES card attached to their academic record. It opens on enrolment. Marks, attendance and promotion fill it."
      >
        <Link to="/app/cumulative" className="text-sm font-medium text-navy underline">
          Open class lists and pupil cards
        </Link>
      </Card>
      <Card title="Academic year and terms" desc="GES calendar: Sep–Dec 1st, Jan–Apr 2nd, May–Aug 3rd. Set the dates DIS actually uses.">
        <ul className="mb-4 space-y-2 text-sm">
          {(cal.data?.years ?? []).map((y) => (
            <li key={y.id} className="flex items-center justify-between gap-2">
              <span>
                {y.name} · {y.start_date} → {y.end_date}
                {y.is_current ? <span className="ml-2 text-ribbon">current</span> : null}
              </span>
              {!y.is_current ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-9 px-3 text-xs"
                  onClick={() =>
                    setCurrentYear({ data: { id: y.id } }).then(() =>
                      qc.invalidateQueries({ queryKey: ["calendar"] }),
                    )
                  }
                >
                  Make current
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        <ul className="space-y-3">
          {(cal.data?.terms ?? []).map((t) => (
            <li key={t.id} className="grid gap-2 rounded-[12px] bg-bg p-3 md:grid-cols-5 md:items-end">
              <p className="text-sm md:col-span-5">
                {t.name}
                {t.is_current ? <span className="ml-2 text-ribbon">current</span> : null}
                <span className="ml-2 text-xs text-muted">{t.status}</span>
              </p>
              <Field label="Starts">
                <input
                  className="h-11 w-full rounded-[8px] border border-line bg-surface px-3 text-sm"
                  type="date"
                  defaultValue={t.start_date}
                  id={`start-${t.id}`}
                />
              </Field>
              <Field label="Ends">
                <input
                  className="h-11 w-full rounded-[8px] border border-line bg-surface px-3 text-sm"
                  type="date"
                  defaultValue={t.end_date}
                  id={`end-${t.id}`}
                />
              </Field>
              <Button
                type="button"
                onClick={() => {
                  const start = (document.getElementById(`start-${t.id}`) as HTMLInputElement)?.value;
                  const end = (document.getElementById(`end-${t.id}`) as HTMLInputElement)?.value;
                  saveTermDates({
                    data: { id: t.id, startDate: start, endDate: end, isCurrent: true, status: "OPEN" },
                  }).then(() => qc.invalidateQueries({ queryKey: ["calendar"] }));
                }}
              >
                Save as current
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      <CatalogCard
        rows={catalog.data ?? []}
        onDone={() => qc.invalidateQueries({ queryKey: ["subject-catalog"] })}
      />
      <Card title="Assign subjects to a teacher" desc="Tick GES or DIS names from the catalogue, or type one.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            assign.mutate();
          }}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Class">
              <Select
                value={className}
                onChange={(e) => {
                  setClassName(e.target.value);
                  setPicked([]);
                }}
              >
                {(ordered.length ? ordered : GHANA_CLASS_LEVELS).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Teacher">
              <Select value={teacherUserId} onChange={(e) => setTeacherUserId(e.target.value)} required>
                <option value="">Select teacher</option>
                {teachers.map((t) => (
                  <option key={t.user_id} value={t.user_id}>
                    {t.first_name} {t.last_name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <p className="text-xs text-muted">
            Band:{" "}
            {band === "NURSERY"
              ? "Nursery 1 & 2"
              : band === "KG"
                ? "KG 1 & 2"
                : band === "PRIMARY"
                  ? "Primary"
                  : band === "JHS"
                    ? "JHS / BECE"
                    : "Creche"}{" "}
            · plus extra-curricular
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {subjects.map((s) => (
              <label key={s} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={picked.includes(s)}
                  onChange={() =>
                    setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]))
                  }
                />
                {s}
              </label>
            ))}
          </div>
          <Field label="Or type a subject for this class">
            <Input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="e.g. Numeracy (DIS) or Ballet"
            />
          </Field>
          {assign.isError ? <p className="text-sm text-bad">{(assign.error as Error).message}</p> : null}
          <Button disabled={assign.isPending || !teacherUserId || (picked.length === 0 && !custom.trim())}>
            Assign {(picked.length || 0) + (custom.trim() ? 1 : 0) || ""} subject(s)
          </Button>
        </form>
      </Card>
      <Card title="Current assignments" desc="Edit a misspelled name or remove a subject this class does not use.">
        <ul className="space-y-2">
          {(assigns.data ?? []).map((a) => (
            <SubjectRow key={a.id} row={a} onDone={() => qc.invalidateQueries({ queryKey: ["asg"] })} />
          ))}
        </ul>
      </Card>
    </div>
  );
}

const BAND_LABEL: Record<string, string> = {
  NURSERY: "Nursery 1 & 2",
  KG: "KG 1 & 2",
  EARLY: "Creche (GES)",
  PRIMARY: "Primary (GES)",
  JHS: "JHS / BECE (GES)",
  EXTRA: "Extra-curricular / DIS jargon",
};

function CatalogCard({
  rows,
  onDone,
}: {
  rows: { id: string; band: string; kind: string; name: string }[];
  onDone: () => void;
}) {
  const [band, setBand] = useState<"NURSERY" | "KG" | "EARLY" | "PRIMARY" | "JHS" | "EXTRA">("NURSERY");
  const [name, setName] = useState("");
  const [gesPick, setGesPick] = useState<string[]>([]);
  const add = useMutation({
    mutationFn: () =>
      saveCatalogSubject({
        data: { band, name, kind: band === "EXTRA" ? "EXTRA" : "SCHOOL" },
      }),
    onSuccess: () => {
      setName("");
      onDone();
    },
  });
  const importGes = useMutation({
    mutationFn: (which: "NURSERY" | "KG" | "EARLY" | "PRIMARY" | "JHS" | "ALL") =>
      importGesSubjects({ data: { band: which } }),
    onSuccess: () => {
      setGesPick([]);
      onDone();
    },
  });
  const addPickedGes = useMutation({
    mutationFn: async () => {
      const target = band === "EXTRA" ? "NURSERY" : band;
      for (const n of gesPick) {
        await saveCatalogSubject({ data: { band: target, name: n, kind: "GES" } });
      }
    },
    onSuccess: () => {
      setGesPick([]);
      onDone();
    },
  });
  const groups = (["NURSERY", "KG", "EARLY", "PRIMARY", "JHS", "EXTRA"] as const).map((b) => ({
    band: b,
    items: rows.filter((r) => r.band === b),
  }));
  const gesBand = band === "EXTRA" ? "NURSERY" : band;
  const already = new Set(rows.filter((r) => r.band === gesBand).map((r) => r.name.toLowerCase()));
  const official = (GES_SUBJECTS as Record<string, string[]>)[gesBand] ?? GES_SUBJECTS.NURSERY;
  const gesMissing = official.filter((n) => !already.has(n.toLowerCase()));
  return (
    <Card
      title="Subjects"
      desc="Add official GES subjects, or type a DIS name yourself. Then assign them to a teacher and class below."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[12px] border border-line bg-bg p-4">
          <h3 className="text-sm font-semibold text-navy">Add from GES</h3>
          <p className="mt-1 text-xs text-muted">Official Ghana Education Service lists. Tick what DIS uses.</p>
          <div className="mt-3">
            <Field label="GES band">
              <Select
                value={gesBand}
                onChange={(e) => {
                  setBand(e.target.value as "NURSERY" | "KG" | "EARLY" | "PRIMARY" | "JHS");
                  setGesPick([]);
                }}
              >
                <option value="NURSERY">Nursery 1 & 2</option>
                <option value="KG">KG 1 & 2</option>
                <option value="EARLY">Creche (GES)</option>
                <option value="PRIMARY">Primary</option>
                <option value="JHS">JHS / BECE</option>
              </Select>
            </Field>
          </div>
          {gesMissing.length === 0 ? (
            <p className="mt-3 text-sm text-muted">All GES subjects for this band are already in the list.</p>
          ) : (
            <div className="mt-3 grid gap-1">
              {gesMissing.map((s) => (
                <label key={s} className="flex min-h-10 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={gesPick.includes(s)}
                    onChange={() => setGesPick((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]))}
                  />
                  {s}
                </label>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" disabled={addPickedGes.isPending || gesPick.length === 0} onClick={() => addPickedGes.mutate()}>
              {addPickedGes.isPending ? "Adding…" : `Add selected (${gesPick.length})`}
            </Button>
            <Button type="button" variant="ghost" disabled={importGes.isPending} onClick={() => importGes.mutate(gesBand)}>
              Add all GES in this band
            </Button>
            <Button type="button" variant="ghost" disabled={importGes.isPending} onClick={() => importGes.mutate("ALL")}>
              Add all official lists
            </Button>
          </div>
          {importGes.data ? <p className="mt-2 text-sm text-income">{importGes.data.added} GES subject(s) added.</p> : null}
          {importGes.isError ? <p className="mt-2 text-sm text-bad">{(importGes.error as Error).message}</p> : null}
          {addPickedGes.isError ? <p className="mt-2 text-sm text-bad">{(addPickedGes.error as Error).message}</p> : null}
        </div>
        <div className="rounded-[12px] border border-line bg-bg p-4">
          <h3 className="text-sm font-semibold text-navy">Enter it yourself</h3>
          <p className="mt-1 text-xs text-muted">DIS wording, extra-curriculars, or a subject GES does not list.</p>
          <form
            className="mt-3 grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <Field label="Put under">
              <Select value={band} onChange={(e) => setBand(e.target.value as typeof band)}>
                <option value="NURSERY">Nursery 1 & 2</option>
                <option value="KG">KG 1 & 2</option>
                <option value="EARLY">Creche</option>
                <option value="PRIMARY">Primary</option>
                <option value="JHS">JHS</option>
                <option value="EXTRA">Extra-curricular</option>
              </Select>
            </Field>
            <Field label="Subject name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. Choir, Robotics, Numeracy (DIS)"
              />
            </Field>
            <Button disabled={add.isPending || !name.trim()}>{add.isPending ? "Saving…" : "Save subject"}</Button>
          </form>
          {add.isError ? <p className="mt-2 text-sm text-bad">{(add.error as Error).message}</p> : null}
        </div>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {groups.map((g) => (
          <div key={g.band}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy">{BAND_LABEL[g.band]}</p>
            <ul className="space-y-2">
              {g.items.length === 0 ? <li className="text-sm text-muted">None yet.</li> : null}
              {g.items.map((r) => (
                <CatalogRow key={r.id} row={r} onDone={onDone} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CatalogRow({
  row,
  onDone,
}: {
  row: { id: string; band: string; kind: string; name: string };
  onDone: () => void;
}) {
  const [name, setName] = useState(row.name);
  const save = useMutation({
    mutationFn: () =>
      saveCatalogSubject({
        data: { id: row.id, band: row.band as "NURSERY" | "KG" | "EARLY" | "PRIMARY" | "JHS" | "EXTRA", name },
      }),
    onSuccess: onDone,
  });
  const del = useMutation({
    mutationFn: () => deleteCatalogSubject({ data: { id: row.id } }),
    onSuccess: onDone,
  });
  return (
    <li className="flex flex-wrap items-center gap-2">
      <Input className="min-w-40 flex-1" value={name} onChange={(e) => setName(e.target.value)} />
      <span className="text-[10px] uppercase text-muted">{row.kind}</span>
      <Button
        type="button"
        className="min-h-9 px-3 text-xs"
        disabled={save.isPending || name.trim() === row.name}
        onClick={() => save.mutate()}
      >
        Save
      </Button>
      <Button type="button" variant="ghost" className="min-h-9 px-3 text-xs" disabled={del.isPending} onClick={() => del.mutate()}>
        Drop
      </Button>
      {save.isError ? <p className="w-full text-xs text-bad">{(save.error as Error).message}</p> : null}
    </li>
  );
}

function SubjectRow({
  row,
  onDone,
}: {
  row: { id: string; class_name: string; subject_name: string; teacher: string | null };
  onDone: () => void;
}) {
  const [name, setName] = useState(row.subject_name);
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => renameClassSubject({ data: { id: row.id, subjectName: name } }),
    onSuccess: () => {
      setErr(null);
      onDone();
    },
    onError: (e) => setErr((e as Error).message),
  });
  const del = useMutation({
    mutationFn: () => deleteClassSubject({ data: { id: row.id } }),
    onSuccess: onDone,
    onError: (e) => setErr((e as Error).message),
  });
  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className="w-full text-xs text-muted">
        {row.class_name} · {row.teacher ?? "No teacher"}
      </span>
      <Input className="min-w-40 flex-1" value={name} onChange={(e) => setName(e.target.value)} />
      <Button
        type="button"
        className="min-h-9 px-3 text-xs"
        disabled={save.isPending || name.trim() === row.subject_name}
        onClick={() => save.mutate()}
      >
        Save
      </Button>
      <Button type="button" variant="ghost" className="min-h-9 px-3 text-xs" disabled={del.isPending} onClick={() => del.mutate()}>
        Drop
      </Button>
      {err ? <p className="w-full text-xs text-bad">{err}</p> : null}
    </li>
  );
}
