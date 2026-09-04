import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  Bus,
  ClipboardCheck,
  GraduationCap,
  Megaphone,
  Printer,
  Shield,
  Users,
  Wallet,
} from "lucide-react";
import { Button, UniformBackdrop, cn } from "@/components/ui";

const ROLES = [
  { title: "Super Admin", body: "Full office. Issues logins, corrects student records, reads every desk." },
  { title: "Accountant", body: "Enrolls families, bills by class, collects fees, posts announcements." },
  { title: "School Admin", body: "Academic only: subjects, timetable, homework, marks, promote. No fees." },
  { title: "Teacher", body: "Own class: attendance, marks, homework. Students listed A–Z by class." },
  { title: "Service Officer", body: "Bus and feeding till. No academic or tuition desk." },
  { title: "Parent / student", body: "Only their wards: results, GES card, fees, receipts, notices." },
];

const PILLARS = [
  {
    icon: Users,
    title: "Families",
    body: "One record for child and parent. Classes sit A–Z. A GES cumulative card opens the day the child is enrolled.",
  },
  {
    icon: GraduationCap,
    title: "GES academic",
    body: "SBA 30% and exam 70%. JHS uses BECE stanine 1–9. Primary uses Excellent to Fail. KG uses Beginning to Exceeding.",
  },
  {
    icon: Wallet,
    title: "Accounts in GH₵",
    body: "Bills headed by bill name, grouped under the class. Payments, receipts, ledger, salaries, bus and feeding.",
  },
  {
    icon: Megaphone,
    title: "Notices",
    body: "Accountant and Super Admin send to everyone, parents, or staff. Every desk shows an announcements column.",
  },
  {
    icon: Shield,
    title: "Issued logins",
    body: "No public sign-up. Idle lock: Accountant 10 minutes, others 5. Super Admin holds the audit trail.",
  },
  {
    icon: Bus,
    title: "Services",
    body: "Bus and feeding collected at the till, tied to the student, visible on the parent desk with fee receipts.",
  },
];

