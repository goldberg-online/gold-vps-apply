import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getMe, listStudents } from "@/lib/school";
import { getReportCard, saveReportComment } from "@/lib/academic-ops";
import { TERMS } from "@/lib/ghana";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { StudentTypeahead } from "@/components/student-typeahead";

export const Route = createFileRoute("/app/report-cards")({ component: ReportCardsPage });

function ReportCardsPage() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMe() });
  const list = useQuery({ queryKey: ["students"], queryFn: () => listStudents() });
  const [studentId, setStudentId] = useState("");
  const [term, setTerm] = useState<(typeof TERMS)[number]>("1st Term");
  const [comment, setComment] = useState("");
  const card = useQuery({
    queryKey: ["report", studentId, term],
    queryFn: () => getReportCard({ data: { studentId, term } }),
    enabled: !!studentId,
  });
  const save = useMutation({
    mutationFn: () => saveReportComment({ data: { studentId, term, comment } }),
    onSuccess: () => card.refetch(),
  });
  const canComment = me.data && ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER"].includes(me.data.me.role);
  const students = list.data ?? [];
  const shown = useMemo(() => card.data, [card.data]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Report cards</h1>
        <p className="text-sm text-muted">
          Term marks, attendance, and a class teacher comment. Every pupil also has a running{" "}
          <Link
            className="text-navy underline"
            to="/app/cumulative"
            {...(studentId ? { search: { student: studentId } } : {})}
          >
            GES cumulative record
          </Link>{" "}
          attached to the academic record.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <StudentTypeahead
          students={students}
          value={studentId}
          onChange={setStudentId}
          label="Student (type name)"
        />
        <Field label="Term">
          <Select value={term} onChange={(e) => setTerm(e.target.value as (typeof TERMS)[number])}>
            {TERMS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          <Button type="button" variant="ghost" className="w-full" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>
      {shown ? (
        <Card className="print-sheet">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-gold">DIS ONLINE</p>
              <h2 className="text-xl">
                {shown.student.first_name} {shown.student.last_name}
              </h2>
              <p className="text-sm text-muted">
                {shown.student.admission_no} · {shown.student.class_name} · {shown.yearName} · {shown.term}
              </p>
            </div>
            {shown.student.photo_url ? (
              <img src={shown.student.photo_url} alt="" className="h-16 w-16 rounded-full object-cover" />
            ) : null}
          </div>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1">Subject</th>
                <th className="py-1">Score / 100</th>
              </tr>
            </thead>
            <tbody>
              {shown.marks.map((m) => (
                <tr key={m.subject} className="border-t border-line">
                  <td className="py-1">{m.subject}</td>
                  <td className="py-1 font-mono">{m.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm">
            Average <span className="font-mono">{shown.average}</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            Attendance: Present {shown.attendance.present} · Late {shown.attendance.late} · Absent {shown.attendance.absent}
          </p>
          <p className="mt-3 text-sm">{shown.comment || "No comment yet."}</p>
        </Card>
      ) : (
        <p className="text-sm text-muted">Pick a student.</p>
      )}
      {canComment && studentId ? (
        <Card title="Class teacher comment">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <Field label="Comment">
              <Input value={comment} onChange={(e) => setComment(e.target.value)} required />
            </Field>
            {save.isError ? <p className="text-sm text-bad">{(save.error as Error).message}</p> : null}
            <Button type="submit" disabled={save.isPending}>
              Save comment
            </Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}