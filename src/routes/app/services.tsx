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

  const roster = useQuery({
    queryKey: ["svc-roster", monday],
    queryFn: () => listServiceRoster({ data: { monday } }),
  });
  const list = useQuery({ queryKey: ["svc"], queryFn: () => listServices() });

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

  const tickMut = useMutation({
    mutationFn: (p: { studentId: string; kind: "FEEDING" | "BUS"; amount: number; collectedOn: string }) =>
      collectService({
        data: {
          kind: p.kind,
          studentId: p.studentId,
          amount: p.amount,
          collectedOn: p.collectedOn,
        },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["svc-roster"] });
      qc.invalidateQueries({ queryKey: ["svc"] });
      qc.invalidateQueries({ queryKey: ["dash"] });
      setLast(res.receipts ?? []);
    },
  });

  function collectCell(studentId: string, kind: "FEEDING" | "BUS", day: string, rate: number) {
    const typed = parseFloat(tickAmount);
    const amount = Number.isFinite(typed) && typed > 0 ? typed : rate;
    if (!amount || amount <= 0) {
      alert("Set this pupil’s daily rate when you put them on the list, or type an amount in “Tick with amount”.");
      return;
    }
    tickMut.mutate({ studentId, kind, amount, collectedOn: day });
  }

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">Bus & feeding</h1>
          <p className="text-sm text-muted">
            Only pupils put on feeding or bus appear here — not the whole school roll. Grouped by class,
            names A–Z.
          </p>
        </div>
        <Button type="button" variant="ghost" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print this week’s list
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
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
          <header className="border-b-2 border-navy px-4 py-4 text-center sm:px-6">
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
            <div className="no-print mt-3 flex flex-wrap items-end justify-center gap-3">
              <div className="flex rounded-[8px] border border-line p-1">
                {(["ALL", "FEEDING", "BUS"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={cn(
                      "h-10 rounded-[6px] px-3 text-xs font-medium",
                      filter === k ? "bg-navy text-ink" : "text-navy",
                    )}
                    onClick={() => setFilter(k)}
                  >
                    {k === "ALL" ? "All on the list" : k === "FEEDING" ? "Feeding only" : "Bus only"}
                  </button>
                ))}
              </div>
              <Field label="Tick with amount (optional)">
                <Input
                  className="w-36"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Pupil’s rate"
                  value={tickAmount}
                  onChange={(e) => setTickAmount(e.target.value)}
                />
              </Field>
            </div>
          </header>

          {roster.isLoading ? (
            <p className="px-4 py-8 text-sm text-muted">Loading this week’s list…</p>
          ) : groups.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted">
              Nobody is on feeding or bus yet. Enrolled school pupils stay off this sheet until you put them
              on the list.
            </p>
          ) : (
            <div className="overflow-x-auto">
              {groups.map((g) => {
                const open = openCls[g.className] !== false;
                return (
                  <div key={g.className} className="print-break border-t border-navy/20">
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center justify-between bg-bg px-4 py-2 text-left"
                      onClick={() => setOpenCls((m) => ({ ...m, [g.className]: !open }))}
                    >
                      <span className="font-semibold uppercase tracking-wide text-navy">{g.className}</span>
                      <span className="text-xs text-muted">{g.students.length} on the list</span>
                    </button>
                    {open ? (
                      <table className="w-full min-w-[720px] border-collapse text-sm">
                        <thead>
                          <tr className="bg-navy text-ink">
                            <th rowSpan={2} className="sticky left-0 bg-navy px-3 py-2 text-left font-medium">
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
                                className={cn(
                                  "w-14 border-l border-ink/15 px-1 py-1 font-medium",
                                  days[i] === today && "bg-ribbon",
                                )}
                              >
                                {d}
                              </th>
                            ))}
                            {WEEKDAY_SHORT.map((d, i) => (
                              <th
                                key={`b-${d}`}
                                className={cn(
                                  "w-14 border-l border-ink/15 px-1 py-1 font-medium",
                                  days[i] === today && "bg-ribbon",
                                )}
                              >
                                {d}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {g.students.map((s, idx) => (
                            <tr key={s.studentId} className={idx % 2 ? "bg-bg/80" : "bg-surface"}>
                              <td className="sticky left-0 bg-inherit px-3 py-2">
                                <p className="font-medium text-navy">{s.name}</p>
                                <p className="text-[11px] text-muted">
                                  {s.onFeeding ? `Feed ${tickLabel(s.feedingRate) || "—"}` : "No feeding"}
                                  {" · "}
                                  {s.onBus ? `Bus ${tickLabel(s.busRate) || "—"}` : "No bus"}
                                </p>
                              </td>
                              {days.map((day) => (
                                <DayCell
                                  key={`f-${day}`}
                                  on={s.onFeeding}
                                  paid={s.feeding[day]}
                                  rate={s.feedingRate}
                                  today={day === today}
                                  busy={tickMut.isPending}
                                  kindLabel="feeding"
                                  onCollect={() => collectCell(s.studentId, "FEEDING", day, s.feedingRate)}
                                />
                              ))}
                              {days.map((day) => (
                                <DayCell
                                  key={`b-${day}`}
                                  on={s.onBus}
                                  paid={s.bus[day]}
                                  rate={s.busRate}
                                  today={day === today}
                                  busy={tickMut.isPending}
                                  kindLabel="bus"
                                  onCollect={() => collectCell(s.studentId, "BUS", day, s.busRate)}
                                />
                              ))}
                              <td className="no-print px-2">
                                <button
                                  type="button"
                                  className="text-[11px] text-muted underline"
                                  onClick={() => {
                                    if (
                                      confirm(
                                        `Take ${s.name} off the feeding/bus list? Past receipts stay in the book.`,
                                      )
                                    ) {
                                      dropFromService({ data: { studentId: s.studentId } }).then(() => {
                                        qc.invalidateQueries({ queryKey: ["svc-roster"] });
                                      });
                                    }
                                  }}
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
          {tickMut.isError ? (
            <p className="px-4 py-3 text-sm text-bad">{(tickMut.error as Error).message}</p>
          ) : null}
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
}: {
  on: boolean;
  paid?: { id: string; amount: number; receiptNo: string };
  rate: number;
  today: boolean;
  busy: boolean;
  kindLabel: string;
  onCollect: () => void;
}) {
  if (!on) {
    return <td className="border-l border-line bg-bg/50 px-1 py-1" aria-hidden />;
  }
  if (paid) {
    return (
      <td className={cn("border-l border-line px-0.5 py-1 text-center", today && "bg-foam/40")}>
        <Link
          to="/app/receipt/$id"
          params={{ id: paid.id }}
          search={{ print: true }}
          title={`Print ${kindLabel} receipt ${paid.receiptNo}`}
          className="inline-flex min-h-10 min-w-10 flex-col items-center justify-center rounded-[6px] px-1 font-mono text-xs font-semibold text-navy hover:bg-foam"
        >
          <span>{tickLabel(paid.amount)}</span>
          {Math.abs(paid.amount - rate) < 0.009 ? <span className="text-[9px] text-good">✓</span> : null}
        </Link>
      </td>
    );
  }
  return (
    <td className={cn("border-l border-line px-0.5 py-1 text-center", today && "bg-foam/30")}>
      <button
        type="button"
        disabled={busy}
        onClick={onCollect}
        title={`Collect ${kindLabel}${rate ? ` GH₵ ${tickLabel(rate)}` : ""}`}
        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-[6px] border border-dashed border-line text-[10px] text-muted hover:border-navy hover:text-navy"
      >
        <span className="sr-only">Collect {kindLabel} {tickLabel(rate)}</span>
      </button>
    </td>
  );
}
