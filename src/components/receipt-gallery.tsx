import { Link } from "@tanstack/react-router";

const R = {
  no: "DIS-RCP-184029",
  bill: "DIS-BIL-0912",
  student: "Ama Mensah",
  id: "DISST014",
  className: "JHS 2",
  term: "1st Term · 2025/2026",
  amount: "GH₵ 500.00",
  method: "Mobile money",
  balance: "GH₵ 400.00",
  date: "3 Sep 2026 · 09:14",
  cashier: "Accountant",
  desc: "School fees — 1st Term",
};

function Crest({ className }: { className: string }) {
  return (
    <img
      src="/school-crest.jpg"
      alt=""
      aria-hidden
      className={`pointer-events-none absolute select-none object-cover ${className}`}
    />
  );
}

function PaidMark() {
  return (
    <div className="receipt-paid-mark" aria-hidden>
      <span>Paid</span>
    </div>
  );
}

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted">{k}</span>
      <span className={strong ? "font-semibold tabular-nums" : "font-medium tabular-nums"}>{v}</span>
    </div>
  );
}

function LookLabel({ n, title, note }: { n: string; title: string; note: string }) {
  return (
    <div className="mb-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink">{n}</p>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="text-sm text-ink/90">{note}</p>
    </div>
  );
}

function Look1() {
  return (
    <section>
      <LookLabel n="Look 1" title="Office slip" note="Crest sits in the middle of the paper, faded, so type stays readable." />
      <article className="relative mx-auto max-w-md overflow-hidden rounded-[16px] border border-line bg-surface p-6 shadow-[0_8px_28px_rgba(11,85,89,0.12)]">
        <Crest className="left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20" />
        <PaidMark />
        <div className="relative z-10">
          <header className="border-b border-line pb-4 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-navy">DIS ONLINE</p>
            <h3 className="mt-1 text-lg font-semibold uppercase tracking-wide text-navy">Doorbell International School</h3>
            <p className="text-sm text-muted">Christ is our light</p>
            <p className="mt-3 font-mono text-sm tracking-wide text-navy">{R.no}</p>
          </header>
          <p className="mt-4 text-center text-xs uppercase tracking-wide text-muted">{R.desc}</p>
          <p className="mt-1 text-center font-mono text-3xl font-semibold text-income">{R.amount}</p>
          <dl className="mt-5 space-y-2">
            <Line k="Student" v={`${R.student} · ${R.id}`} />
            <Line k="Class" v={R.className} />
            <Line k="Term" v={R.term} />
            <Line k="Method" v={R.method} />
            <Line k="Balance" v={R.balance} strong />
            <Line k="Issued" v={R.date} />
            <Line k="Cashier" v={R.cashier} />
          </dl>
          <p className="mt-6 text-center text-xs text-muted">Keep this slip. Quote the receipt number at the office.</p>
        </div>
      </article>
    </section>
  );
}

function Look2() {
  return (
    <section>
      <LookLabel n="Look 2" title="Formal A5 sheet" note="Large crest watermark behind the whole page — like a printed school receipt." />
      <article className="relative mx-auto max-w-xl overflow-hidden rounded-[4px] border border-navy/25 bg-surface px-8 py-8 shadow-[0_8px_28px_rgba(11,85,89,0.12)]">
        <Crest className="left-1/2 top-8 h-72 w-72 -translate-x-1/2 rounded-full opacity-[0.16]" />
        <PaidMark />
        <div className="relative z-10">
          <div className="flex items-start justify-between gap-4 border-b-2 border-navy pb-4">
            <div className="flex items-start gap-3">
              <img src="/school-crest.jpg" alt="" className="h-16 w-16 shrink-0 rounded-full border-2 border-navy/30 object-cover" />
              <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-navy">Official receipt</p>
              <h3 className="mt-1 text-xl font-semibold uppercase leading-tight text-navy">Doorbell International School</h3>
              <p className="mt-1 text-sm text-muted">Christ is our light · DC Road, Somanya, Eastern Region</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm text-navy">{R.no}</p>
              <p className="text-xs text-muted">{R.date}</p>
            </div>
          </div>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Received from</p>
              <p className="mt-1 text-lg font-semibold text-navy">{R.student}</p>
              <p className="text-sm">{R.id} · {R.className}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs uppercase tracking-wide text-muted">The sum of</p>
              <p className="mt-1 font-mono text-3xl font-semibold text-income">{R.amount}</p>
              <p className="text-sm text-muted">{R.method}</p>
            </div>
          </div>
          <p className="mt-6 border-y border-line py-3 text-sm">Being payment for <strong>{R.desc}</strong> · {R.term}</p>
          <div className="mt-4 flex justify-between text-sm">
            <span>Balance after this receipt</span>
            <span className="font-mono font-semibold text-expense">{R.balance}</span>
          </div>
          <div className="mt-10 flex justify-between text-xs text-muted">
            <span>Cashier: {R.cashier}</span>
            <span>Billing {R.bill}</span>
          </div>
        </div>
      </article>
    </section>
  );
}

