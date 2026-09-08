import type { ReactNode } from "react";
import { Money, cn } from "@/components/ui";

export type OfficialReceiptData = {
  receiptNo: string;
  issued: string;
  student: string;
  admissionNo: string;
  className: string;
  amount: number;
  method: string;
  description: string;
  term: string;
  balance: number;
  cashier: string;
  footer: string;
  status?: string | null;
  voidReason?: string | null;
};

function PaidMark({ cancelled }: { cancelled: boolean }) {
  return (
    <div className="receipt-paid-mark" aria-hidden>
      <span className={cancelled ? "is-void" : undefined}>{cancelled ? "Void" : "Paid"}</span>
    </div>
  );
}

export function OfficialReceipt({
  data,
  children,
}: {
  data: OfficialReceiptData;
  children?: ReactNode;
}) {
  const cancelled = Boolean(data.status && data.status !== "POSTED");
  return (
    <article
      className={cn(
        "receipt-sheet relative overflow-hidden rounded-[4px] border border-navy/25 bg-surface px-6 py-8 shadow-[0_8px_28px_rgba(11,85,89,0.12)] sm:px-8",
        "print:border-navy/40 print:shadow-none",
      )}
    >
      <img
        src="/school-crest.jpg"
        alt=""
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-10 h-72 w-72 -translate-x-1/2 select-none rounded-full object-cover opacity-[0.14] print:opacity-20"
      />
      <PaidMark cancelled={cancelled} />
      <div className="relative z-10">
        <div className="flex flex-col gap-4 border-b-2 border-navy pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <img
              src="/school-crest.jpg"
              alt="Doorbell International School crest"
              className="h-14 w-14 shrink-0 rounded-full border-2 border-navy/30 object-cover sm:h-16 sm:w-16"
            />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-navy">Official receipt</p>
              <h1 className="mt-1 text-lg font-semibold uppercase leading-tight text-navy sm:text-xl">
                Doorbell International School
              </h1>
              <p className="mt-1 text-sm text-muted">Christ is our light · Accra, Ghana</p>
            </div>
          </div>
          <div className="sm:text-right">
            <p className="font-mono text-sm text-navy">{data.receiptNo}</p>
            <p className="text-xs text-muted">{data.issued}</p>
          </div>
        </div>
        {cancelled ? (
          <p className="mt-4 text-center text-lg font-medium uppercase tracking-widest text-expense">{data.status}</p>
        ) : null}
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Received from</p>
            <p className="mt-1 text-lg font-semibold text-navy">{data.student}</p>
            <p className="text-sm">
              {data.admissionNo} · {data.className}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs uppercase tracking-wide text-muted">The sum of</p>
            <p className="mt-1 text-3xl font-semibold">
              <Money n={data.amount} kind="in" className="text-3xl" />
            </p>
            <p className="text-sm text-muted">{data.method.replace(/_/g, " ")}</p>
          </div>
        </div>
        <p className="mt-6 border-y border-line py-3 text-sm">
          Being payment for <strong>{data.description}</strong>
          {data.term ? ` · ${data.term}` : ""}
        </p>
        <div className="mt-4 flex justify-between text-sm">
          <span>Balance after this receipt</span>
          <Money n={data.balance} kind="out" />
        </div>
        {data.voidReason ? <p className="mt-3 text-sm text-expense">Reason: {data.voidReason}</p> : null}
        <div className="mt-10 flex justify-between text-xs text-muted">
          <span>Cashier: {data.cashier}</span>
          <span>{data.footer}</span>
        </div>
        {children}
      </div>
    </article>
  );
}
