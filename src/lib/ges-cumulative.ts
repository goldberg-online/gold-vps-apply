import {
  GES_SUBJECTS,
  TERMS,
  bandForClass,
  gesLabelForClass,
  gesTermTotal,
  isGesExam,
  num,
  termFromDate,
  type SchoolTerm,
} from "@/lib/ghana";

export type MarkRow = {
  student_id?: string;
  subject: string;
  term: string;
  assessment_type: string;
  score: string | number;
  class_name: string;
};

export type TermCell = {
  sba: number | null;
  exam: number | null;
  total: number | null;
  grade: string;
  remark: string;
};

export type SubjectLine = {
  subject: string;
  terms: Record<SchoolTerm, TermCell>;
  cumulative: number | null;
  grade: string;
  remark: string;
};

export type ClassBlock = {
  className: string;
  subjects: SubjectLine[];
  termAverage: Record<SchoolTerm, number | null>;
  overall: number | null;
  attendance: Record<SchoolTerm, { present: number; absent: number; late: number; days: number }>;
  position: Record<SchoolTerm, number | null>;
  classSize: number;
};

function emptyCell(): TermCell {
  return { sba: null, exam: null, total: null, grade: "—", remark: "" };
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function cellFor(className: string, sba: number | null, exam: number | null): TermCell {
  const total = gesTermTotal(sba, exam);
  if (total == null) return emptyCell();
  const g = gesLabelForClass(className, total);
  return { sba, exam, total, grade: g.code, remark: g.remark };
}

export function buildCumulative(opts: {
  className: string;
  marks: MarkRow[];
  attendance: { day: string; status: string; class_name?: string }[];
  classMarks?: MarkRow[];
  studentId?: string;
  classmateIds?: string[];
}): ClassBlock[] {
  const byClass = new Map<string, MarkRow[]>();
  for (const m of opts.marks) {
    const k = m.class_name || opts.className;
    const list = byClass.get(k) ?? [];
    list.push(m);
    byClass.set(k, list);
  }
  if (byClass.size === 0) byClass.set(opts.className, []);

  const classMarks = opts.classMarks ?? [];
  const peerIds = new Set(opts.classmateIds ?? []);

  return [...byClass.entries()].map(([className, rows]) => {
    const band = bandForClass(className);
    const catalog = GES_SUBJECTS[band] ?? [];
    const subjects = new Set<string>([...catalog, ...rows.map((r) => r.subject)]);
    const grouped = new Map<string, Map<string, { sba: number[]; exam: number[] }>>();
    for (const r of rows) {
      const term = (TERMS as readonly string[]).includes(r.term) ? r.term : "1st Term";
      if (!grouped.has(r.subject)) grouped.set(r.subject, new Map());
      const tmap = grouped.get(r.subject)!;
      if (!tmap.has(term)) tmap.set(term, { sba: [], exam: [] });
      const bucket = tmap.get(term)!;
      const score = num(r.score);
      if (isGesExam(r.assessment_type)) bucket.exam.push(score);
      else bucket.sba.push(score);
    }

    const subjectLines: SubjectLine[] = [...subjects].map((subject) => {
      const tmap = grouped.get(subject) ?? new Map();
      const terms = {} as Record<SchoolTerm, TermCell>;
      const totals: number[] = [];
      for (const term of TERMS) {
        const b = tmap.get(term);
        const sba = b?.sba.length ? avg(b.sba) : null;
        const exam = b?.exam.length ? avg(b.exam) : null;
        const cell = cellFor(className, sba, exam);
        terms[term] = cell;
        if (cell.total != null) totals.push(cell.total);
      }
      const cumulative = avg(totals);
      const g = cumulative == null ? { code: "—", remark: "" } : gesLabelForClass(className, cumulative);
      return { subject, terms, cumulative, grade: g.code, remark: g.remark };
    });

    const termAverage = {} as Record<SchoolTerm, number | null>;
    for (const term of TERMS) {
      termAverage[term] = avg(
        subjectLines.map((s) => s.terms[term].total).filter((n): n is number => n != null),
      );
    }
    const overall = avg(subjectLines.map((s) => s.cumulative).filter((n): n is number => n != null));

    const attendance = {} as ClassBlock["attendance"];
    for (const term of TERMS) {
      attendance[term] = { present: 0, absent: 0, late: 0, days: 0 };
    }
    for (const a of opts.attendance) {
      if (a.class_name && a.class_name !== className) continue;
      const term = termFromDate(a.day);
      const slot = attendance[term];
      slot.days += 1;
      if (a.status === "Present") slot.present += 1;
      else if (a.status === "Late") slot.late += 1;
      else slot.absent += 1;
    }

    const position = {} as Record<SchoolTerm, number | null>;
    const peers = classMarks.length
      ? classMarks
      : rows;
    const byStudent = new Map<string, MarkRow[]>();
    for (const m of peers) {
      if (m.class_name && m.class_name !== className) continue;
      const id = (m as MarkRow & { student_id?: string }).student_id || opts.studentId || "self";
      if (peerIds.size && id !== opts.studentId && !peerIds.has(id) && id !== "self") continue;
      const list = byStudent.get(id) ?? [];
      list.push(m);
      byStudent.set(id, list);
    }
    for (const term of TERMS) {
      const scores: { id: string; avg: number }[] = [];
      for (const [id, list] of byStudent) {
        const totals: number[] = [];
        const sub = new Map<string, { sba: number[]; exam: number[] }>();
        for (const r of list.filter((x) => x.term === term)) {
          if (!sub.has(r.subject)) sub.set(r.subject, { sba: [], exam: [] });
          const b = sub.get(r.subject)!;
          if (isGesExam(r.assessment_type)) b.exam.push(num(r.score));
          else b.sba.push(num(r.score));
        }
        for (const b of sub.values()) {
          const t = gesTermTotal(b.sba.length ? avg(b.sba) : null, b.exam.length ? avg(b.exam) : null);
          if (t != null) totals.push(t);
        }
        const a = avg(totals);
        if (a != null) scores.push({ id, avg: a });
      }
      scores.sort((a, b) => b.avg - a.avg);
      const me = opts.studentId || "self";
      const idx = scores.findIndex((s) => s.id === me || s.id === "self");
      position[term] = idx >= 0 ? idx + 1 : null;
    }

    return {
      className,
      subjects: subjectLines,
      termAverage,
      overall,
      attendance,
      position,
      classSize: Math.max(peerIds.size, byStudent.size, 1),
    };
  });
}