function Look3() {
  return (
    <section>
      <LookLabel n="Look 3" title="Teal till ticket" note="Crest behind the amount band. Fast to read at the accountant desk." />
      <article className="relative mx-auto max-w-sm overflow-hidden rounded-[20px] border border-navy/20 bg-surface shadow-[0_8px_28px_rgba(11,85,89,0.14)]">
        <div className="relative bg-navy px-5 py-5 text-ink">
          <Crest className="right-[-12px] top-[-18px] h-32 w-32 rounded-full opacity-30" />
          <p className="relative z-10 text-[10px] font-semibold uppercase tracking-[0.22em] text-foam">DIS ONLINE receipt</p>
          <h3 className="relative z-10 mt-1 text-base font-semibold uppercase leading-snug">Doorbell International School</h3>
          <p className="relative z-10 mt-4 font-mono text-xs text-foam">{R.no}</p>
          <p className="relative z-10 mt-1 font-mono text-3xl font-semibold">{R.amount}</p>
          <p className="relative z-10 text-sm text-foam">{R.desc}</p>
        </div>
        <div className="relative p-5">
          <Crest className="bottom-3 right-3 h-24 w-24 rounded-full opacity-15" />
          <PaidMark />
          <dl className="relative z-10 space-y-2">
            <Line k="Student" v={R.student} />
            <Line k="ID" v={R.id} />
            <Line k="Class" v={R.className} />
            <Line k="Term" v={R.term} />
            <Line k="Method" v={R.method} />
            <Line k="Balance" v={R.balance} strong />
            <Line k="Cashier" v={R.cashier} />
          </dl>
          <p className="relative z-10 mt-5 text-center text-xs text-muted">Christ is our light</p>
        </div>
      </article>
    </section>
  );
}

function Look4() {
  return (
    <section>
      <LookLabel n="Look 4" title="Watermark paper" note="Crest repeated faintly across the whole slip — hard to photocopy cleanly." />
      <article className="relative mx-auto max-w-md overflow-hidden rounded-[12px] border border-line bg-surface p-6 shadow-[0_8px_28px_rgba(11,85,89,0.12)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: "url(/school-crest.jpg)",
            backgroundRepeat: "repeat",
            backgroundSize: "140px 140px",
          }}
          aria-hidden
        />
        <PaidMark />
        <div className="relative z-10">
          <header className="flex items-center gap-3 border-b border-navy/20 pb-3">
            <img src="/school-crest.jpg" alt="" className="h-12 w-12 rounded-full border border-navy/20 object-cover" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-navy">Accountant desk</p>
              <h3 className="text-sm font-semibold uppercase text-navy">Doorbell International School</h3>
            </div>
          </header>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs uppercase text-muted">Receipt</p>
              <p className="font-mono font-semibold text-navy">{R.no}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase text-muted">Date</p>
              <p>{R.date}</p>
            </div>
          </div>
          <p className="mt-4 text-sm">
            Received from <strong>{R.student}</strong> ({R.id}, {R.className})
          </p>
          <p className="mt-3 rounded-[8px] bg-bg px-3 py-3 text-center">
            <span className="block text-xs uppercase tracking-wide text-muted">Amount paid</span>
            <span className="font-mono text-3xl font-semibold text-income">{R.amount}</span>
          </p>
          <dl className="mt-4 space-y-2">
            <Line k="For" v={R.desc} />
            <Line k="Term" v={R.term} />
            <Line k="Method" v={R.method} />
            <Line k="Balance" v={R.balance} strong />
            <Line k="Cashier" v={R.cashier} />
          </dl>
          <p className="mt-6 text-center text-xs italic text-muted">Christ is our light</p>
        </div>
      </article>
    </section>
  );
}

export function ReceiptGallery({ signedIn }: { signedIn?: boolean }) {
  return (
    <div className="relative min-h-screen bg-navy text-fg">
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center opacity-25"
        style={{ backgroundImage: "url(/school-pattern.jpg)" }}
        aria-hidden
      />
      <header className="relative z-10 border-b border-ink/15 bg-navy/90 px-4 py-4 text-ink sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/school-crest.jpg" alt="" className="h-11 w-11 rounded-full border border-ink/30 object-cover" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-foam">Receipt preview · accountant</p>
              <p className="text-sm font-semibold uppercase tracking-wide">Doorbell International School</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/" className="inline-flex min-h-10 items-center rounded-[8px] border border-ink/30 px-3 text-sm text-ink">
              Prospectus
            </Link>
            {["1", "2", "3", "4"].map((n) => (
              <a key={n} href={`#rcp-${n}`} className="inline-flex min-h-10 items-center rounded-[8px] border border-ink/30 px-3 text-sm text-ink">
                Look {n}
              </a>
            ))}
            {signedIn ? (
              <Link to="/app" className="inline-flex min-h-10 items-center rounded-[8px] bg-surface px-3 text-sm text-navy">
                Live desk
              </Link>
            ) : (
              <Link to="/login" className="inline-flex min-h-10 items-center rounded-[8px] bg-surface px-3 text-sm text-navy">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="relative z-10 mx-auto max-w-6xl space-y-16 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold text-ink text-balance">Accountant receipts — four looks</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink/90 text-pretty">
            Same payment (Ama Mensah, GH₵ 500, receipt DIS-RCP-184029). The school crest is printed inside the receipt as a watermark. Preview only.
          </p>
        </div>
        <div id="rcp-1">
          <Look1 />
        </div>
        <div id="rcp-2">
          <Look2 />
        </div>
        <div id="rcp-3">
          <Look3 />
        </div>
        <div id="rcp-4">
          <Look4 />
        </div>
      </main>
    </div>
  );
}