function Sheet({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "print-sheet print-break rounded-[var(--radius-xl)] border border-line bg-surface p-6 shadow-[0_8px_28px_rgba(11,85,89,0.12)] sm:p-8",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SystemProspectus({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="relative min-h-screen text-fg">
      <UniformBackdrop wash="bg-navy/55" />
      <div className="prospectus-toolbar print:hidden sticky top-0 z-30 border-b border-navy/20 bg-navy/92 text-ink backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-foam">DIS ONLINE prospectus</p>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="ghost" className="min-h-11 border-ink/30 bg-navy-2 text-ink" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
            <Link to={signedIn ? "/app" : "/login"} className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-ribbon px-4 text-sm font-medium text-ink">
              {signedIn ? "Open office" : "Sign in"}
            </Link>
          </div>
        </div>
      </div>

      <main className="relative z-10 mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
        <header className="prospectus-cover print-break relative overflow-hidden rounded-[var(--radius-xl)] border border-ink/15 bg-navy px-6 py-12 text-ink sm:px-12 sm:py-16">
          <img
            src="/school-crest.jpg"
            alt=""
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-8 h-56 w-56 rounded-full object-cover opacity-20"
          />
          <div className="relative">
            <img
              src="/school-crest.jpg"
              alt="Doorbell International School crest"
              className="h-20 w-20 rounded-full border-2 border-ink/40 object-cover"
            />
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.28em] text-foam">DIS ONLINE</p>
            <h1 className="mt-3 max-w-xl text-3xl font-semibold uppercase leading-tight tracking-wide text-ink sm:text-4xl">
              Doorbell International School
            </h1>
            <p className="mt-3 text-base text-foam">Christ is our light</p>
            <p className="mt-8 max-w-lg border-t border-ink/20 pt-6 text-sm leading-relaxed text-ink">
              School management prospectus · 2026/2027 academic year · Ghana Cedis (GH₵)
            </p>
            <p className="mt-2 text-sm text-foam">Issued logins only. One office for families, GES records, and accounts.</p>
          </div>
        </header>

        <Sheet>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">This system</p>
          <h2 className="mt-2 text-2xl font-semibold text-navy">The school office, on one desk</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed">
            DIS ONLINE is built for Doorbell International School. Super Admin and the Accountant issue every login.
            There is no public create-account page. Parents see only their own children. Teachers see only the classes
            assigned to them. School Admin runs academics, not fees. Money is Ghana Cedis throughout.
          </p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-3">
            {["Creche to JHS 3", "GES cumulative on enroll", "Bills grouped by class"].map((item) => (
              <li key={item} className="rounded-[var(--radius-md)] border border-line bg-bg px-4 py-3 text-sm font-medium text-navy">
                {item}
              </li>
            ))}
          </ul>
        </Sheet>

        <Sheet>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Six desks</p>
          <h2 className="mt-2 text-2xl font-semibold text-navy">Who signs in, and what they may do</h2>
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            {ROLES.map((r) => (
              <div key={r.title} className="rounded-[var(--radius-md)] border border-line bg-bg p-4">
                <dt className="text-sm font-semibold text-navy">{r.title}</dt>
                <dd className="mt-1 text-sm text-muted">{r.body}</dd>
              </div>
            ))}
          </dl>
        </Sheet>

        <Sheet>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">What the office holds</p>
          <h2 className="mt-2 text-2xl font-semibold text-navy">Families, GES, accounts, notices</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {PILLARS.map((p) => (
              <li key={p.title} className="flex gap-3 rounded-[var(--radius-md)] border border-line bg-bg p-4">
                <p.icon className="mt-0.5 h-5 w-5 shrink-0 text-navy" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-navy">{p.title}</p>
                  <p className="mt-1 text-sm text-muted">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </Sheet>

        <Sheet>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Academic record</p>
          <h2 className="mt-2 text-2xl font-semibold text-navy">GES standard, attached at enrollment</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed">
            Every student receives a cumulative record the moment they are enrolled. Super Admin and Accountant may
            correct name, class, admission number, parent contacts, and status. School Admin and teachers enter marks
            and attendance. The parent desk opens the same GES card.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <figure className="rounded-[var(--radius-md)] border border-line bg-bg p-4">
              <ClipboardCheck className="h-5 w-5 text-navy" aria-hidden />
              <figcaption className="mt-3 text-sm font-semibold text-navy">Term mix</figcaption>
              <p className="mt-1 text-sm text-muted">Class work (SBA) 30%. End-of-term exam 70%.</p>
            </figure>
            <figure className="rounded-[var(--radius-md)] border border-line bg-bg p-4">
              <GraduationCap className="h-5 w-5 text-navy" aria-hidden />
              <figcaption className="mt-3 text-sm font-semibold text-navy">JHS · Primary · KG</figcaption>
              <p className="mt-1 text-sm text-muted">Stanine 1–9 · Excellent–Fail · Beginning–Exceeding.</p>
            </figure>
            <figure className="rounded-[var(--radius-md)] border border-line bg-bg p-4">
              <BookOpen className="h-5 w-5 text-navy" aria-hidden />
              <figcaption className="mt-3 text-sm font-semibold text-navy">Class work</figcaption>
              <p className="mt-1 text-sm text-muted">Timetable, homework, report cards, promote at year end.</p>
            </figure>
          </div>
        </Sheet>

        <Sheet>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">A day at DIS</p>
          <h2 className="mt-2 text-2xl font-semibold text-navy">How the office actually runs</h2>
          <ol className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              { n: "01", t: "Enroll", d: "Accountant or Super Admin saves the child and parent. Admission number DISST is issued. The GES card opens." },
              { n: "02", t: "Teach", d: "Teacher marks present, late, or absent, and enters SBA and exam scores on the assigned class." },
              { n: "03", t: "Collect", d: "Fees, bus, and feeding are taken in GH₵. A receipt number is printed for the parent." },
              { n: "04", t: "Inform", d: "A notice is sent to parents or staff. The parent desk shows results, outstanding fees, and the GES card." },
            ].map((s) => (
              <li key={s.n} className="rounded-[var(--radius-md)] border border-line bg-bg p-4">
                <p className="font-mono text-xs text-muted">{s.n}</p>
                <p className="mt-1 text-sm font-semibold text-navy">{s.t}</p>
                <p className="mt-1 text-sm text-muted">{s.d}</p>
              </li>
            ))}
          </ol>
        </Sheet>

        <Sheet className="bg-navy text-ink">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foam">Doorbell International School</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">Christ is our light</h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-foam">
            Sign in with the email the office issued. Ask Super Admin or the Accountant if you need a login.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 print:hidden">
            <Link
              to={signedIn ? "/app" : "/login"}
              className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-ribbon px-4 text-sm font-medium text-ink"
            >
              {signedIn ? "Open the office" : "Sign in to DIS ONLINE"}
            </Link>
            <Link
              to="/"
              className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-ink/30 px-4 text-sm font-medium text-ink"
            >
              School prospectus
            </Link>
            <Link
              to="/looks"
              className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-ink/30 px-4 text-sm font-medium text-ink"
            >
              Sample receipts
            </Link>
          </div>
        </Sheet>
      </main>
    </div>
  );
}
