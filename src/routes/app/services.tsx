import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Printer, UserPlus } from "lucide-react";
import {
  collectService,
  deleteService,
  dropFromService,
  enrollOnService,
  getMe,
  listServiceRoster,
  listServices,
  listStudents,
  updateServiceTick,
  voidServiceTick,
} from "@/lib/school";
import {
  formatDayShort,
  mondayOf,
  num,
  shiftMonday,
  sortAlpha,
  sortClass,
  termWeekNo,
  WEEKDAY_SHORT,
} from "@/lib/ghana";
import { Button, Card, Field, Input, Money, Select, cn } from "@/components/ui";
import { StudentTypeahead } from "@/components/student-typeahead";

export const Route = createFileRoute("/app/services")({ component: ServicesPage });

function tickLabel(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

type PaidCell = { id: string; amount: number; receiptNo: string };
type RosterPupil = {
  studentId: string;
  name: string;
  onFeeding: boolean;
  onBus: boolean;
  feedingRate: number;
  busRate: number;
  feeding: Record<string, PaidCell>;
  bus: Record<string, PaidCell>;
};

function ServicesPage() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMe() });
  const isSuper = me.data?.me.role === "SUPER_ADMIN";
  const students = useQuery({ queryKey: ["students"], queryFn: () => listStudents() });
  const [monday, setMonday] = useState(() => mondayOf());
  const [filter, setFilter] = useState<"ALL" | "FEEDING" | "BUS">("ALL");
  const [openCls, setOpenCls] = useState<Record<string, boolean>>({});
  const [studentId, setStudentId] = useState("");
  const [onFeeding, setOnFeeding] = useState(true);
  const [onBus, setOnBus] = useState(false);
  const [feedingRate, setFeedingRate] = useState("10");
  const [busRate, setBusRate] = useState("8");
  const [tickAmount, setTickAmount] = useState("");
  const [printKind, setPrintKind] = useState<"ALL" | "FEEDING" | "BUS">("ALL");
  const [openRcpt, setOpenRcpt] = useState<string | null>(null);
  const [last, setLast] = useState<{ id: string; receiptNo: string; kind: string }[] | null>(null);
  const [pending, setPending] = useState<Record<string, true>>({});
  const [edit, setEdit] = useState<{
    studentId: string;
    name: string;
    kind: "FEEDING" | "BUS";
    day: string;
    paid: PaidCell;
    rate: number;
  } | null>(null);
  const [editAmt, setEditAmt] = useState("");

  const roster = useQuery({
    queryKey: ["svc-roster", monday],
    queryFn: () => listServiceRoster({ data: { monday } }),
    staleTime: 20_000,
    placeholderData: (prev) => prev,
  });
  const list = useQuery({
    queryKey: ["svc"],
    queryFn: () => listServices(),
    staleTime: 60_000,
  });

  const weekNo = termWeekNo(monday);
  const days = roster.data?.days ?? [];
  const today = new Date().toISOString().slice(0, 10);

  const groups = useMemo(() => {
    return (roster.data?.groups ?? [])
      .map((g) => ({
        ...g,
        students: g.students.filter((s) => {
          if (filter === "FEEDING") return s.onFeeding;
          if (filter === "BUS") return s.onBus;
          return true;
        }),
      }))
      .filter((g) => g.students.length > 0);
  }, [roster.data, filter]);

  const receiptGroups = useMemo(() => {
    const rows = (list.data ?? []).filter((r) => (printKind === "ALL" ? true : r.kind === printKind));
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = r.class_name || "Unassigned";
      const inner = map.get(k) ?? [];
      inner.push(r);
      map.set(k, inner);
    }
    return [...map.entries()]
      .sort((a, b) => sortClass(a[0], b[0]) || sortAlpha(a[0], b[0]))
      .map(([cls, items]) => ({
        cls,
        items: items.slice().sort((a, b) => sortAlpha(a.student || "", b.student || "")),
      }));
  }, [list.data, printKind]);

  const addMut = useMutation({
    mutationFn: () =>
      enrollOnService({
        data: {
          studentId,
          onFeeding,
          onBus,
          feedingRate: onFeeding ? parseFloat(feedingRate) || 0 : 0,
          busRate: onBus ? parseFloat(busRate) || 0 : 0,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["svc-roster"] });
      setStudentId("");
    },
  });

  function cellKey(studentId: string, kind: string, day: string) {
    return `${studentId}|${kind}|${day}`;
  }

  function patchRosterCell(
    studentId: string,
    kind: "FEEDING" | "BUS",
    day: string,
    cell: PaidCell | null,
  ) {
    qc.setQueryData(["svc-roster", monday], (old: typeof roster.data) => {
      if (!old) return old;
      return {
        ...old,
        groups: old.groups.map((g) => ({
          ...g,
          students: g.students.map((s) => {
            if (s.studentId !== studentId) return s;
            const bag = { ...(kind === "FEEDING" ? s.feeding : s.bus) };
            if (cell) bag[day] = cell;
            else delete bag[day];
            return kind === "FEEDING" ? { ...s, feeding: bag } : { ...s, bus: bag };
          }),
        })),
      };
    });
  }

  function patchRosterRates(
    studentId: string,
    feedingRate: number,
    busRate: number,
    onFeeding: boolean,
    onBus: boolean,
  ) {
    qc.setQueryData(["svc-roster", monday], (old: typeof roster.data) => {
      if (!old) return old;
      return {
        ...old,
        groups: old.groups.map((g) => ({
          ...g,
          students: g.students.map((s) =>
            s.studentId === studentId ? { ...s, feedingRate, busRate, onFeeding, onBus } : s,
          ),
        })),
      };
    });
  }

  async function collectCell(studentId: string, kind: "FEEDING" | "BUS", day: string, rate: number) {
    const typed = parseFloat(tickAmount);
    const amount = Number.isFinite(typed) && typed > 0 ? typed : rate;
    if (!amount || amount <= 0) {
      alert("Set this pupil’s daily rate when you put them on the list, or type an amount in “Tick with amount”.");
      return;
    }
    const k = cellKey(studentId, kind, day);
    if (pending[k]) return;
    setPending((p) => ({ ...p, [k]: true }));
    const temp: PaidCell = { id: `pending:${k}`, amount, receiptNo: "…" };
    patchRosterCell(studentId, kind, day, temp);
    try {
      const res = await collectService({
        data: {
          kind,
          studentId,
          amount,
          collectedOn: day,
          silent: true,
          skipEnroll: true,
        },
      });
      const r = res.receipts?.[0];
      if (r) {
        patchRosterCell(studentId, kind, day, { id: r.id, amount, receiptNo: r.receiptNo });
        setLast(res.receipts);
      }
    } catch (e) {
      patchRosterCell(studentId, kind, day, null);
      alert((e as Error).message);
    } finally {
      setPending((p) => {
        const n = { ...p };
        delete n[k];
        return n;
      });
    }
  }

  function openPaid(
    studentId: string,
    name: string,
    kind: "FEEDING" | "BUS",
    day: string,
    paid: PaidCell,
    rate: number,
  ) {
    const typed = parseFloat(tickAmount);
    if (Number.isFinite(typed) && typed > 0 && Math.abs(typed - paid.amount) >= 0.009) {
      void savePaidAmount(studentId, kind, day, paid, typed);
      return;
    }
    setEdit({ studentId, name, kind, day, paid, rate });
    setEditAmt(tickLabel(paid.amount) || String(paid.amount));
  }

  async function savePaidAmount(
    studentId: string,
    kind: "FEEDING" | "BUS",
    day: string,
    paid: PaidCell,
    amount: number,
  ) {
    if (paid.id.startsWith("pending:")) return;
    const prev = paid;
    patchRosterCell(studentId, kind, day, { ...paid, amount });
    try {
      const res = await updateServiceTick({ data: { id: paid.id, amount } });
      patchRosterCell(studentId, kind, day, {
        id: res.id,
        amount: res.amount,
        receiptNo: res.receiptNo,
      });
    } catch (e) {
      patchRosterCell(studentId, kind, day, prev);
      alert((e as Error).message);
    }
  }

  async function clearPaid(studentId: string, kind: "FEEDING" | "BUS", day: string, paid: PaidCell) {
    if (paid.id.startsWith("pending:")) return;
    const prev = paid;
    patchRosterCell(studentId, kind, day, null);
    try {
      await voidServiceTick({ data: { id: paid.id } });
    } catch (e) {
      patchRosterCell(studentId, kind, day, prev);
      alert((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl">Bus & feeding</h1>
          <p className="text-sm text-muted">
            Only pupils put on feeding or bus appear here. Tap a box to tick. Tap a tick to change or clear it.
          </p>
        </div>
        <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print this week’s list
        </Button>
      </div>

      <div className="flex flex-col-reverse gap-6 xl:grid xl:grid-cols-[300px_1fr]">
        <div className="no-print space-y-6">
          <Card
            title="Put a pupil on the list"
            desc="Must already be enrolled in school. Tick feeding, bus, or both, and set the usual daily amount."
          >
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                addMut.mutate();
              }}
            >
              <StudentTypeahead
                students={students.data ?? []}
                value={studentId}
                onChange={setStudentId}
                label="School-enrolled pupil"
                required
              />
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={onFeeding} onChange={(e) => setOnFeeding(e.target.checked)} />
                Feeding
              </label>
              {onFeeding ? (
                <Field label="Usual feeding (GH₵ / day)">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={feedingRate}
                    onChange={(e) => setFeedingRate(e.target.value)}
                  />
                </Field>
              ) : null}
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={onBus} onChange={(e) => setOnBus(e.target.checked)} />
                Bus
              </label>
              {onBus ? (
                <Field label="Usual bus (GH₵ / day)">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={busRate}
                    onChange={(e) => setBusRate(e.target.value)}
                  />
                </Field>
              ) : null}
              {addMut.isError ? <p className="text-sm text-bad">{(addMut.error as Error).message}</p> : null}
              <Button className="w-full" disabled={addMut.isPending || !studentId || (!onFeeding && !onBus)}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add to feeding / bus list
              </Button>
            </form>
          </Card>

          {last && last.length > 0 ? (
            <Card title="Print this receipt" desc="Crest and PAID mark are on the paper.">
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
            </Card>
          ) : null}
        </div>

        <section className="register-sheet overflow-hidden rounded-[var(--radius-lg)] border-2 border-navy bg-surface shadow-[0_1px_2px_rgba(11,85,89,0.08)]">
          <header className="border-b-2 border-navy px-3 py-3 text-center sm:px-6 sm:py-4">
            <div className="flex items-center justify-center gap-3">
              <img
                src="/school-crest.jpg"
                alt=""
                className="h-12 w-12 rounded-full border border-navy/30 object-cover"
              />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-navy">
                  Doorbell International School
                </p>
                <h2 className="mt-1 text-lg font-semibold uppercase tracking-wide text-navy sm:text-xl">
                  Feeding / bus fee list
                </h2>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                className="no-print grid h-11 w-11 place-items-center rounded-[8px] border border-line"
                onClick={() => setMonday(shiftMonday(monday, -1))}
                aria-label="Previous week"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <p className="min-w-40 text-sm font-semibold uppercase tracking-wide text-navy">
                Week — {weekNo}
              </p>
              <button
                type="button"
                className="no-print grid h-11 w-11 place-items-center rounded-[8px] border border-line"
                onClick={() => setMonday(shiftMonday(monday, 1))}
                aria-label="Next week"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="no-print h-11 rounded-[8px] border border-line px-3 text-xs font-medium"
                onClick={() => setMonday(mondayOf())}
              >
                This week
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">
              {formatDayShort(days[0] || monday)} – {formatDayShort(days[4] || monday)}
            </p>
            <div className="no-print mt-3 grid gap-3 sm:flex sm:flex-wrap sm:items-end sm:justify-center">
              <div className="grid grid-cols-3 rounded-[8px] border border-line p-1">
                {(["ALL", "FEEDING", "BUS"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={cn(
                      "h-11 rounded-[6px] px-1 text-xs font-medium sm:h-10 sm:px-3",
                      filter === k ? "bg-navy text-ink" : "text-navy",
                    )}
                    onClick={() => setFilter(k)}
                  >
                    {k === "ALL" ? "All" : k === "FEEDING" ? "Feeding" : "Bus"}
                  </button>
                ))}
              </div>
              <Field label="Tick with amount (optional)">
                <Input
                  className="w-full sm:w-36"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Pupil’s rate"
                  inputMode="decimal"
                  value={tickAmount}
                  onChange={(e) => setTickAmount(e.target.value)}
                />
              </Field>
            </div>
          </header>

          {roster.isLoading ? (
            <p className="px-3 py-8 text-sm text-muted sm:px-4">Loading this week’s list…</p>
          ) : groups.length === 0 ? (
            <p className="px-3 py-8 text-sm text-muted sm:px-4">
              Nobody is on feeding or bus yet. Enrolled school pupils stay off this sheet until you put them
              on the list.
            </p>
          ) : (
            groups.map((g) => {
              const open = openCls[g.className] !== false;
              return (
                <div key={g.className} className="print-break border-t border-navy/20">
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center justify-between bg-bg px-3 py-2 text-left sm:px-4"
                    onClick={() => setOpenCls((m) => ({ ...m, [g.className]: !open }))}
                  >
                    <span className="font-semibold uppercase tracking-wide text-navy">{g.className}</span>
                    <span className="text-xs text-muted">{g.students.length} on the list</span>
                  </button>
                  {open ? (
                    <>
                      <PhoneRegister
                        students={g.students}
                        days={days}
                        today={today}
                        pending={pending}
                        onCollect={collectCell}
                        onPaid={openPaid}
                        onSaveRates={(s, feedingRate, busRate) => {
                          patchRosterRates(s.studentId, feedingRate, busRate, s.onFeeding, s.onBus);
                          enrollOnService({
                            data: {
                              studentId: s.studentId,
                              onFeeding: s.onFeeding,
                              onBus: s.onBus,
                              feedingRate,
                              busRate,
                            },
                          }).catch((e) => {
                            qc.invalidateQueries({ queryKey: ["svc-roster"] });
                            alert((e as Error).message);
                          });
                        }}
                        onDrop={(studentId, name) => {
                          if (confirm(`Take ${name} off the feeding/bus list? Past receipts stay in the book.`)) {
                            dropFromService({ data: { studentId } }).then(() => {
                              qc.invalidateQueries({ queryKey: ["svc-roster"] });
                            });
                          }
                        }}
                      />
                      <DeskRegister
                        students={g.students}
                        days={days}
                        today={today}
                        pending={pending}
                        onCollect={collectCell}
                        onPaid={openPaid}
                        onSaveRates={(s, feedingRate, busRate) => {
                          patchRosterRates(s.studentId, feedingRate, busRate, s.onFeeding, s.onBus);
                          enrollOnService({
                            data: {
                              studentId: s.studentId,
                              onFeeding: s.onFeeding,
                              onBus: s.onBus,
                              feedingRate,
                              busRate,
                            },
                          }).catch((e) => {
                            qc.invalidateQueries({ queryKey: ["svc-roster"] });
                            alert((e as Error).message);
                          });
                        }}
                        onDrop={(studentId, name) => {
                          if (confirm(`Take ${name} off the feeding/bus list? Past receipts stay in the book.`)) {
                            dropFromService({ data: { studentId } }).then(() => {
                              qc.invalidateQueries({ queryKey: ["svc-roster"] });
                            });
                          }
                        }}
                      />
                    </>
                  ) : null}
                </div>
              );
            })
          )}
        </section>
      </div>

      <Card
        className="no-print"
        title="Print feeding & bus receipts"
        desc="Receipt book, grouped by class. Open a class, then Print feeding or Print bus."
      >
        <Field label="Receipts to print">
          <Select value={printKind} onChange={(e) => setPrintKind(e.target.value as "ALL" | "FEEDING" | "BUS")}>
            <option value="ALL">All receipts</option>
            <option value="FEEDING">Feeding receipts only</option>
            <option value="BUS">Bus receipts only</option>
          </Select>
        </Field>
        {receiptGroups.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No collections yet for this option.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {receiptGroups.map((g) => {
              const open = openRcpt === g.cls;
              return (
                <li key={g.cls} className="rounded-[12px] border border-line">
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center justify-between px-3 py-3 text-left"
                    onClick={() => setOpenRcpt(open ? null : g.cls)}
                  >
                    <span className="font-semibold text-navy">{g.cls}</span>
                    <span className="text-xs text-muted">{g.items.length}</span>
                  </button>
                  {open ? (
                    <ul className="border-t border-line px-3 py-2">
                      {g.items.map((r) => (
                        <li
                          key={r.id}
                          className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3 last:border-0"
                        >
                          <span>
                            {r.kind === "BUS" ? "Bus" : "Feeding"} · {r.student || "Unassigned"}
                            <span className="mt-0.5 block font-mono text-xs text-muted">{r.receipt_no}</span>
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
                                        qc.invalidateQueries({ queryKey: ["svc-roster"] });
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

      {edit ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-navy/40 p-3 sm:items-center"
          onClick={() => setEdit(null)}
        >
          <div
            className="w-full max-w-sm rounded-[16px] border border-line bg-surface p-4 shadow-[0_16px_40px_rgba(11,85,89,0.2)]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-semibold text-navy">{edit.name}</p>
            <p className="text-xs text-muted">
              {edit.kind === "BUS" ? "Bus" : "Feeding"} · {formatDayShort(edit.day)} · {edit.paid.receiptNo}
            </p>
            <div className="mt-3">
              <Field label="Amount (GH₵)">
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  autoFocus
                  value={editAmt}
                  onChange={(e) => setEditAmt(e.target.value)}
                />
              </Field>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Button
                type="button"
                onClick={() => {
                  const n = parseFloat(editAmt);
                  if (!Number.isFinite(n) || n <= 0) {
                    alert("Enter a valid amount.");
                    return;
                  }
                  const cur = edit;
                  setEdit(null);
                  void savePaidAmount(cur.studentId, cur.kind, cur.day, cur.paid, n);
                }}
              >
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  const cur = edit;
                  setEdit(null);
                  void clearPaid(cur.studentId, cur.kind, cur.day, cur.paid);
                }}
              >
                Clear
              </Button>
              <Link
                to="/app/receipt/$id"
                params={{ id: edit.paid.id }}
                search={{ print: true }}
                className="inline-flex min-h-11 items-center justify-center gap-1 rounded-[8px] border border-line text-sm text-navy"
                onClick={() => setEdit(null)}
              >
                <Printer className="h-4 w-4" />
                Print
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type CollectFn = (studentId: string, kind: "FEEDING" | "BUS", day: string, rate: number) => void;
type PaidFn = (
  studentId: string,
  name: string,
  kind: "FEEDING" | "BUS",
  day: string,
  paid: PaidCell,
  rate: number,
) => void;

const PHONE_DAYS = ["M", "T", "W", "T", "F"] as const;

function RateLine({
  s,
  onSave,
}: {
  s: RosterPupil;
  onSave: (feedingRate: number, busRate: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(s.feedingRate ? String(s.feedingRate) : "");
  const [b, setB] = useState(s.busRate ? String(s.busRate) : "");
  if (!open) {
    return (
      <button
        type="button"
        className="text-left text-xs text-muted"
        onClick={() => setOpen(true)}
        title="Tap to change the usual daily amount"
      >
        {s.onFeeding ? `Feed ${tickLabel(s.feedingRate) || "—"}` : "No feeding"}
        {" · "}
        {s.onBus ? `Bus ${tickLabel(s.busRate) || "—"}` : "No bus"}
        <span className="ml-1 underline print:hidden">edit</span>
      </button>
    );
  }
  return (
    <form
      className="mt-1 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(parseFloat(f) || 0, parseFloat(b) || 0);
        setOpen(false);
      }}
    >
      {s.onFeeding ? (
        <label className="flex items-center gap-1 text-xs text-navy">
          Feed
          <Input className="h-9 w-16" type="number" min="0" step="0.01" inputMode="decimal" value={f} onChange={(e) => setF(e.target.value)} />
        </label>
      ) : null}
      {s.onBus ? (
        <label className="flex items-center gap-1 text-xs text-navy">
          Bus
          <Input className="h-9 w-16" type="number" min="0" step="0.01" inputMode="decimal" value={b} onChange={(e) => setB(e.target.value)} />
        </label>
      ) : null}
      <Button type="submit" className="h-9 px-3 text-xs">
        Save
      </Button>
      <button type="button" className="text-xs text-muted underline" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}

function DayMark({
  on,
  paid,
  rate,
  today,
  busy,
  kindLabel,
  onCollect,
  onPaid,
}: {
  on: boolean;
  paid?: PaidCell;
  rate: number;
  today: boolean;
  busy: boolean;
  kindLabel: string;
  onCollect: () => void;
  onPaid?: () => void;
}) {
  if (!on) {
    return <span className="block min-h-11 rounded-[6px] bg-bg" aria-hidden />;
  }
  if (paid) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={onPaid}
        title={`Edit ${kindLabel} ${paid.receiptNo}`}
        className={cn(
          "flex min-h-11 w-full touch-manipulation flex-col items-center justify-center rounded-[6px] font-mono text-xs font-semibold text-navy",
          today ? "bg-foam/50" : "bg-bg",
        )}
      >
        <span>{tickLabel(paid.amount)}</span>
        {Math.abs(paid.amount - rate) < 0.009 ? <span className="text-[9px] leading-none text-good">✓</span> : null}
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onCollect}
      title={`Collect ${kindLabel}${rate ? ` GH₵ ${tickLabel(rate)}` : ""}`}
      className={cn(
        "flex min-h-11 w-full touch-manipulation items-center justify-center rounded-[6px] border border-dashed border-line text-muted hover:border-navy hover:text-navy",
        today && "bg-foam/30",
      )}
    >
      <span className="sr-only">
        Collect {kindLabel} {tickLabel(rate)}
      </span>
    </button>
  );
}

function PhoneRegister({
  students,
  days,
  today,
  pending,
  onCollect,
  onPaid,
  onSaveRates,
  onDrop,
}: {
  students: RosterPupil[];
  days: string[];
  today: string;
  pending: Record<string, true>;
  onCollect: CollectFn;
  onPaid: PaidFn;
  onSaveRates: (s: RosterPupil, feedingRate: number, busRate: number) => void;
  onDrop: (studentId: string, name: string) => void;
}) {
  return (
    <div className="lg:hidden print:hidden">
      <div className="grid grid-cols-[2.75rem_repeat(5,minmax(0,1fr))] gap-1 border-b border-line bg-navy px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-ink">
        <span />
        {PHONE_DAYS.map((d, i) => (
          <span key={`h-${d}-${i}`} className={days[i] === today ? "text-foam" : undefined}>
            {d}
          </span>
        ))}
      </div>
      {students.map((s) => (
        <article key={s.studentId} className="border-b border-line px-3 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium text-navy">{s.name}</p>
              <RateLine s={s} onSave={(f, b) => onSaveRates(s, f, b)} />
            </div>
            <button type="button" className="shrink-0 text-xs text-muted underline" onClick={() => onDrop(s.studentId, s.name)}>
              Remove
            </button>
          </div>
          {s.onFeeding ? (
            <div className="mt-2 grid grid-cols-[2.75rem_repeat(5,minmax(0,1fr))] gap-1">
              <span className="self-center text-[10px] font-semibold uppercase tracking-wide text-navy">Feed</span>
              {days.map((day) => (
                <DayMark
                  key={`f-${day}`}
                  on
                  paid={s.feeding[day]}
                  rate={s.feedingRate}
                  today={day === today}
                  busy={Boolean(pending[`${s.studentId}|FEEDING|${day}`])}
                  kindLabel="feeding"
                  onCollect={() => onCollect(s.studentId, "FEEDING", day, s.feedingRate)}
                  onPaid={() => s.feeding[day] && onPaid(s.studentId, s.name, "FEEDING", day, s.feeding[day], s.feedingRate)}
                />
              ))}
            </div>
          ) : null}
          {s.onBus ? (
            <div className="mt-1 grid grid-cols-[2.75rem_repeat(5,minmax(0,1fr))] gap-1">
              <span className="self-center text-[10px] font-semibold uppercase tracking-wide text-navy">Bus</span>
              {days.map((day) => (
                <DayMark
                  key={`b-${day}`}
                  on
                  paid={s.bus[day]}
                  rate={s.busRate}
                  today={day === today}
                  busy={Boolean(pending[`${s.studentId}|BUS|${day}`])}
                  kindLabel="bus"
                  onCollect={() => onCollect(s.studentId, "BUS", day, s.busRate)}
                  onPaid={() => s.bus[day] && onPaid(s.studentId, s.name, "BUS", day, s.bus[day], s.busRate)}
                />
              ))}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function DeskRegister({
  students,
  days,
  today,
  pending,
  onCollect,
  onPaid,
  onSaveRates,
  onDrop,
}: {
  students: RosterPupil[];
  days: string[];
  today: string;
  pending: Record<string, true>;
  onCollect: CollectFn;
  onPaid: PaidFn;
  onSaveRates: (s: RosterPupil, feedingRate: number, busRate: number) => void;
  onDrop: (studentId: string, name: string) => void;
}) {
  return (
    <div className="hidden overflow-x-auto lg:block print:block">
      <table className="w-full table-fixed border-collapse text-sm">
        <thead>
          <tr className="bg-navy text-ink">
            <th rowSpan={2} className="w-[22%] px-3 py-2 text-left font-medium">
              Names
            </th>
            <th colSpan={5} className="border-l border-ink/20 px-2 py-2 text-center font-medium">
              Feeding fee
            </th>
            <th colSpan={5} className="border-l border-ink/20 px-2 py-2 text-center font-medium">
              Bus fee
            </th>
            <th rowSpan={2} className="no-print w-16" />
          </tr>
          <tr className="bg-navy-2 text-[10px] uppercase tracking-wide text-ink">
            {WEEKDAY_SHORT.map((d, i) => (
              <th
                key={`f-${d}`}
                className={cn("border-l border-ink/15 px-1 py-1 font-medium", days[i] === today && "bg-ribbon")}
              >
                {d}
              </th>
            ))}
            {WEEKDAY_SHORT.map((d, i) => (
              <th
                key={`b-${d}`}
                className={cn("border-l border-ink/15 px-1 py-1 font-medium", days[i] === today && "bg-ribbon")}
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((s, idx) => (
            <tr key={s.studentId} className={idx % 2 ? "bg-bg/80" : "bg-surface"}>
              <td className="px-3 py-2">
                <p className="font-medium text-navy">{s.name}</p>
                <RateLine s={s} onSave={(f, b) => onSaveRates(s, f, b)} />
              </td>
              {days.map((day) => (
                <DayCell
                  key={`f-${day}`}
                  on={s.onFeeding}
                  paid={s.feeding[day]}
                  rate={s.feedingRate}
                  today={day === today}
                  busy={Boolean(pending[`${s.studentId}|FEEDING|${day}`])}
                  kindLabel="feeding"
                  onCollect={() => onCollect(s.studentId, "FEEDING", day, s.feedingRate)}
                  onPaid={() => s.feeding[day] && onPaid(s.studentId, s.name, "FEEDING", day, s.feeding[day], s.feedingRate)}
                />
              ))}
              {days.map((day) => (
                <DayCell
                  key={`b-${day}`}
                  on={s.onBus}
                  paid={s.bus[day]}
                  rate={s.busRate}
                  today={day === today}
                  busy={Boolean(pending[`${s.studentId}|BUS|${day}`])}
                  kindLabel="bus"
                  onCollect={() => onCollect(s.studentId, "BUS", day, s.busRate)}
                  onPaid={() => s.bus[day] && onPaid(s.studentId, s.name, "BUS", day, s.bus[day], s.busRate)}
                />
              ))}
              <td className="no-print px-2">
                <button type="button" className="text-xs text-muted underline" onClick={() => onDrop(s.studentId, s.name)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DayCell({
  on,
  paid,
  rate,
  today,
  busy,
  kindLabel,
  onCollect,
  onPaid,
}: {
  on: boolean;
  paid?: PaidCell;
  rate: number;
  today: boolean;
  busy: boolean;
  kindLabel: string;
  onCollect: () => void;
  onPaid?: () => void;
}) {
  if (!on) {
    return <td className="border-l border-line bg-bg/50 px-1 py-1" aria-hidden />;
  }
  return (
    <td className={cn("border-l border-line px-0.5 py-1 text-center", today && "bg-foam/40")}>
      <DayMark
        on
        paid={paid}
        rate={rate}
        today={today}
        busy={busy}
        kindLabel={kindLabel}
        onCollect={onCollect}
        onPaid={onPaid}
      />
    </td>
  );
}
