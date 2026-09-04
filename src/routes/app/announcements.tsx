import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Megaphone } from "lucide-react";
import {
  AUDIENCE_LABEL,
  deleteAnnouncement,
  listAnnouncements,
  postAnnouncement,
  type AnnouncementAudience,
} from "@/lib/announcements";
import { Button, Card, Field, Input, Select } from "@/components/ui";

export const Route = createFileRoute("/app/announcements")({ component: AnnouncementsPage });

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

function AnnouncementsPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["announcements"], queryFn: () => listAnnouncements() });
  const canPost = list.data?.me.canPost;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AnnouncementAudience>("ALL");
  const mut = useMutation({
    mutationFn: () => postAnnouncement({ data: { title, body, audience } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      setTitle("");
      setBody("");
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      {canPost ? (
        <Card title="Send announcement" desc="Accountant and Super Admin. Everyone you pick will see it on their desk.">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (mut.isPending) return;
              mut.mutate();
            }}
          >
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
                value={title}
                onChange={(e) => setTitle(e.target.value)}
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
                rows={6}
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
        </Card>
      ) : (
        <Card title="School notices" desc="Posted by the accountant or Super Admin.">
          <p className="text-sm text-muted">New notices also appear on Overview.</p>
        </Card>
      )}
      <Card title="Announcements" desc="Newest first.">
        {list.isLoading ? <p className="text-sm text-muted">Loading…</p> : null}
        {list.isError ? <p className="text-sm text-bad">{(list.error as Error).message}</p> : null}
        <ul className="space-y-3">
          {(list.data?.items ?? []).map((a) => (
            <li key={a.id} className="rounded-[12px] border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 font-medium text-navy">
                    <Megaphone className="h-4 w-4 text-gold" />
                    {a.title}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {AUDIENCE_LABEL[a.audience]} · {a.author} · {when(a.created_at)}
                  </p>
                </div>
                {canPost ? (
                  <Button
                    type="button"
                    variant="danger"
                    className="min-h-11 px-3 text-xs"
                    onClick={() => {
                      if (confirm("Remove this announcement?")) {
                        deleteAnnouncement({ data: { id: a.id } }).then(() =>
                          qc.invalidateQueries({ queryKey: ["announcements"] }),
                        );
                      }
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{a.body}</p>
            </li>
          ))}
        </ul>
        {!list.isLoading && (list.data?.items.length ?? 0) === 0 ? (
          <p className="text-sm text-muted">No announcements yet.</p>
        ) : null}
      </Card>
    </div>
  );
}
