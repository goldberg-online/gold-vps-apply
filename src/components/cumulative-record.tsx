import { Fragment } from "react";
import { TERMS, type SchoolTerm } from "@/lib/ghana";
import type { ClassBlock } from "@/lib/ges-cumulative";

type Note = {
  year_name: string;
  term: string;
  comment: string;
  conduct: string | null;
  attitude: string | null;
  interest: string | null;
};

export type CumulativePayload = {
  student: {
    admission_no: string;
    first_name: string;
    last_name: string;
    class_name: string;
    gender: string | null;
    dob: string | null;
    address: string | null;
    parent_name: string | null;
    parent_phone: string | null;
    previous_school: string | null;
    nhis_number: string | null;
    photo_url: string | null;
    enrolled_on: string | null;
  };
  yearName: string;
  school: string;
  motto: string;
  openedOn?: string | null;
  openedClass?: string | null;
  blocks: ClassBlock[];
  promotions: { from_class: string; to_class: string; year_name: string; decision: string }[];
  notes: Note[];
};

function cell(n: number | null) {
  return n == null ? "—" : String(n);
}

export function CumulativeRecordSheet({ data }: { data: CumulativePayload }) {
  const s = data.student;
  return (
    <article className="print-sheet space-y-5 border border-navy/25 bg-surface p-4 text-navy sm:p-6">
      <header className="border-b-2 border-navy pb-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted">Republic of Ghana</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em]">Ghana Education Service</p>
        <h2 className="mt-2 text-lg font-semibold uppercase tracking-wide">Pupil's cumulative record</h2>
        <p className="mt-2 text-sm font-semibold uppercase">{data.school}</p>
        <p className="text-sm italic text-muted">{data.motto}</p>
        <p className="mt-1 text-xs text-muted">
          NaCCA / GES basic school · Academic year {data.yearName}
        </p>
      </header>

      <section className="flex flex-wrap items-start gap-4">
        {s.photo_url ? (
          <img src={s.photo_url} alt="" className="h-20 w-20 rounded-[8px] border border-line object-cover" />
        ) : (
          <div className="grid h-20 w-20 place-items-center rounded-[8px] border border-dashed border-line text-xs text-muted">
            Photo
          </div>
        )}
        <dl className="grid min-w-0 flex-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Name of pupil</dt>
            <dd className="font-medium uppercase">
              {s.last_name}, {s.first_name}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Admission number</dt>
            <dd className="font-mono">{s.admission_no}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Sex</dt>
            <dd>{s.gender || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Date of birth</dt>
            <dd>{s.dob || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Present class</dt>
            <dd>{s.class_name}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Date of admission</dt>
            <dd>{s.enrolled_on || data.openedOn || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Class admitted to</dt>
            <dd>{data.openedClass || s.class_name}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Card opened</dt>
            <dd>{data.openedOn || s.enrolled_on || "On enrolment"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Parent / guardian</dt>
            <dd>{s.parent_name || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Telephone</dt>
            <dd>{s.parent_phone || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Previous school</dt>
            <dd>{s.previous_school || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">NHIS</dt>
            <dd>{s.nhis_number || "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-muted">Home address</dt>
            <dd>{s.address || "—"}</dd>
          </div>
        </dl>
      </section>

      <p className="rounded-[8px] bg-bg px-3 py-2 text-xs text-muted">
        This card is opened the day the pupil is enrolled and stays on the academic record through every class.
        Class score (SBA) is 30% and the end-of-term examination is 70%, as GES requires.
      </p>

      {data.blocks.map((block) => (
        <section key={block.className} className="print-break space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide">
            Academic performance · {block.className}
            {block.overall != null ? ` · cumulative ${block.overall}` : ""}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="text-[10px] uppercase text-muted">
                <tr>
                  <th className="py-2">Subject</th>
                  {TERMS.map((t) => (
                    <th key={t} colSpan={3} className="text-center">
                      {t.replace(" Term", "")}
                    </th>
                  ))}
                  <th>Cum</th>
                  <th>Grade</th>
                </tr>
                <tr>
                  <th />
                  {TERMS.map((t) => (
                    <Fragment key={t}>
                      <th>SBA 30%</th>
                      <th>Exam 70%</th>
                      <th>Tot</th>
                    </Fragment>
                  ))}
                  <th />
                  <th />
                </tr>
              </thead>
              <tbody>
                {block.subjects.map((line) => (
                  <tr key={line.subject} className="border-t border-line">
                    <td className="py-1.5 font-medium">{line.subject}</td>
                    {TERMS.map((t) => {
                      const c = line.terms[t as SchoolTerm];
                      return (
                        <Fragment key={t}>
                          <td>{cell(c.sba)}</td>
                          <td>{cell(c.exam)}</td>
                          <td>{cell(c.total)}</td>
                        </Fragment>
                      );
                    })}
                    <td>{cell(line.cumulative)}</td>
                    <td>
                      {line.grade}
                      {line.remark && line.remark !== line.grade ? (
                        <span className="block text-[10px] font-normal text-muted">{line.remark}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-navy/30 font-medium">
                  <td className="py-1.5">Term average</td>
                  {TERMS.map((t) => (
                    <td key={t} colSpan={3} className="text-center">
                      {cell(block.termAverage[t as SchoolTerm])}
                    </td>
                  ))}
                  <td>{cell(block.overall)}</td>
                  <td />
                </tr>
                <tr className="border-t border-line text-muted">
                  <td className="py-1.5">Attendance (Present / Late / Absent)</td>
                  {TERMS.map((t) => {
                    const a = block.attendance[t as SchoolTerm];
                    return (
                      <td key={t} colSpan={3} className="text-center">
                        {a.days ? `${a.present} / ${a.late} / ${a.absent}` : "—"}
                      </td>
                    );
                  })}
                  <td />
                  <td />
                </tr>
                <tr className="border-t border-line text-muted">
                  <td className="py-1.5">Position in class</td>
                  {TERMS.map((t) => (
                    <td key={t} colSpan={3} className="text-center">
                      {block.position[t as SchoolTerm]
                        ? `${block.position[t as SchoolTerm]} of ${block.classSize}`
                        : "—"}
                    </td>
                  ))}
                  <td />
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="grid gap-3 text-xs sm:grid-cols-3">
        <div className="rounded-[8px] border border-line p-3">
          <p className="font-semibold uppercase tracking-wide text-muted">JHS / BECE (1–9)</p>
          <p className="mt-1">1 Highest 80+ · 2 Higher 75 · 3 High 70 · 4 High average 65 · 5 Average 60 · 6 Low average 55 · 7 Low 50 · 8 Lower 40 · 9 Fail</p>
        </div>
        <div className="rounded-[8px] border border-line p-3">
          <p className="font-semibold uppercase tracking-wide text-muted">Primary remarks</p>
          <p className="mt-1">Excellent 80+ · Very Good 70 · Good 60 · Credit 50 · Pass 40 · Fail below 40</p>
        </div>
        <div className="rounded-[8px] border border-line p-3">
          <p className="font-semibold uppercase tracking-wide text-muted">KG / Nursery</p>
          <p className="mt-1">Exceeding 80+ · Proficient 60 · Developing 40 · Beginning below 40</p>
        </div>
      </section>

      {data.notes.length ? (
        <section className="text-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Conduct · attitude · interest · teacher remarks
          </h3>
          <ul className="mt-2 space-y-1">
            {data.notes.map((n) => (
              <li key={`${n.year_name}-${n.term}`}>
                {n.year_name} · {n.term}: conduct {n.conduct || "—"} · attitude {n.attitude || "—"} · interest{" "}
                {n.interest || "—"}
                {n.comment?.trim() ? ` · ${n.comment}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-sm text-muted">Conduct, attitude and interest will appear when the class teacher records them.</p>
      )}

      {data.promotions.length ? (
        <section className="text-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Promotion</h3>
          <ul className="mt-2 space-y-1">
            {data.promotions.map((p) => (
              <li key={`${p.year_name}-${p.from_class}`}>
                {p.year_name}: {p.from_class} → {p.to_class} ({p.decision})
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-sm text-muted">Promotion / repetition is stamped here at the end of the year.</p>
      )}

      <section className="grid gap-6 pt-4 text-sm sm:grid-cols-3">
        <p className="border-t border-navy/40 pt-2">
          Class teacher
          <span className="mt-6 block text-xs text-muted">Name / signature / date</span>
        </p>
        <p className="border-t border-navy/40 pt-2">
          Headteacher
          <span className="mt-6 block text-xs text-muted">Name / signature / date</span>
        </p>
        <p className="border-t border-navy/40 pt-2">
          Parent / guardian
          <span className="mt-6 block text-xs text-muted">Name / signature / date</span>
        </p>
      </section>
    </article>
  );
}
