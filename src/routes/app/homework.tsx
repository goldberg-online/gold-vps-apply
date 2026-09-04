import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listStudents, listSubjectCatalog } from "@/lib/school";
import { assignHomework, listHomework, markHomeworkDone } from "@/lib/academic-ops";
import { GES_SUBJECTS, GHANA_CLASS_LEVELS, bandForClass, sortAlpha } from "@/lib/ghana";
import { Button, Card, Field, Input, Select } from "@/components/ui";

export const Route = createFileRoute("/app/homework")({ component: HomeworkPage });

function HomeworkPage() {
  const qc = useQueryClient();
  const hw = useQuery({ queryKey: ["homework"], queryFn: () => listHomework() });
  const catalog = useQuery({ queryKey: ["subject-catalog"], queryFn: () => listSubjectCatalog() });
  const students = useQuery({ queryKey: ["students"], queryFn: () => listStudents() });
  const role = hw.data?.me.role;
  const canSet = role === "TEACHER" || role === "SCHOOL_ADMIN" || role === "SUPER_ADMIN";
  const [form, setForm] = useState({
    className: "Primary 1",
    subjectName: "English Language",
    title: "",
    body: "",
    dueDate: new Date().toISOString().slice(0, 10),
  });
  const mut = useMutation({
    mutationFn: () => assignHomework({ data: form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["homework"] });
      setForm({ ...form, title: "", body: "" });
    },
  });
  const band = bandForClass(form.className);
  const subjects = useMemo(() => {
    const rows = catalog.data ?? [];
    const core = rows.filter((r) => r.band === band).map((r) => r.name);
    const extra = rows.filter((r) => r.band === "EXTRA").map((r) => r.name);
    const names = [...core, ...extra.filter((n) => !core.includes(n))];
    return names.length ? names : GES_SUBJECTS[band];
  }, [catalog.data, form.className]);
  const items = hw.data?.items ?? [];
  const done = hw.data?.done ?? [];
  const roster = useMemo(
    () => (students.data ?? []).filter((s) => (s.status ?? "ACTIVE") !== "GRADUATED"),
    [students.data],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      {canSet ? (
        <Card title="Set homework" desc="Teachers may only assign for a class and subject they teach.">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              mut.mutate();
            }}
          >
            <Field label="Class">
              <Select
                value={form.className}
                onChange={(e) => setForm({ ...form, className: e.target.value })}
              >
                {GHANA_CLASS_LEVELS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Subject">
              <Select
                value={form.subjectName}
                onChange={(e) => setForm({ ...form, subjectName: e.target.value })}
              >
                {subjects.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="Title">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </Field>
            <Field label="Details">
              <Input value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </Field>
            <Field label="Due">
              <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </Field>
            {mut.isError ? <p className="text-sm text-bad">{(mut.error as Error).message}</p> : null}
            <Button type="submit" className="w-full" disabled={mut.isPending}>
              Assign
            </Button>
          </form>
        </Card>
      ) : (
        <Card title="Homework" desc="Work set for your child’s class.">
          <p className="text-sm text-muted">Open an item on the right for the due date and subject.</p>
        </Card>
      )}
      <Card title="Set work">
        <ul className="space-y-3">
          {items.map((h) => {
            const classRoster = roster
              .filter((s) => s.class_name === h.class_name)
              .slice()
              .sort((a, b) => sortAlpha(`${a.last_name} ${a.first_name}`, `${b.last_name} ${b.first_name}`));
            const doneIds = new Set(done.filter((d) => d.homework_id === h.id).map((d) => d.student_id));
            return (
              <li key={h.id} className="rounded-[12px] border border-line p-3 text-sm">
                <p className="font-medium">{h.title}</p>
                <p className="text-xs text-muted">
                  {h.class_name} · {h.subject_name} · due {h.due_date} · {h.teacher}
                </p>
                {h.body ? <p className="mt-1">{h.body}</p> : null}
                {canSet ? (
                  <ul className="mt-2 space-y-1">
                    {classRoster.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                        <span>
                          {s.first_name} {s.last_name}
                        </span>
                        {doneIds.has(s.id) ? (
                          <span className="text-good">Done</span>
                        ) : (
                          <button
                            type="button"
                            className="text-gold"
                            onClick={() =>
                              markHomeworkDone({ data: { homeworkId: h.id, studentId: s.id } }).then(() =>
                                qc.invalidateQueries({ queryKey: ["homework"] }),
                              )
                            }
                          >
                            Mark done
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted">Due {h.due_date}</p>
                )}
              </li>
            );
          })}
        </ul>
        {items.length === 0 ? <p className="text-sm text-muted">No homework yet.</p> : null}
      </Card>
    </div>
  );
}