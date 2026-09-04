import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  Bus,
  ClipboardCheck,
  GraduationCap,
  Heart,
  MapPin,
  Printer,
  Users,
} from "lucide-react";
import { Button, UniformBackdrop, cn } from "@/components/ui";

const DEPARTMENTS = [
  {
    band: "Early years",
    ages: "Creche · Nursery 1 · Nursery 2",
    body: "Gentle start: writing, English, numeracy, and fun colouring. Care comes first; letters and numbers follow.",
  },
  {
    band: "Kindergarten",
    ages: "KG 1 · KG 2",
    body: "Phonics, literacy, numeracy, creative arts, writing, and French — the GES kindergarten path.",
  },
  {
    band: "Primary",
    ages: "Primary 1 to Primary 6",
    body: "English, Mathematics, Science, Our World Our People, History, RME, Computing, Ghanaian Language, French, and PE.",
  },
  {
    band: "Junior High",
    ages: "JHS 1 · JHS 2 · JHS 3",
    body: "BECE preparation: Integrated Science, Social Studies, Career Technology, Computing, Ghanaian Language, and French, with stanine grading.",
  },
];

const ADMISSION = [
  "Birth certificate",
  "Last school report, if transferring",
  "Passport photograph of the child",
  "Ghana NHIS number",
  "Parent or guardian name, phone, and email",
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

export function Prospectus({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="relative min-h-screen text-fg">
      <UniformBackdrop wash="bg-navy/55" />
      <div className="prospectus-toolbar print:hidden sticky top-0 z-30 border-b border-navy/20 bg-navy/92 text-ink backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-foam">School prospectus</p>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 border-ink/30 bg-navy-2 text-ink"
              onClick={() => window.print()}
            >
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
            <Link
              to={signedIn ? "/app" : "/login"}
              className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-ribbon px-4 text-sm font-medium text-ink"
            >
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
            className="pointer-events-none absolute -right-10 -top-10 h-64 w-64 rounded-full object-cover opacity-20"
          />
          <div className="relative">
            <img
              src="/school-crest.jpg"
              alt="Doorbell International School crest"
              className="h-24 w-24 rounded-full border-2 border-ink/40 object-cover"
            />
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.28em] text-foam">Private school · Accra, Ghana</p>
            <h1 className="mt-3 max-w-xl text-3xl font-semibold uppercase leading-tight tracking-wide text-ink text-balance sm:text-5xl">
              Doorbell International School
            </h1>
            <p className="mt-4 text-lg text-foam">Christ is our light</p>
            <p className="mt-8 max-w-lg border-t border-ink/20 pt-6 text-sm leading-relaxed text-ink">
              Prospectus · 2026/2027 academic year
            </p>
            <p className="mt-2 text-sm text-foam">Creche to JHS 3 · GES / NaCCA curriculum · Ghana Cedis</p>
            <div className="mt-8 flex flex-wrap gap-3 print:hidden">
              <Link
                to={signedIn ? "/app" : "/login"}
                className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-ribbon px-4 text-sm font-medium text-ink"
              >
                {signedIn ? "Open the office" : "Sign in to the office"}
              </Link>
            </div>
          </div>
        </header>

        <Sheet>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Welcome</p>
          <h2 className="mt-2 text-2xl font-semibold text-navy text-balance">A Christian private school in Accra</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-pretty">
            Doorbell International School is a private day school. We take children from Creche through Junior High
            School, follow the Ghana Education Service and NaCCA curriculum, and raise them in the light of Christ.
            Families meet the Accountant at the office to enroll. There is no walk-in public sign-up on the internet.
          </p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              { k: "Motto", v: "Christ is our light" },
              { k: "Calendar", v: "Three Ghana terms" },
              { k: "Money", v: "Fees in GH₵" },
            ].map((item) => (
              <li key={item.k} className="rounded-[var(--radius-md)] border border-line bg-bg px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-muted">{item.k}</p>
                <p className="mt-1 text-sm font-semibold text-navy">{item.v}</p>
              </li>
            ))}
          </ul>
        </Sheet>

        <Sheet>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Faith and character</p>
          <h2 className="mt-2 text-2xl font-semibold text-navy">What we stand for</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <figure className="rounded-[var(--radius-md)] border border-line bg-bg p-4">
              <Heart className="h-5 w-5 text-navy" aria-hidden />
              <figcaption className="mt-3 text-sm font-semibold text-navy">Motto</figcaption>
              <p className="mt-1 text-sm text-muted">Christ is our light — in assembly, in class, and in how we treat one another.</p>
            </figure>
            <figure className="rounded-[var(--radius-md)] border border-line bg-bg p-4">
              <GraduationCap className="h-5 w-5 text-navy" aria-hidden />
              <figcaption className="mt-3 text-sm font-semibold text-navy">Vision</figcaption>
              <p className="mt-1 text-sm text-muted">Pupils who know God, work hard, and can stand in Ghana and beyond.</p>
            </figure>
            <figure className="rounded-[var(--radius-md)] border border-line bg-bg p-4">
              <BookOpen className="h-5 w-5 text-navy" aria-hidden />
              <figcaption className="mt-3 text-sm font-semibold text-navy">Mission</figcaption>
              <p className="mt-1 text-sm text-muted">Teach the GES syllabus with order, kindness, and a clear report to every parent.</p>
            </figure>
          </div>
        </Sheet>

        <Sheet>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">The school</p>
          <h2 className="mt-2 text-2xl font-semibold text-navy">Four departments, one house</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-pretty">
            Classes are listed A–Z in the office. A child keeps one admission number from the day of enrollment.
          </p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {DEPARTMENTS.map((d) => (
              <li key={d.band} className="rounded-[var(--radius-md)] border border-line bg-bg p-4">
                <p className="text-sm font-semibold text-navy">{d.band}</p>
                <p className="mt-1 font-mono text-xs text-muted">{d.ages}</p>
                <p className="mt-2 text-sm text-muted">{d.body}</p>
              </li>
            ))}
          </ul>
        </Sheet>

        <Sheet>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Academic life</p>
          <h2 className="mt-2 text-2xl font-semibold text-navy">GES standard, term by term</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-pretty">
            The year runs on the Ghana calendar: 1st Term September–December, 2nd Term January–April, 3rd Term
            May–August. Class work (SBA) is 30%. The end-of-term exam is 70%. Every child receives a GES cumulative
            record on enrollment; it stays on the academic file through promote.
          </p>
          <dl className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              { t: "Kindergarten", d: "Beginning · Developing · Proficient · Exceeding" },
              { t: "Primary", d: "Excellent · Very good · Good · Credit · Pass · Fail" },
              { t: "Junior High", d: "BECE stanine 1 to 9" },
            ].map((g) => (
              <div key={g.t} className="rounded-[var(--radius-md)] border border-line bg-bg p-4">
                <dt className="text-sm font-semibold text-navy">{g.t}</dt>
                <dd className="mt-1 text-sm text-muted">{g.d}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 flex items-start gap-2 text-sm text-muted">
            <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-navy" aria-hidden />
            Homework, timetable, attendance, and report cards are issued from the office and shown on the parent desk.
          </p>
        </Sheet>

        <Sheet>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Admission</p>
          <h2 className="mt-2 text-2xl font-semibold text-navy">How a family joins DIS</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-pretty">
            Come to the office with the child. Super Admin or the Accountant enrolls the family in person, issues an
            admission number, and opens the GES card. A parent login is given for DIS ONLINE — results, fees, and
            notices for your wards only.
          </p>
          <ol className="mt-6 grid gap-3 sm:grid-cols-2">
            {ADMISSION.map((item, i) => (
              <li key={item} className="flex gap-3 rounded-[var(--radius-md)] border border-line bg-bg p-4 text-sm">
                <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </Sheet>

        <Sheet>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">School life</p>
          <h2 className="mt-2 text-2xl font-semibold text-navy">The day, the home, the till</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {[
              {
                icon: Users,
                t: "Uniform and order",
                d: "Full school uniform. Assembly. Teachers mark present, late, or absent each morning.",
              },
              {
                icon: Bus,
                t: "Feeding and bus",
                d: "Optional. Paid at the till in GH₵, recorded against the child, and shown on the parent desk.",
              },
              {
                icon: BookOpen,
                t: "Books and stationery",
                d: "Class lists (including Primary textbooks and stationery) are issued by the office. Amounts are Ghana Cedis.",
              },
              {
                icon: Heart,
                t: "PTA and notices",
                d: "The Accountant or Super Admin sends school notices. Parents see them on their desk the same day.",
              },
            ].map((s) => (
              <li key={s.t} className="flex gap-3 rounded-[var(--radius-md)] border border-line bg-bg p-4">
                <s.icon className="mt-0.5 h-5 w-5 shrink-0 text-navy" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-navy">{s.t}</p>
                  <p className="mt-1 text-sm text-muted">{s.d}</p>
                </div>
              </li>
            ))}
          </ul>
        </Sheet>

        <Sheet>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Fees</p>
          <h2 className="mt-2 text-2xl font-semibold text-navy">Ghana Cedis, three terms, a receipt every time</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-pretty">
            Tuition is billed by class and by term. The office prints a receipt number for every payment. Outstanding
            balances appear on the parent desk. Ask the Accountant for this year’s figures — they are not published
            on this page so the printed prospectus does not go stale.
          </p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-3">
            {["Tuition by class", "Books and stationery", "Bus and feeding"].map((item) => (
              <li key={item} className="rounded-[var(--radius-md)] border border-line bg-bg px-4 py-3 text-sm font-medium text-navy">
                {item}
              </li>
            ))}
          </ul>
        </Sheet>

        <Sheet className="bg-navy text-ink">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foam">Visit us</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">Christ is our light</h2>
          <p className="mt-3 flex items-start gap-2 text-sm text-foam">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Accra, Ghana · info@dis.edu.gh
          </p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-foam">
            Enroll at the office. After enrollment, sign in to DIS ONLINE with the email the Accountant issued.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 print:hidden">
            <Link
              to={signedIn ? "/app" : "/login"}
              className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-ribbon px-4 text-sm font-medium text-ink"
            >
              {signedIn ? "Open the office" : "Parent / staff sign in"}
            </Link>
            <Link
              to="/online"
              className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-ink/30 px-4 text-sm font-medium text-ink"
            >
              DIS ONLINE guide
            </Link>
          </div>
        </Sheet>
      </main>
    </div>
  );
}
