import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { cancelReceipt, listBillings, listPayments, recordPayment, sendPaymentSms } from "@/lib/school";
import { formatGhs, num, sortAlpha } from "@/lib/ghana";
import { Button, Card, Field, Input, Money, Select } from "@/components/ui";

export const Route = createFileRoute("/app/payments")({ component: PaymentsPage });

function PaymentsPage() {
  const qc = useQueryClient();
  const bills = useQuery({ queryKey: ["bills"], queryFn: () => listBillings() });
  const pays = useQuery({ queryKey: ["pays"], queryFn: () => listPayments() });
  const open = (bills.data ?? []).filter((b) => num(b.total) - num(b.paid) > 0.001);
  const [classFilter, setClassFilter] = useState("");
  const [billingId, setBillingId] = useState("");
  const [billQ, setBillQ] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [last, setLast] = useState<{ id: string; receiptNo: string } | null>(null);
  const [smsNote, setSmsNote] = useState<string | null>(null);
  const [openRcptClass, setOpenRcptClass] = useState<string | null>(null);
  const [openRcptBill, setOpenRcptBill] = useState<string | null>(null);

  const classes = useMemo(() => {
    return [...new Set(open.map((b) => b.class_name || "Unassigned"))].sort(sortAlpha);
  }, [open]);

  const filtered = useMemo(() => {
    const q = billQ.trim().toLowerCase();
    return open
      .filter((b) => (classFilter ? (b.class_name || "Unassigned") === classFilter : true))
      .filter((b) => {
        if (!q) return true;
        return `${b.student} ${b.invoice_no} ${b.description} ${b.class_name}`.toLowerCase().includes(q);
      })
      .slice()
      .sort((a, b) => sortAlpha(a.class_name || "", b.class_name || "") || sortAlpha(a.student, b.student));
  }, [open, classFilter, billQ]);

  const groupedBills = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const b of filtered) {
      const k = b.class_name || "Unassigned";
      const list = map.get(k) ?? [];
      list.push(b);
      map.set(k, list);
    }
    return [...map.entries()].sort((a, b) => sortAlpha(a[0], b[0]));
  }, [filtered]);

  const selected = open.find((b) => b.id === billingId);
  const mut = useMutation({
    mutationFn: () =>
      recordPayment({
        data: { billingId, amount: parseFloat(amount), method },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["pays"] });
      qc.invalidateQueries({ queryKey: ["dash"] });
      qc.invalidateQueries({ queryKey: ["ledger"] });
      setLast({ id: res.id, receiptNo: res.receiptNo });
      setSmsNote(null);
      setAmount("");
    },
  });
  const sms = useMutation({
    mutationFn: (id: string) => sendPaymentSms({ data: { id } }),
    onSuccess: (res) => {
      setSmsNote(res.mocked ? "SMS logged (no Bulk SMS key yet)." : "SMS sent to the parent phone.");
    },
    onError: (e) => setSmsNote((e as Error).message),
  });

  function cancel(id: string, action: "VOID" | "REFUND") {
    const reason = prompt(
      action === "REFUND"
        ? "Refund — money returned to parent. Reason (required):"
        : "Void — receipt was a mistake. Reason (required):",
    );
    if (!reason || reason.trim().length < 3) return;
    cancelReceipt({ data: { id, action, reason: reason.trim() } })
      .then(() => {
        qc.invalidateQueries({ queryKey: ["pays"] });
        qc.invalidateQueries({ queryKey: ["bills"] });
        qc.invalidateQueries({ queryKey: ["dash"] });
        qc.invalidateQueries({ queryKey: ["ledger"] });
      })
      .catch((e) => alert((e as Error).message));
  }

  const receiptGroups = useMemo(() => {
    const rows = pays.data ?? [];
    const byClass = new Map<string, typeof rows>();
    for (const p of rows) {
      const k = p.class_name || "Unassigned";
      const list = byClass.get(k) ?? [];
      list.push(p);
      byClass.set(k, list);
    }
    return [...byClass.entries()]
      .sort((a, b) => sortAlpha(a[0], b[0]))
      .map(([cls, list]) => {
        const byBill = new Map<string, typeof list>();
        for (const p of list) {
          const bill = `${p.description || "Fee"} · ${p.term || ""}`.trim();
          const inner = byBill.get(bill) ?? [];
          inner.push(p);
          byBill.set(bill, inner);
        }
        return {
          cls,
          bills: [...byBill.entries()]
            .sort((a, b) => sortAlpha(a[0], b[0]))
            .map(([bill, items]) => ({
              bill,
              items: items.slice().sort((a, b) => sortAlpha(a.student, b.student)),
            })),
        };
      });
  }, [pays.data]);

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <Card title="Record payment" desc="Pick a class, then a bill. Names are A–Z inside each class.">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <Field label="Class">
            <Select
              value={classFilter}
              onChange={(e) => {
                setClassFilter(e.target.value);
                setBillingId("");
              }}
            >
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Find student">
            <Input
              value={billQ}
              onChange={(e) => setBillQ(e.target.value)}
              placeholder="Type the enrolled name"
            />
          </Field>
          <Field label="Open billing (by class)">
            <Select value={billingId} onChange={(e) => setBillingId(e.target.value)} required>
              <option value="">Select</option>
              {groupedBills.map(([cls, list]) => (
                <optgroup key={cls} label={cls}>
                  {list.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.student} · {b.description} · bal {formatGhs(num(b.total) - num(b.paid))}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
          <Field label="Amount (GH₵)">
            <Input
              type="number"
              min="0.01"
              step="0.01"
              max={selected ? num(selected.total) - num(selected.paid) : undefined}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </Field>
          <Field label="Method">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="CASH">Cash</option>
              <option value="MOBILE_MONEY">Mobile Money</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
            </Select>
          </Field>
          {mut.isError ? <p className="text-sm text-bad">{(mut.error as Error).message}</p> : null}
          <Button className="w-full" disabled={mut.isPending || open.length === 0}>
            Save payment
          </Button>
        </form>
        {last ? (
          <div className="mt-4 space-y-2 rounded-[12px] border border-gold/30 bg-bg p-3">
            <p className="text-sm">
              Receipt <span className="font-mono">{last.receiptNo}</span> saved. Choose:
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={sms.isPending} onClick={() => sms.mutate(last.id)}>
                {sms.isPending ? "Sending…" : "Send SMS"}
              </Button>
              <Link
                to="/app/receipt/$id"
                params={{ id: last.id }}
                className="inline-flex min-h-11 items-center rounded-[8px] border border-line bg-surface px-4 text-sm"
              >
                Print receipt
              </Link>
            </div>
            {smsNote ? <p className="text-sm text-muted">{smsNote}</p> : null}
          </div>
        ) : null}
      </Card>
      <Card title="Receipts by class" desc="Open a class, then a bill name. Students A–Z.">
        {receiptGroups.length === 0 ? (
          <p className="text-sm text-muted">No receipts yet.</p>
        ) : (
          <ul className="space-y-2">
            {receiptGroups.map((g) => {
              const openC = openRcptClass === g.cls;
              return (
                <li key={g.cls} className="rounded-[12px] border border-line">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                    onClick={() => {
                      setOpenRcptClass(openC ? null : g.cls);
                      setOpenRcptBill(null);
                    }}
                  >
                    <span className="font-semibold text-navy">{g.cls}</span>
                    <span className="text-xs text-muted">{g.bills.reduce((n, b) => n + b.items.length, 0)} receipts</span>
                  </button>
                  {openC ? (
                    <ul className="border-t border-line bg-bg/60 p-2">
                      {g.bills.map((bill) => {
                        const key = `${g.cls}::${bill.bill}`;
                        const openB = openRcptBill === key;
                        return (
                          <li key={bill.bill} className="mb-1 rounded-[10px] bg-surface">
                            <button
                              type="button"
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
                              onClick={() => setOpenRcptBill(openB ? null : key)}
                            >
                              <span className="font-medium">{bill.bill}</span>
                              <span className="text-navy">{openB ? "▴" : "▾"}</span>
                            </button>
                            {openB ? (
                              <ul className="space-y-2 border-t border-line px-3 py-2 text-sm">
                                {bill.items.map((p) => {
                                  const live = !p.status || p.status === "POSTED";
                                  return (
                                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                                      <span>
                                        {p.student}
                                        <span className="ml-2 font-mono text-xs text-muted">{p.receipt_no}</span>
                                        {live ? null : (
                                          <span className="ml-2 text-[10px] uppercase text-bad">{p.status}</span>
                                        )}
                                      </span>
                                      <span className="flex items-center gap-3">
                                        <Money n={num(p.amount)} kind="in" />
                                        <Link className="text-navy underline" to="/app/receipt/$id" params={{ id: p.id }}>
                                          Print
                                        </Link>
                                        {live ? (
                                          <>
                                            <button type="button" className="text-xs underline" onClick={() => cancel(p.id, "VOID")}>
                                              Void
                                            </button>
                                            <button type="button" className="text-xs text-bad underline" onClick={() => cancel(p.id, "REFUND")}>
                                              Refund
                                            </button>
                                          </>
                                        ) : null}
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
