import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listStudents } from "@/lib/school";
import { listPromotions, promoteClass } from "@/lib/academic-ops";
import { GHANA_CLASS_LEVELS, nextClass, sortAlpha } from "@/lib/ghana";
import { Button, Card, Field, Select } from "@/components/ui";

export const Route = createFileRoute("/app/promote")({ component: PromotePage });

function PromotePage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["students"], queryFn: () => listStudents() });
  const hist = useQuery({ queryKey: ["promotions"], queryFn: () => listPromotions() });
  const [fromClass, setFromClass] = useState("JHS 2");
  const [picked, setPicked] = useState<string[]>([]);
  const [decision, setDecision] = useState<"PROMOTED" | "REPEATED" | "GRADUATED">("PROMOTED");
  const roster = useMemo(
    () =>
      (list.data ?? [])
        .filter((s) => s.class_name === fromClass && (s.status ?? "ACTIVE") !== "GRADUATED")
        .slice()
        .sort((a, b) => sortAlpha(`${a.last_name} ${a.first_name}`, `${b.last_name} ${b.first_name}`)),
    [list.data, fromClass],
  );
  const ladder = nextClass(fromClass);
  const mut = useMutation({
    mutationFn: () =>
      promoteClass({
        data: { fromClass, studentIds: picked.length ? picked : roster.map((s) => s.id), decision },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["promotions"] });
      qc.invalidateQueries({ queryKey: ["dash"] });
      setPicked([]);
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card
        title="Promote class"
        desc={
          ladder.graduated
            ? "JHS 3 sits BECE. Promote marks them Graduated."
            : `Next class is ${ladder.next}. Repeat keeps them in ${fromClass}.`
        }
      >
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <Field label="From class">
            <Select
              value={fromClass}
              onChange={(e) => {
                setFromClass(e.target.value);
                setPicked([]);
              }}
            >
              {GHANA_CLASS_LEVELS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Decision">
            <Select value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}>
              <option value="PROMOTED">{ladder.graduated ? "Graduate (BECE)" : `Promote to ${ladder.next}`}</option>
              <option value="REPEATED">Repeat this class</option>
              {ladder.graduated ? <option value="GRADUATED">Mark graduated</option> : null}
            </Select>
          </Field>
        </div>
        <ul className="space-y-2">
          {roster.map((s) => (
            <li key={s.id}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={picked.includes(s.id)}
                  onChange={() =>
                    setPicked((cur) => (cur.includes(s.id) ? cur.filter((id) => id !== s.id) : [...cur, s.id]))
                  }
                />
                {s.first_name} {s.last_name}
                <span className="font-mono text-xs text-muted">{s.admission_no}</span>
              </label>
            </li>
          ))}
        </ul>
        {mut.isError ? <p className="mt-3 text-sm text-bad">{(mut.error as Error).message}</p> : null}
        {mut.isSuccess ? <p className="mt-3 text-sm text-good">Moved {mut.data.moved} students.</p> : null}
        <Button className="mt-4" type="button" onClick={() => mut.mutate()} disabled={mut.isPending || roster.length === 0}>
          {picked.length ? `Apply to ${picked.length} selected` : `Apply to whole class (${roster.length})`}
        </Button>
      </Card>
      <Card title="Promotion history" desc="Who moved, when.">
        <ul className="space-y-2 text-sm">
          {(hist.data ?? []).map((p) => (
            <li key={p.id} className="border-b border-line py-2">
              {p.student}
              <span className="block text-xs text-muted">
                {p.from_class} → {p.to_class} · {p.decision} · {p.year_name}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}