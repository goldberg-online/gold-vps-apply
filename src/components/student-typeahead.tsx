import { useMemo, useRef, useState } from "react";
import { Field, Input } from "@/components/ui";
import { sortAlpha } from "@/lib/ghana";

export type NamedStudent = {
  id: string;
  first_name: string;
  last_name: string;
  admission_no: string;
  class_name?: string;
};

function labelOf(s: NamedStudent) {
  return `${s.first_name} ${s.last_name} · ${s.admission_no}${s.class_name ? ` · ${s.class_name}` : ""}`;
}

/** Type a name — enrolled students pop up grouped by class, A–Z. */
export function StudentTypeahead({
  students,
  value,
  onChange,
  required,
  label = "Student",
}: {
  students: NamedStudent[];
  value: string;
  onChange: (id: string) => void;
  required?: boolean;
  label?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const selected = students.find((s) => s.id === value);
  const shown = selected && !open ? labelOf(selected) : q;
  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const rows = (s
      ? students.filter((st) =>
          `${st.first_name} ${st.last_name} ${st.admission_no} ${st.class_name ?? ""}`
            .toLowerCase()
            .includes(s),
        )
      : students
    ).slice();
    rows.sort(
      (a, b) =>
        sortAlpha(a.class_name || "Unassigned", b.class_name || "Unassigned") ||
        sortAlpha(`${a.last_name} ${a.first_name}`, `${b.last_name} ${b.first_name}`),
    );
    const map = new Map<string, NamedStudent[]>();
    for (const st of rows) {
      const k = st.class_name || "Unassigned";
      const list = map.get(k) ?? [];
      list.push(st);
      map.set(k, list);
    }
    return [...map.entries()];
  }, [q, students]);

  return (
    <Field label={label}>
      <div className="relative" ref={box}>
        <Input
          value={shown}
          required={required && !value}
          autoComplete="off"
          placeholder="Start typing a name or DISST…"
          onFocus={() => {
            setOpen(true);
            setQ(selected ? `${selected.first_name} ${selected.last_name}` : q);
          }}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            onChange("");
          }}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 180);
          }}
        />
        {open ? (
          <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-[12px] border border-line bg-surface shadow-[0_12px_40px_rgba(7,20,51,0.18)]">
            {groups.length === 0 ? (
              <li className="px-3 py-3 text-sm text-muted">No enrolled student matches.</li>
            ) : (
              groups.map(([cls, list]) => (
                <li key={cls}>
                  <p className="sticky top-0 bg-bg px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-navy">
                    {cls}
                  </p>
                  <ul>
                    {list.map((st) => (
                      <li key={st.id}>
                        <button
                          type="button"
                          className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-bg"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            onChange(st.id);
                            setQ(`${st.first_name} ${st.last_name}`);
                            setOpen(false);
                          }}
                        >
                          <span className="font-medium text-navy">
                            {st.first_name} {st.last_name}
                          </span>
                          <span className="text-xs text-muted">{st.admission_no}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </Field>
  );
}
