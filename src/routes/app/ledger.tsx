import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { feeMethodTotals, listLedger } from "@/lib/school";
import { num } from "@/lib/ghana";
import { Card, Field, Input, Money } from "@/components/ui";

export const Route = createFileRoute("/app/ledger")({ component: LedgerPage });

function LedgerPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const totals = useQuery({ queryKey: ["fee-methods"], queryFn: () => feeMethodTotals() });
  const book = useQuery({
    queryKey: ["ledger", from, to],
    queryFn: () => listLedger({ data: { from, to } }),
  });
  const t = totals.data;
  const cards = [
    { label: "Cash — school fees", n: t?.cash ?? 0 },
    { label: "Mobile money — school fees", n: t?.mobile ?? 0 },
    { label: "Bank — school fees", n: t?.bank ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Account ledger</h1>
        <p className="mt-1 text-sm text-muted">Posted school-fee receipts, split by how the money was paid.</p>
      </div>
      {totals.isError ? <p className="text-sm text-bad">{(totals.error as Error).message}</p> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <p className="text-xs uppercase tracking-wide text-muted">{c.label}</p>
            <p className="mt-2 text-xl">
              <Money n={c.n} kind="in" />
            </p>
          </Card>
        ))}
      </div>
      <Card>
        <p className="text-xs uppercase tracking-wide text-muted">All three together</p>
        <p className="mt-2 text-xl">
          <Money n={(t?.cash ?? 0) + (t?.mobile ?? 0) + (t?.bank ?? 0)} kind="in" />
        </p>
      </Card>
      <Card title="Ledger lines" desc="Every account entry in the dates below.">
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        {book.isError ? <p className="text-sm text-bad">{(book.error as Error).message}</p> : null}
        {book.isLoading ? <p className="text-sm text-muted">Loading ledger…</p> : null}
        <ul className="divide-y divide-line">
          {(book.data ?? []).map((row) => (
            <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
              <span>
                <span className="font-mono text-xs text-muted">{row.entry_date}</span>
                <span className="ml-2">{row.account}</span>
                <span className="ml-2 text-muted">{row.memo || row.ref_type}</span>
              </span>
              <span className="font-mono">
                {num(row.debit) > 0 ? <Money n={num(row.debit)} kind="in" /> : <Money n={num(row.credit)} kind="out" />}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
