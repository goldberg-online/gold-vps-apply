import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { collectService, deleteService, getMe, listServices, listStudents } from "@/lib/school";
import { num, sortAlpha } from "@/lib/ghana";
import { Button, Card, Field, Input, Money, Select } from "@/components/ui";
import { StudentTypeahead } from "@/components/student-typeahead";

export const Route = createFileRoute("/app/services")({ component: ServicesPage });

function ServicesPage() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMe() });
  const isSuper = me.data?.me.role === "SUPER_ADMIN";
  const students = useQuery({ queryKey: ["students"], queryFn: () => listStudents() });
  const list = useQuery({ queryKey: ["svc"], queryFn: () => listServices() });
  const [studentId, setStudentId] = useState("");
  const [kind, setKind] = useState<"BUS" | "FEEDING" | "BOTH">("FEEDING");
  const [amount, setAmount] = useState("");
  const [feedingAmount, setFeedingAmount] = useState("");
  const [busAmount, setBusAmount] = useState("");
  const [printKind, setPrintKind] = useState<"ALL" | "FEEDING" | "BUS">("ALL");
  const [last, setLast] = useState<{ id: string; receiptNo: string; kind: string }[] | null>(null);
  const groups = useMemo(() => {
    const rows = (list.data ?? []).filter((r) => (printKind === "ALL" ? true : r.kind === printKind));
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = r.class_name || "Unassigned";
      const inner = map.get(k) ?? [];
      inner.push(r);
      map.set(k, inner);
    }
    return [...map.entries()]
      .sort((a, b) => sortAlpha(a[0], b[0]))
      .map(([cls, items]) => ({
        cls,
        items: items.slice().sort((a, b) => sortAlpha(a.student || "", b.student || "")),
      }));
  }, [list.data, printKind]);
  const [openCls, setOpenCls] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: async () => {
      const sid = studentId || undefined;
      if (kind === "BOTH") {
        return collectService({
          data: {
            kind: "BOTH",
            studentId: sid,
            feedingAmount: parseFloat(feedingAmount),
            busAmount: parseFloat(busAmount),
          },
        });
      }
      return collectService({
        data: { kind, studentId: sid, amount: parseFloat(amount) },
      });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["svc"] });
      qc.invalidateQueries({ queryKey: ["dash"] });
      setAmount("");
      setFeedingAmount("");
      setBusAmount("");
      setLast(res.receipts ?? []);
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <Card title="Bus & feeding collection" desc="Type a name. Collecting issues a numbered receipt you can print.">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value as "BUS" | "FEEDING" | "BOTH")}>
              <option value="FEEDING">Feeding only</option>
              <option value="BUS">Bus only</option>
              <option value="BOTH">Feeding & bus</option>
            </Select>
          </Field>
          <StudentTypeahead
            students={students.data ?? []}
            value={studentId}
            onChange={setStudentId}
            label="Student (type name)"
          />
          {kind === "BOTH" ? (
            <>
              <Field label="Feeding amount (GH₵)">
                <Input type="number" min="0.01" step="0.01" value={feedingAmount} onChange={(e) => setFeedingAmount(e.target.value)} required />
              </Field>
              <Field label="Bus amount (GH₵)">
                <Input type="number" min="0.01" step="0.01" value={busAmount} onChange={(e) => setBusAmount(e.target.value)} required />
              </Field>
            </>
          ) : (
            <Field label="Amount (GH₵)">
              <Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </Field>
          )}
          {mut.isError ? <p className="text-sm text-bad">{(mut.error as Error).message}</p> : null}
          <Button className="w-full" disabled={mut.isPending}>
            Collect and issue receipt
          </Button>
        </form>
        {last && last.length > 0 ? (
          <div className="mt-4 space-y-2 rounded-[12px] border border-gold/30 bg-bg p-3">
            <p className="text-sm font-medium text-navy">Print this receipt</p>
            <p className="text-sm text-muted">Crest and PAID mark are on the paper.</p>
            <div className="flex flex-col gap-2">
              {last.map((r) => (
                <Link
                  key={r.id}
                  to="/app/receipt/$id"
                  params={{ id: r.id }}
                  search={{ print: true }}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] bg-ribbon px-4 text-sm font-medium text-ink"
                >
                  <Printer className="h-4 w-4" />
                  Print {r.kind === "BUS" ? "bus" : "feeding"} receipt
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </Card>
      <Card title="Print feeding & bus receipts" desc="Choose feeding or bus, open a class, then Print.">
        <Field label="Receipts to print">
          <Select value={printKind} onChange={(e) => setPrintKind(e.target.value as "ALL" | "FEEDING" | "BUS")}>
            <option value="ALL">All receipts</option>
            <option value="FEEDING">Feeding receipts only</option>
            <option value="BUS">Bus receipts only</option>
          </Select>
        </Field>
        {groups.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No collections yet for this option.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {groups.map((g) => {
              const open = openCls === g.cls;
              return (
                <li key={g.cls} className="rounded-[12px] border border-line">
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center justify-between px-3 py-3 text-left"
                    onClick={() => setOpenCls(open ? null : g.cls)}
                  >
                    <span className="font-semibold text-navy">{g.cls}</span>
                    <span className="text-xs text-muted">{g.items.length}</span>
                  </button>
                  {open ? (
                    <ul className="border-t border-line px-3 py-2">
                      {g.items.map((r) => (
                        <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3 last:border-0">
                          <span>
                            {r.kind === "BUS" ? "Bus" : "Feeding"} · {r.student || "Unassigned"}
                            <span className="mt-0.5 block font-mono text-xs text-muted">{r.receipt_no}</span>
                            <span className="mt-0.5 block text-xs text-muted">
                              Entered by {r.recorded_name || "staff"}
                            </span>
                          </span>
                          <span className="flex flex-wrap items-center gap-2">
                            <Money n={num(r.amount)} kind="in" />
                            <Link
                              to="/app/receipt/$id"
                              params={{ id: r.id }}
                              search={{ print: true }}
                              className="inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-line bg-surface px-3 text-sm text-navy"
                            >
                              <Printer className="h-4 w-4" />
                              Print {r.kind === "BUS" ? "bus" : "feeding"}
                            </Link>
                            {isSuper ? (
                              <button
                                type="button"
                                className="text-xs text-bad underline"
                                onClick={() => {
                                  if (confirm("Permanently delete this collection?")) {
                                    deleteService({ data: { id: r.id } })
                                      .then(() => {
                                        qc.invalidateQueries({ queryKey: ["svc"] });
                                        qc.invalidateQueries({ queryKey: ["dash"] });
                                      })
                                      .catch((e) => alert((e as Error).message));
                                  }
                                }}
                              >
                                Delete
                              </button>
                            ) : null}
                          </span>
                        </li>
                      ))}
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
