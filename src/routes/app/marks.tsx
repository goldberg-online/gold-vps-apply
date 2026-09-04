import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { listAccumulatedMarks, listStudents, listTeachingLoad, saveMark } from "@/lib/school";
import { GHANA_CLASS_LEVELS, GES_SUBJECTS, TERMS, TEST_TYPES, bandForClass, num, sortAlpha } from "@/lib/ghana";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { StudentTypeahead } from "@/components/student-typeahead";

export const Route = createFileRoute("/app/marks")({ component: MarksPage });

function MarksPage() {
  const qc = useQueryClient();
  const loadQ = useQuery({ queryKey: ["teaching-load"], queryFn: () => listTeachingLoad() });
  const students = useQuery({ queryKey: ["students"], queryFn: () => listStudents() });
  const acc = useQuery({ queryKey: ["marks"], queryFn: () => listAccumulatedMarks() });
  const role = loadQ.data?.me.role;
  const isTeacher = role === "TEACHER";
  const load = loadQ.data?.load ?? [];
  const assignedClasses = useMemo(() => {
    const names = [...new Set(load.map((l) => l.class_name))];
    return GHANA_CLASS_LEVELS.filter((c) => names.includes(c));
  }, [load]);
  const classOptions = isTeacher
    ? assignedClasses
    : assignedClasses.length
      ? assignedClasses
      : [...GHANA_CLASS_LEVELS];

  const [className, setClassName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [subject, setSubject] = useState("");
  const [term, setTerm] = useState("1st Term");
  const [assessmentType, setAssessmentType] = useState("Class test");
  const [customType, setCustomType] = useState("");
  const [score, setScore] = useState("");

  useEffect(() => {
    if (!className && classOptions[0]) setClassName(classOptions[0]);
  }, [className, classOptions]);

  const subjectsForClass = useMemo(() => {
    const fromLoad = load.filter((l) => l.class_name === className).map((l) => l.subject_name);
    if (isTeacher) return [...new Set(fromLoad)];
    if (fromLoad.length) return [...new Set(fromLoad)];
    return GES_SUBJECTS[bandForClass(className || "Primary 1")];
  }, [load, className, isTeacher]);

  useEffect(() => {
    if (!subjectsForClass.includes(subject)) setSubject(subjectsForClass[0] ?? "");
  }, [subjectsForClass, subject]);

  const roster = useMemo(
    () =>
      (students.data ?? [])
        .filter((s) => s.class_name === className)
        .slice()
        .sort((a, b) => sortAlpha(`${a.last_name} ${a.first_name}`, `${b.last_name} ${b.first_name}`)),
    [students.data, className],
  );
  const grouped = useMemo(() => {
    const byClass = new Map<
      string,
      Map<string, { name: string; admission: string; rows: { subject: string; term: string; kind: string; score: number }[] }>
    >();
    for (const r of acc.data ?? []) {
      if (!byClass.has(r.class_name)) byClass.set(r.class_name, new Map());
      const cls = byClass.get(r.class_name)!;
      if (!cls.has(r.student_id)) {
        cls.set(r.student_id, {
          name: `${r.first_name} ${r.last_name}`,
          admission: r.admission_no,
          rows: [],
        });
      }
      cls.get(r.student_id)!.rows.push({
        subject: r.subject,
        term: r.term,
        kind: r.assessment_type || "Class test",
        score: num(r.score),
      });
    }
    return GHANA_CLASS_LEVELS.filter((c) => byClass.has(c)).map((c) => ({
      className: c,
      students: [...byClass.get(c)!.values()],
    }));
  }, [acc.data]);
  const mut = useMutation({
    mutationFn: () =>
      saveMark({
        data: {
          studentId,
          className,
          subject,
          term,
          assessmentType: customType.trim() || assessmentType,
          score: Number(score),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marks"] });
      qc.invalidateQueries({ queryKey: ["student-record"] });
      qc.invalidateQueries({ queryKey: ["cumulative"] });
      setScore("");
    },
  });

  const noLoad = isTeacher && load.length === 0 && !loadQ.isLoading;

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Card
        title="Enter mark"
        desc="Class tests count as SBA (30%). End-of-term exam is 70%. Both write themselves onto the pupil’s GES cumulative record."
      >
        {noLoad ? (
          <p className="text-sm text-muted">
            School Admin has not assigned you a class and subject yet. You cannot enter marks until that is done.
          </p>
        ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <Field label="Class">
            <Select
              value={className}
              onChange={(e) => {
                setClassName(e.target.value);
                setStudentId("");
              }}
            >
              {classOptions.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <StudentTypeahead
            students={roster}
            value={studentId}
            onChange={setStudentId}
            required
            label="Student in this class (type name)"
          />
          <Field label="Assigned subject">
            <Select value={subject} onChange={(e) => setSubject(e.target.value)} required>
              {subjectsForClass.length === 0 ? <option value="">No subject assigned</option> : null}
              {subjectsForClass.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Term">
            <Select value={term} onChange={(e) => setTerm(e.target.value)}>
              {TERMS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Type of test">
            <Select
              value={TEST_TYPES.includes(assessmentType as (typeof TEST_TYPES)[number]) ? assessmentType : "Class test"}
              onChange={(e) => {
                setAssessmentType(e.target.value);
                setCustomType("");
              }}
            >
              {TEST_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Or write your own (optional)">
            <Input
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              placeholder="e.g. Weekly test 3, BECE mock"
            />
          </Field>
          <Field label="Score / 100">
            <Input
              type="number"
              min={0}
              max={100}
              value={score}
              onChange={(e) => setScore(e.target.value)}
              required
            />
          </Field>
          {mut.isError ? <p className="text-sm text-bad">{(mut.error as Error).message}</p> : null}
          {mut.isSuccess ? <p className="text-sm text-good">Saved on the student record.</p> : null}
          <Button className="w-full" disabled={mut.isPending || !studentId || !subject}>
            Save mark
          </Button>
        </form>
        )}
      </Card>
      <Card title="Accumulated marks" desc={isTeacher ? "Only your assigned class and subject." : "Grouped by class, then each student."}>
        {grouped.length === 0 ? (
          <p className="text-sm text-muted">
            {noLoad ? "Nothing to show until you are assigned." : "No marks yet for your load."}
          </p>
        ) : (
          <div className="space-y-6">
            {grouped.map((g) => (
              <section key={g.className}>
                <h3 className="border-b border-line pb-2 text-sm font-medium uppercase tracking-wide text-gold">
                  {g.className}
                </h3>
                <ul className="mt-3 space-y-4">
                  {g.students.map((st) => {
                    const avg =
                      st.rows.length === 0
                        ? 0
                        : st.rows.reduce((a, r) => a + r.score, 0) / st.rows.length;
                    return (
                      <li key={st.admission} className="rounded-[12px] bg-bg p-3">
                        <div className="flex justify-between gap-2 text-sm">
                          <span>
                            {st.name}
                            <span className="ml-2 font-mono text-xs text-muted">{st.admission}</span>
                          </span>
                          <span className="font-mono text-xs text-muted">Avg {avg.toFixed(1)}</span>
                        </div>
                        <ul className="mt-2 space-y-1 text-sm">
                          {st.rows.map((r) => (
                            <li key={`${r.term}-${r.subject}-${r.kind}`} className="flex justify-between gap-2">
                              <span className="text-muted">
                                {r.term} · {r.subject} · {r.kind}
                              </span>
                              <span className="font-mono">{r.score}/100</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}