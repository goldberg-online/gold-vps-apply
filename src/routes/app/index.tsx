import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, GraduationCap, Wallet } from "lucide-react";
import { getDashboard, getMe, getParentDesk } from "@/lib/school";
import { getCumulativeRecord } from "@/lib/academic-ops";
import { num } from "@/lib/ghana";
import { Card, Money } from "@/components/ui";
import { CumulativeRecordSheet } from "@/components/cumulative-record";
import { AnnouncementFeed } from "@/components/announcement-feed";

export const Route = createFileRoute("/app/")({ component: Overview });

function Overview() {
  const q = useQuery({ queryKey: ["dash"], queryFn: () => getDashboard() });
  if (q.isLoading) return <p className="text-sm text-muted">Loading desk…</p>;
  if (q.error) return <p className="text-sm text-bad">{(q.error as Error).message}</p>;
  const d = q.data!;
  if (d.me.role === "PARENT") return <ParentDesk />;
  const role = d.me.role;
  const finance = role === "SUPER_ADMIN" || role === "ACCOUNTANT";
  const admin = role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN";
  const maxClass = Math.max(1, ...d.classCounts.map((c) => c.n));
  const attTotal = d.attendance.present + d.attendance.absent + d.attendance.late;
  const people: { label: string; value: string; href: "/app/students" | "/app/staff" | "/app/attendance" | "/app/services" | "/app/timetable" | "/app/homework" }[] = [];
  if (role !== "SERVICE_OFFICER") {
    people.push({ label: "Students on roll", value: String(d.students), href: "/app/students" });
  }
  if (role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN" || role === "ACCOUNTANT") {
    people.push({ label: "Staff logins", value: String(d.staff), href: "/app/staff" });
  }
  if (role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN" || role === "TEACHER") {
    people.push({
      label: "Present today",
      value: String(d.attendance.present),
      href: "/app/attendance",
    });
  }
  if (role === "TEACHER" || role === "SCHOOL_ADMIN") {
    people.push({ label: "Timetable", value: d.term, href: "/app/timetable" });
    people.push({ label: "Homework", value: "Open", href: "/app/homework" });
  }
  if (role === "SERVICE_OFFICER" || role === "SUPER_ADMIN" || role === "ACCOUNTANT") {
    people.push({ label: "Bus & feeding", value: "Till", href: "/app/services" });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Overview</h1>
        <p className="mt-1 text-sm text-ink">
          {d.students} students · {d.staff} staff · {d.term}
          {finance ? " · GH₵" : ""}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {people.map((c) => (
          <Link key={c.label} to={c.href} className="block">
            <Card>
              <p className="text-xs uppercase tracking-wide text-muted">{c.label}</p>
              <p className="mt-2 font-mono text-xl tabular-nums text-navy">{c.value}</p>
            </Card>
          </Link>
        ))}
        {finance
          ? [
              { label: `${d.term} collected`, n: d.termCollected, kind: "in" as const, href: "/app/payments" as const },
              { label: `${d.term} outstanding`, n: d.termOutstanding, kind: "out" as const, href: "/app/billing" as const },
              { label: "All fees collected", n: d.collected, kind: "in" as const, href: "/app/payments" as const },
              { label: "All outstanding", n: d.outstanding, kind: "out" as const, href: "/app/billing" as const },
              { label: "This week in", n: d.weekIn, kind: "in" as const, href: "/app/ledger" as const },
              { label: "This week out", n: d.weekOut, kind: "out" as const, href: "/app/expenses" as const },
              { label: "Bus", n: d.bus, kind: "in" as const, href: "/app/services" as const },
              { label: "Feeding", n: d.feeding, kind: "in" as const, href: "/app/services" as const },
            ].map((c) => (
              <Link key={c.label} to={c.href} className="block">
                <Card>
                  <p className="text-xs uppercase tracking-wide text-muted">{c.label}</p>
                  <p className="mt-2 text-xl">
                    <Money n={c.n} kind={c.kind} />
                  </p>
                </Card>
              </Link>
            ))
          : null}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Headcount by class" desc="Live roll from enrollment.">
          {d.classCounts.length === 0 ? (
            <p className="text-sm text-muted">No students enrolled yet.</p>
          ) : (
            <ul className="space-y-2">
              {d.classCounts.map((c) => (
                <li key={c.className} className="text-sm">
                  <div className="mb-1 flex justify-between gap-2">
                    <span>{c.className}</span>
                    <span className="font-mono text-muted">{c.n}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-bg">
                    <div className="h-full bg-gold" style={{ width: `${(c.n / maxClass) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Attendance today" desc={d.attendance.day}>
          {attTotal === 0 ? (
            <p className="text-sm text-muted">No marks yet today.</p>
          ) : (
            <dl className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-[12px] bg-bg p-3">
                <dt className="text-xs text-muted">Present</dt>
                <dd className="mt-1 font-mono text-lg text-good">{d.attendance.present}</dd>
              </div>
              <div className="rounded-[12px] bg-bg p-3">
                <dt className="text-xs text-muted">Late</dt>
                <dd className="mt-1 font-mono text-lg">{d.attendance.late}</dd>
              </div>
              <div className="rounded-[12px] bg-bg p-3">
                <dt className="text-xs text-muted">Absent</dt>
                <dd className="mt-1 font-mono text-lg text-bad">{d.attendance.absent}</dd>
              </div>
            </dl>
          )}
        </Card>
        <AnnouncementFeed limit={5} compose />
      </div>
      {d.recent.length > 0 && role !== "SCHOOL_ADMIN" ? (
        <Card title="Latest activity" desc={admin ? "Full trail is on Audit." : "Your finance desk."}>
          <ul className="space-y-2 text-sm">
            {d.recent.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 border-b border-line py-2">
                <span>
                  <span className="font-medium">{r.action}</span>
                  <span className="block text-xs text-muted">
                    {r.actor_email} · {r.summary}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs text-muted">
                  {r.created_at.slice(0, 16).replace("T", " ")}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function grade(n: number) {
  if (n >= 80) return "A";
  if (n >= 70) return "B";
  if (n >= 60) return "C";
  if (n >= 50) return "D";
  return "E";
}

function gh(n: number) {
  return `GH₵ ${n.toLocaleString("en-GH", { minimumFractionDigits: 2 })}`;
}

function downloadWardPdf(opts: {
  name: string;
  admission: string;
  className: string;
  marks: { subject: string; term: string; assessment_type: string; score: string }[];
  billed: number;
  paid: number;
  feeding: number;
  bus: number;
  receipts: { receipt_no: string; description: string; amount: string; paid_at: string }[];
}) {
  const scores = opts.marks.map((m) => num(m.score));
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const rows = opts.marks
    .map(
      (m) =>
        `<tr><td>${m.subject}</td><td>${m.term}${m.assessment_type ? " · " + m.assessment_type : ""}</td><td class="right">${num(m.score)}</td><td class="right">${grade(num(m.score))}</td></tr>`,
    )
    .join("");
  const rec = opts.receipts
    .map(
      (r) =>
        `<tr><td>${r.receipt_no}</td><td>${r.description}</td><td>${r.paid_at.slice(0, 10)}</td><td class="right">${gh(num(r.amount))}</td></tr>`,
    )
    .join("");
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${opts.name} report</title><meta charset="utf-8"/>
<style>body{font-family:Segoe UI,sans-serif;color:#0f3d40;margin:32px;max-width:720px}h1{font-size:18px;text-transform:uppercase}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #c5e4e4;padding:8px 6px;text-align:left}th{font-size:11px;text-transform:uppercase;color:#4a7578}.right{text-align:right}.good{color:#157a45}.bad{color:#b42318}.muted{color:#4a7578}</style></head><body>
<p class="muted">DIS ONLINE · Doorbell International School</p>
<h1>Term report</h1>
<p><strong>${opts.name}</strong> · ${opts.admission} · ${opts.className}</p>
<table><thead><tr><th>Subject</th><th>Assessment</th><th class="right">Score</th><th class="right">Grade</th></tr></thead>
<tbody>${rows || "<tr><td colspan='4'>No marks yet</td></tr>"}
${scores.length ? `<tr><td colspan="2"><strong>Average</strong></td><td class="right"><strong>${avg}</strong></td><td class="right"><strong>${grade(avg)}</strong></td></tr>` : ""}</tbody></table>
<h2>Fees</h2>
<p>Billed ${gh(opts.billed)} · Paid <span class="good">${gh(opts.paid)}</span> · Outstanding <span class="bad">${gh(Math.max(0, opts.billed - opts.paid))}</span></p>
<p>Feeding ${gh(opts.feeding)} · Bus ${gh(opts.bus)}</p>
<table><thead><tr><th>Receipt</th><th>What was paid</th><th>Date</th><th class="right">Amount</th></tr></thead>
<tbody>${rec || "<tr><td colspan='4'>No receipts yet</td></tr>"}</tbody></table>
<p class="muted">Christ is our light</p>
</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

function ParentGesCard({ studentId }: { studentId: string }) {
  const rec = useQuery({
    queryKey: ["cumulative", studentId],
    queryFn: () => getCumulativeRecord({ data: { studentId } }),
  });
  if (rec.isLoading) return <p className="text-sm text-muted">Opening GES card…</p>;
  if (rec.isError) return <p className="text-sm text-bad">{(rec.error as Error).message}</p>;
  if (!rec.data) return null;
  return <CumulativeRecordSheet data={rec.data} />;
}

function ParentDesk() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMe() });
  const q = useQuery({ queryKey: ["parent-desk"], queryFn: () => getParentDesk() });
  if (q.isLoading) return <p className="text-sm text-ink">Loading your children…</p>;
  if (q.error) return <p className="text-sm text-bad">{(q.error as Error).message}</p>;
  const kids = q.data?.kids ?? [];
  const marks = q.data?.marks ?? [];
  const receipts = q.data?.receipts ?? [];
  const services = q.data?.services ?? [];
  const studentLogin = me.data?.me.kind === "student";
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{studentLogin ? "Your record" : "Your children"}</h1>
        <p className="mt-1 text-sm text-ink">
          {studentLogin
            ? "Results and fees for this student only."
            : "Results and fees for your wards only. This is a parent login, not a staff account."}
        </p>
        <p className="mt-2 text-sm">
          <Link to="/app/timetable" className="text-ink underline">
            Timetable
          </Link>
          <span className="mx-2 text-ink/70">·</span>
          <Link to="/app/homework" className="text-ink underline">
            Homework
          </Link>
          <span className="mx-2 text-ink/70">·</span>
          <Link to="/app/announcements" className="text-ink underline">
            Announcements
          </Link>
          <span className="mx-2 text-ink/70">·</span>
          <Link to="/app/cumulative" className="text-ink underline">
            GES cumulative
          </Link>
        </p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="order-1 lg:order-2 lg:sticky lg:top-24">
          <AnnouncementFeed limit={8} title="Announcements" />
        </div>
        <div className="order-2 space-y-6 lg:order-1">
      {kids.length === 0 ? (
        <Card title="No children linked">
          <p className="text-sm text-muted">Ask the accountant to enroll with this parent email so the records appear here.</p>
        </Card>
      ) : (
        kids.map((k) => {
          const billed = num(k.billed);
          const paid = num(k.paid);
          const outstanding = Math.max(0, billed - paid);
          const kidMarks = marks.filter((m) => m.student_id === k.id);
          const kidPay = receipts.filter((r) => r.student_id === k.id);
          const kidSvc = services.filter((s) => s.student_id === k.id);
          const scores = kidMarks.map((m) => num(m.score));
          const average = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
          const name = `${k.first_name} ${k.last_name}`;
          return (
            <div key={k.id} className="overflow-hidden rounded-[16px] border border-line bg-surface shadow-[0_8px_28px_rgba(11,85,89,0.12)]">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-navy px-5 py-4 text-ink">
                <div className="flex items-center gap-3">
                  {k.photo_url ? (
                    <img src={k.photo_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                  ) : null}
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-foam">Your ward</p>
                    <p className="text-xl font-semibold">{name}</p>
                    <p className="text-sm text-foam">
                      {k.admission_no} · {k.class_name} · Present {k.present} · Absent {k.absent}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-surface px-4 text-sm font-medium text-navy"
                  onClick={() =>
                    downloadWardPdf({
                      name,
                      admission: k.admission_no,
                      className: k.class_name,
                      marks: kidMarks,
                      billed,
                      paid,
                      feeding: num(k.feeding),
                      bus: num(k.bus),
                      receipts: kidPay,
                    })
                  }
                >
                  <Download className="h-4 w-4" />
                  Download report PDF
                </button>
              </div>
              <div className="grid gap-0 lg:grid-cols-2">
                <div className="border-b border-line p-5 lg:border-b-0 lg:border-r">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-navy">
                    <GraduationCap className="h-4 w-4" /> Results
                  </p>
                  {kidMarks.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">No marks entered yet.</p>
                  ) : (
                    <>
                      <p className="mt-2 text-3xl font-semibold tabular-nums text-navy">
                        {average}
                        <span className="ml-2 text-base font-medium text-muted">average · {grade(average)}</span>
                      </p>
                      <ul className="mt-4 space-y-2">
                        {kidMarks.map((m) => (
                          <li key={`${m.subject}-${m.term}-${m.assessment_type}`} className="flex justify-between gap-3 text-sm">
                            <span>
                              {m.subject}
                              <span className="block text-xs text-muted">
                                {m.term}
                                {m.assessment_type ? ` · ${m.assessment_type}` : ""}
                              </span>
                            </span>
                            <span className="font-mono tabular-nums">
                              {num(m.score)} · {grade(num(m.score))}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
                <div className="p-5">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-navy">
                    <Wallet className="h-4 w-4" /> Fees
                  </p>
                  <p className="mt-2 text-sm">
                    Paid <Money n={paid} kind="in" />
                    <span className="text-muted"> of {gh(billed)}</span>
                  </p>
                  <p className="text-sm">
                    Still owing <Money n={outstanding} kind="out" />
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Feeding <Money n={num(k.feeding)} kind="in" /> · Bus <Money n={num(k.bus)} kind="in" />
                  </p>
                  <p className="mt-4 text-xs uppercase tracking-wide text-muted">Receipts</p>
                  {kidPay.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">No fee receipts yet.</p>
                  ) : (
                    <ul className="mt-2 space-y-2 text-sm">
                      {kidPay.map((r) => (
                        <li key={r.id} className="flex justify-between gap-2">
                          <span>
                            <Link to="/app/receipt/$id" params={{ id: r.id }} className="font-mono text-navy underline">
                              {r.receipt_no}
                            </Link>
                            <span className="block text-xs text-muted">
                              {r.description} · {r.paid_at.slice(0, 10)}
                            </span>
                          </span>
                          <Money n={num(r.amount)} kind="in" />
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-4 text-xs uppercase tracking-wide text-muted">Bus & feeding paid</p>
                  {kidSvc.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">None yet.</p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm">
                      {kidSvc.slice(0, 8).map((s) => (
                        <li key={s.id} className="flex justify-between gap-2">
                          <span>
                            <Link to="/app/receipt/$id" params={{ id: s.id }} className="font-mono text-navy underline">
                              {s.receipt_no}
                            </Link>
                            <span className="block text-xs text-muted">
                              {s.kind === "BUS" ? "Bus" : "Feeding"} · {s.collected_at.slice(0, 10)}
                            </span>
                          </span>
                          <Money n={num(s.amount)} kind="in" />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <div className="border-t border-line p-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-navy">
                  GES cumulative record
                </p>
                <ParentGesCard studentId={k.id} />
              </div>
            </div>
          );
        })
      )}
        </div>
      </div>
    </div>
  );
}
