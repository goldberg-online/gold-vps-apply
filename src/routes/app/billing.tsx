import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  closeTerm,
  deleteBilling,
  getMe,
  listBillings,
  listStudents,
  listTermSettlements,
} from "@/lib/school";
import { allocateFeeType, createFeeType, deleteFeeType, listFeeTypes } from "@/lib/fee-types";
import { GHANA_CLASS_LEVELS, TERMS, formatGhs, num, sortAlpha } from "@/lib/ghana";
import { Button, Card, Field, Input, Money, Select } from "@/components/ui";
import { StudentTypeahead } from "@/components/student-typeahead";

export const Route = createFileRoute("/app/billing")({ component: BillingPage });

function BillingPage() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMe() });
  const isSuper = me.data?.me.role === "SUPER_ADMIN";
  const students = useQuery({ queryKey: ["students"], queryFn: () => listStudents() });
  const types = useQuery({ queryKey: ["fee-types"], queryFn: () => listFeeTypes() });
  const bills = useQuery({ queryKey: ["bills"], queryFn: () => listBillings() });
  const closed = useQuery({ queryKey: ["terms"], queryFn: () => listTermSettlements() });

  const [typeName, setTypeName] = useState("Tuition");
  const [typeTerm, setTypeTerm] = useState("1st Term");
  const [typeAmount, setTypeAmount] = useState("");
  const [typeClass, setTypeClass] = useState("");

  const [feeTypeId, setFeeTypeId] = useState("");
  const [scope, setScope] = useState<"class" | "school" | "students">("class");
  const [allocClass, setAllocClass] = useState("Primary 1");
  const [picked, setPicked] = useState<string[]>([]);
  const [pickOne, setPickOne] = useState("");

  const [openBill, setOpenBill] = useState<string | null>(null);
  const [openClass, setOpenClass] = useState<string | null>(null);
  const [closeTermName, setCloseTermName] = useState("1st Term");

  const saveType = useMutation({
    mutationFn: () =>
      createFeeType({
        data: {
          name: typeName,
          term: typeTerm,
          amount: parseFloat(typeAmount),
          className: typeClass || undefined,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fee-types"] });
      setTypeAmount("");
    },
  });
  const alloc = useMutation({
    mutationFn: () =>
      allocateFeeType({
        data: {
          feeTypeId,
          wholeSchool: scope === "school",
          className: scope === "class" ? allocClass : undefined,
          studentIds: scope === "students" ? picked : undefined,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["dash"] });
      setPicked([]);
    },
  });
  const closeMut = useMutation({
    mutationFn: () => closeTerm({ data: { term: closeTermName } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["terms"] });
      qc.invalidateQueries({ queryKey: ["dash"] });
    },
  });

  const chosen = (students.data ?? []).filter((s) => picked.includes(s.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Billing</h1>
        <p className="text-sm text-muted">
          Create fee types first (Tuition, PTA, Exam…). Then allocate a type to a class, the whole school, or named
          students.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="1. Billing types" desc="Different charges for the term. Not attached to a child yet.">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              saveType.mutate();
            }}
          >
            <Field label="Type name">
              <Input value={typeName} onChange={(e) => setTypeName(e.target.value)} required placeholder="Tuition, PTA levy, Exam fee…" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Term">
                <Select value={typeTerm} onChange={(e) => setTypeTerm(e.target.value)}>
                  {TERMS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Amount (GH₵)">
                <Input type="number" min="0.01" step="0.01" value={typeAmount} onChange={(e) => setTypeAmount(e.target.value)} required />
              </Field>
            </div>
            <Field label="Default class (optional)">
              <Select value={typeClass} onChange={(e) => setTypeClass(e.target.value)}>
                <option value="">Any class</option>
                {GHANA_CLASS_LEVELS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            {saveType.isError ? <p className="text-sm text-bad">{(saveType.error as Error).message}</p> : null}
            <Button className="w-full" disabled={saveType.isPending}>
              Save billing type
            </Button>
          </form>
          <ul className="mt-4 space-y-2 text-sm">
            {(types.data ?? []).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 border-b border-line py-2">
                <span>
                  <span className="font-medium">{t.name}</span>
                  <span className="block text-xs text-muted">
                    {t.term} · <Money n={num(t.amount)} kind="out" />
                    {t.class_name ? ` · ${t.class_name}` : " · all classes"}
                  </span>
                </span>
                <button
                  type="button"
                  className="text-xs text-bad underline"
                  onClick={() => {
                    if (confirm(`Remove type ${t.name}? Already-issued bills stay.`)) {
                      deleteFeeType({ data: { id: t.id } }).then(() =>
                        qc.invalidateQueries({ queryKey: ["fee-types"] }),
                      );
                    }
                  }}
                >
                  Drop
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="2. Allocate to students" desc="Pick a type, then a class, the whole school, or names.">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              alloc.mutate();
            }}
          >
            <Field label="Billing type">
              <Select value={feeTypeId} onChange={(e) => setFeeTypeId(e.target.value)} required>
                <option value="">Select a type</option>
                {(types.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.term} · <Money n={num(t.amount)} kind="out" />
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Allocate to">
              <Select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
                <option value="class">A whole class</option>
                <option value="school">Every enrolled student</option>
                <option value="students">Named students</option>
              </Select>
            </Field>
            {scope === "class" ? (
              <Field label="Class">
                <Select value={allocClass} onChange={(e) => setAllocClass(e.target.value)}>
                  {[...GHANA_CLASS_LEVELS].sort(sortAlpha).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
            ) : null}
            {scope === "students" ? (
              <div className="space-y-2">
                <StudentTypeahead
                  students={(students.data ?? []).filter((s) => !picked.includes(s.id))}
                  value={pickOne}
                  onChange={(id) => {
                    if (id && !picked.includes(id)) setPicked([...picked, id]);
                    setPickOne("");
                  }}
                  label="Add student (type name)"
                />
                <ul className="flex flex-wrap gap-2">
                  {chosen.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="rounded-full border border-navy/20 bg-surface px-3 py-1 text-xs text-navy"
                        onClick={() => setPicked(picked.filter((x) => x !== s.id))}
                      >
                        {s.first_name} {s.last_name} ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {alloc.isError ? <p className="text-sm text-bad">{(alloc.error as Error).message}</p> : null}
            {alloc.isSuccess ? (
              <p className="text-sm text-good">
                {alloc.data.name}: billed {alloc.data.created} student(s)
                {alloc.data.skipped ? ` · ${alloc.data.skipped} already had this type` : ""}.
              </p>
            ) : null}
            <Button className="w-full" disabled={alloc.isPending || !feeTypeId}>
              {alloc.isPending ? "Allocating…" : "Allocate this billing"}
            </Button>
          </form>
        </Card>
      </div>

      <Card title="Close term" desc="Totals only this term. Unpaid fees go to the next term.">
        <form
          className="max-w-md space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (confirm(`Close ${closeTermName} and carry unpaid balances to the next term?`)) {
              closeMut.mutate();
            }
          }}
        >
          <Field label="Term to close">
            <Select value={closeTermName} onChange={(e) => setCloseTermName(e.target.value)}>
              {TERMS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          {closeMut.isError ? <p className="text-sm text-bad">{(closeMut.error as Error).message}</p> : null}
          {closeMut.isSuccess ? (
            <p className="text-sm text-good">
              Closed. Outstanding <Money n={closeMut.data.outstanding} kind="out" />. Carried{" "}
              <Money n={closeMut.data.carried} kind="out" /> into{" "}
              {closeMut.data.next}.
            </p>
          ) : null}
          <Button type="submit" variant="ghost" disabled={closeMut.isPending}>
            {closeMut.isPending ? "Closing…" : "Close term & forward debts"}
          </Button>
        </form>
        {(closed.data ?? []).length ? (
          <ul className="mt-4 space-y-2 text-sm">
            {(closed.data ?? []).map((t) => (
              <li key={t.id} className="rounded-[8px] border border-line px-3 py-2">
                {t.term} → {t.next_term} · billed <Money n={num(t.billed)} kind="out" /> · collected{" "}
                <Money n={num(t.collected)} kind="in" /> · expense <Money n={num(t.expenses)} kind="out" /> ·
                outstanding <Money n={num(t.outstanding)} kind="out" />
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card title="Issued bills by class" desc="Open a class, then a bill name. Issued and paid show on each name. A–Z.">
        {(() => {
          const rows = bills.data ?? [];
          if (rows.length === 0) return <p className="text-sm text-muted">No bills issued yet.</p>;
          const classes = [...new Set(rows.map((b) => b.class_name || "Unassigned"))].sort(sortAlpha);
          return (
            <ul className="space-y-2">
              {classes.map((cls) => {
                const classRows = rows.filter((b) => (b.class_name || "Unassigned") === cls);
                const billNames = [...new Set(classRows.map((b) => `${b.description} · ${b.term}`))].sort(sortAlpha);
                const openC = openClass === cls;
                return (
                  <li key={cls} className="rounded-[12px] border border-line">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                      onClick={() => {
                        setOpenClass(openC ? null : cls);
                        setOpenBill(null);
                      }}
                    >
                      <span>
                        <span className="font-semibold text-navy">{cls}</span>
                        <span className="block text-xs text-muted">
                          {billNames.length} bill{billNames.length === 1 ? "" : "s"} · {classRows.length} student charge{classRows.length === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="text-navy">{openC ? "▴" : "▾"}</span>
                    </button>
                    {openC ? (
                      <ul className="border-t border-line bg-bg/60 px-2 py-2">
                        {billNames.map((billKey) => {
                          const kids = classRows
                            .filter((b) => `${b.description} · ${b.term}` === billKey)
                            .slice()
                            .sort((a, b) => sortAlpha(a.student, b.student));
                          const openB = openBill === `${cls}::${billKey}`;
                          return (
                            <li key={billKey} className="mb-1 rounded-[10px] bg-surface">
                              <button
                                type="button"
                                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
                                onClick={() => setOpenBill(openB ? null : `${cls}::${billKey}`)}
                              >
                                <span className="font-medium">{billKey}</span>
                                <span className="text-xs text-muted">{kids.length} · {openB ? "hide" : "show names"}</span>
                              </button>
                              {openB ? (
                                <ul className="space-y-1 border-t border-line px-3 py-2 text-sm">
                                  {kids.map((b) => (
                                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                                      <span>
                                        {b.student}
                                        <span className="ml-2 font-mono text-xs text-muted">{b.admission_no}</span>
                                      </span>
                                      <span className="flex flex-wrap items-center gap-3">
                                        <span>
                                          issued <Money n={num(b.total)} kind="out" />
                                          <span className="text-muted"> · </span>
                                          paid <Money n={num(b.paid)} kind="in" />
                                          <span className="text-muted"> · bal </span>
                                          <Money n={Math.max(0, num(b.total) - num(b.paid))} kind="out" />
                                        </span>
                                        {isSuper ? (
                                          <button
                                            type="button"
                                            className="text-xs text-bad underline"
                                            onClick={() => {
                                              if (confirm("Permanently delete this billing and its payments?")) {
                                                deleteBilling({ data: { id: b.id } })
                                                  .then(() => {
                                                    qc.invalidateQueries({ queryKey: ["bills"] });
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
                    ) : null}
                  </li>
                );
              })}
            </ul>
          );
        })()}
      </Card>
    </div>
  );
}
