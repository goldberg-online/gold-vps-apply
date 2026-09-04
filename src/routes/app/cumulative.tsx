import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getMe, listStudents } from "@/lib/school";
import { getCumulativeRecord, saveCumulativeNote } from "@/lib/academic-ops";
import { GES_CONDUCT, GHANA_CLASS_LEVELS, TERMS, sortAlpha } from "@/lib/ghana";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { CumulativeRecordSheet } from "@/components/cumulative-record";

export const Route = createFileRoute("/app/cumulative")({
  component: CumulativePage,
  validateSearch: (search: Record<string, unknown>): { student?: string } => {
    if (typeof search.student === "string" && search.student) return { student: search.student };
    return {};
  },
});

function classOrder(names: string[]) {
  const set = new Set(names);
  const extra = names
    .filter((n) => !(GHANA_CLASS_LEVELS as readonly string[]).includes(n))
    .sort(sortAlpha);
  return [...GHANA_CLASS_LEVELS.filter((n) => set.has(n)), ...extra];
}

function CumulativePage() {
  const qc = useQueryClient();
  const { student: searchStudent } = Route.useSearch();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMe() });
  const list = useQuery({ queryKey: ["students"], queryFn: () => listStudents() });
  const [studentId, setStudentId] = useState(searchStudent ?? "");
  const [openClass, setOpenClass] = useState<string | null>(null);
  const rec = useQuery({
    queryKey: ["cumulative", studentId],
    queryFn: () => getCumulativeRecord({ data: { studentId } }),
    enabled: !!studentId,
  });
  const role = me.data?.me.role;
  const canNote = role && ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER"].includes(role);
  const isParent = role === "PARENT";
  const [term, setTerm] = useState<(typeof TERMS)[number]>("1st Term");
  const [comment, setComment] = useState("");
  const [conduct, setConduct] = useState("Good");
  const [attitude, setAttitude] = useState("Good");
  const [interest, setInterest] = useState("Good");
  const save = useMutation({
    mutationFn: () =>
      saveCumulativeNote({ data: { studentId, term, comment, conduct, attitude, interest } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cumulative", studentId] });
      setComment("");
    },
  });

  const students = list.data ?? [];
  useEffect(() => {
    if (searchStudent) {
      setStudentId(searchStudent);
      const cls = students.find((s) => s.id === searchStudent)?.class_name;
      if (cls) setOpenClass(cls);
      return;
    }
    if (isParent && students[0] && !studentId) setStudentId(students[0].id);
  }, [searchStudent, isParent, students, studentId]);

  const grouped = useMemo(() => {
    const names = [...new Set(students.map((s) => s.class_name || "Unassigned"))];
    return classOrder(names).map((cls) => ({
      cls,
      kids: students
        .filter((s) => (s.class_name || "Unassigned") === cls)
        .slice()
        .sort((a, b) => sortAlpha(`${a.last_name} ${a.first_name}`, `${b.last_name} ${b.first_name}`)),
    }));
  }, [students]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">GES cumulative record</h1>
          <p className="text-sm text-muted">
            Every enrolled pupil already has a card. Open a class, then a name. SBA 30% + exam 70%. JHS grades 1–9.
          </p>
        </div>
        <Button type="button" variant="ghost" onClick={() => window.print()} disabled={!rec.data}>
          Print card
        </Button>
      </div>

      {isParent ? (
        <div className="space-y-4">
          {students.map((s) => (
            <ParentCard key={s.id} studentId={s.id} />
          ))}
          {students.length === 0 ? (
            <p className="text-sm text-muted">No child is linked to this login yet.</p>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <Card title="Pupils by class" desc="A–Z in every class. Card attached on enrolment.">
            {grouped.length === 0 ? (
              <p className="text-sm text-muted">No students enrolled yet.</p>
            ) : (
              <ul className="space-y-2">
                {grouped.map(({ cls, kids }) => {
                  const open = openClass === cls;
                  return (
                    <li key={cls} className="rounded-[12px] border border-line">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-3 text-left"
                        onClick={() => setOpenClass(open ? null : cls)}
                      >
                        <span className="font-semibold text-navy">{cls}</span>
                        <span className="text-xs text-muted">
                          {kids.length} card{kids.length === 1 ? "" : "s"}
                        </span>
                      </button>
                      {open ? (
                        <ul className="border-t border-line px-2 py-2">
                          {kids.map((s) => (
                            <li key={s.id}>
                              <button
                                type="button"
                                className={`flex w-full items-center justify-between rounded-[8px] px-2 py-2 text-left text-sm ${
                                  studentId === s.id ? "bg-bg font-medium" : ""
                                }`}
                                onClick={() => setStudentId(s.id)}
                              >
                                <span>
                                  {s.last_name} {s.first_name}
                                  <span className="block font-mono text-xs font-normal text-muted">
                                    {s.admission_no}
                                  </span>
                                </span>
                                <span className="text-xs text-good">Attached</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <div className="space-y-4">
            {rec.isLoading ? <p className="text-sm text-muted">Opening GES card…</p> : null}
            {rec.isError ? <p className="text-sm text-bad">{(rec.error as Error).message}</p> : null}
            {rec.data ? (
              <CumulativeRecordSheet data={rec.data} />
            ) : !studentId ? (
              <p className="text-sm text-muted">Open a class and pick a pupil. Every name already has a GES card.</p>
            ) : null}
            {canNote && studentId ? (
              <Card title="Term remarks (GES)" desc="Conduct, attitude and interest sit on the cumulative card.">
                <form
                  className="grid gap-3 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save.mutate();
                  }}
                >
                  <Field label="Term">
                    <Select value={term} onChange={(e) => setTerm(e.target.value as (typeof TERMS)[number])}>
                      {TERMS.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Conduct">
                    <Select value={conduct} onChange={(e) => setConduct(e.target.value)}>
                      {GES_CONDUCT.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Attitude">
                    <Select value={attitude} onChange={(e) => setAttitude(e.target.value)}>
                      {GES_CONDUCT.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Interest">
                    <Select value={interest} onChange={(e) => setInterest(e.target.value)}>
                      {GES_CONDUCT.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </Select>
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Class teacher comment">
                      <Input value={comment} onChange={(e) => setComment(e.target.value)} />
                    </Field>
                  </div>
                  {save.isError ? (
                    <p className="text-sm text-bad sm:col-span-2">{(save.error as Error).message}</p>
                  ) : null}
                  <Button type="submit" disabled={save.isPending}>
                    Save on cumulative card
                  </Button>
                </form>
              </Card>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function ParentCard({ studentId }: { studentId: string }) {
  const rec = useQuery({
    queryKey: ["cumulative", studentId],
    queryFn: () => getCumulativeRecord({ data: { studentId } }),
  });
  if (rec.isLoading) return <p className="text-sm text-muted">Opening GES card…</p>;
  if (rec.isError) return <p className="text-sm text-bad">{(rec.error as Error).message}</p>;
  if (!rec.data) return null;
  return (
    <div className="space-y-3">
      <div className="flex justify-end print:hidden">
        <Button type="button" variant="ghost" onClick={() => window.print()}>
          Print card
        </Button>
      </div>
      <CumulativeRecordSheet data={rec.data} />
    </div>
  );
}
