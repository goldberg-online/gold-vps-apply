import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Megaphone } from "lucide-react";
import {
  AUDIENCE_LABEL,
  listAnnouncements,
  postAnnouncement,
  type AnnouncementAudience,
} from "@/lib/announcements";
import { Button, Field, Input, Select } from "@/components/ui";

function when(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AnnouncementFeed({
  limit = 6,
  title = "Announcements",
  compose = false,
}: {
  limit?: number;
  title?: string;
  compose?: boolean;
}) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["announcements"], queryFn: () => listAnnouncements() });
  const items = (q.data?.items ?? []).slice(0, limit);
  const canPost = Boolean(compose && q.data?.me.canPost);
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AnnouncementAudience>("ALL");
  const mut = useMutation({
    mutationFn: () => postAnnouncement({ data: { title: headline, body, audience } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      setHeadline("");
      setBody("");
    },
  });

  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-[0_1px_2px_rgba(11,85,89,0.08)]">
      <header className="flex items-start justify-between gap-3 bg-navy px-4 py-3 text-ink">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Megaphone className="h-4 w-4 text-foam" />
            {title}
          </p>
          <p className="mt-0.5 text-xs text-foam">
            {canPost ? "Accountant and Super Admin can send." : "From the office."}
          </p>
        </div>
        <Link to="/app/announcements" className="shrink-0 text-xs font-medium text-foam underline">
          Open all
        </Link>
      </header>
      <div className="p-4">
        {canPost ? (
          <form
            className="mb-4 space-y-2 rounded-[12px] border border-line bg-bg p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (mut.isPending) return;
              mut.mutate();
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-navy">Send a notice</p>
            <Field label="Send to">
              <Select
                value={audience}
                onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}
              >
                <option value="ALL">Everyone (parents and staff)</option>
                <option value="PARENTS">Parents only</option>
                <option value="STAFF">Staff only</option>
              </Select>
            </Field>
            <Field label="Title">
              <Input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                required
                maxLength={120}
                placeholder="e.g. PTA meeting Friday"
              />
            </Field>
            <Field label="Message">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                maxLength={4000}
                rows={3}
                className="w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 py-2 text-sm text-fg outline-none ring-navy/20 focus:border-navy focus:ring-2"
                placeholder="Write the notice…"
              />
            </Field>
            {mut.isError ? <p className="text-sm text-bad">{(mut.error as Error).message}</p> : null}
            {mut.isSuccess ? <p className="text-sm text-good">Sent.</p> : null}
            <Button type="submit" className="w-full" disabled={mut.isPending}>
              {mut.isPending ? "Sending…" : "Send announcement"}
            </Button>
          </form>
        ) : null}
        {q.isLoading ? <p className="text-sm text-muted">Loading notices…</p> : null}
        {q.isError ? <p className="text-sm text-bad">{(q.error as Error).message}</p> : null}
        {!q.isLoading && items.length === 0 ? (
          <p className="text-sm text-muted">No announcements yet.</p>
        ) : null}
        <ul className="max-h-[28rem] space-y-3 overflow-y-auto">
          {items.map((a) => (
            <li key={a.id} className="rounded-[12px] border border-line bg-bg p-3">
              <p className="font-medium text-navy">{a.title}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{a.body}</p>
              <p className="mt-2 text-xs text-muted">
                {AUDIENCE_LABEL[a.audience]} · {a.author} · {when(a.created_at)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
