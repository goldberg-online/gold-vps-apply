import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getMe, getReceipt, listReceiptEvents, logReceiptPrint, sendPaymentSms } from "@/lib/school";
import { num } from "@/lib/ghana";
import { OfficialReceipt } from "@/components/official-receipt";
import { Button } from "@/components/ui";

export const Route = createFileRoute("/app/receipt/$id")({ component: ReceiptPage });

function ReceiptPage() {
  const { id } = Route.useParams();
  const q = useQuery({ queryKey: ["receipt", id], queryFn: () => getReceipt({ data: { id } }) });
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMe() });
  const ev = useQuery({ queryKey: ["receipt-ev", id], queryFn: () => listReceiptEvents({ data: { id } }) });
  const sms = useMutation({
    mutationFn: () => sendPaymentSms({ data: { id } }),
  });
  const r = q.data;
  if (q.isLoading) return <p className="text-sm text-muted">Loading receipt…</p>;
  if (!r) return <p className="text-sm text-bad">Receipt not found.</p>;
  const bal = Math.max(0, num(r.total) - num(r.paid));
  const cancelled = r.status && r.status !== "POSTED";
  const canSms =
    r.source === "FEE" && (me.data?.me.role === "SUPER_ADMIN" || me.data?.me.role === "ACCOUNTANT");
  const cashier =
    r.cashier?.trim() ||
    (me.data ? `${me.data.me.first_name} ${me.data.me.last_name}` : "Cashier");
  const issued = r.paid_at.slice(0, 16).replace("T", " ");
  return (
    <div className="mx-auto max-w-xl">
      <OfficialReceipt
        data={{
          receiptNo: r.receipt_no,
          issued,
          student: r.student,
          admissionNo: r.admission_no,
          className: r.class_name,
          amount: num(r.amount),
          method: r.method,
          description: r.description,
          term: r.term,
          balance: bal,
          cashier,
          footer: r.source === "SERVICE" ? "Bus & feeding till" : `Billing ${r.invoice_no}`,
          status: r.status,
          voidReason: r.void_reason,
        }}
      />
      <div className="mt-6 flex flex-wrap gap-2 print:hidden">
        {canSms ? (
          <Button className="flex-1" disabled={!!cancelled || sms.isPending} onClick={() => sms.mutate()}>
            {sms.isPending ? "Sending…" : "Send SMS"}
          </Button>
        ) : null}
        <Button
          className="flex-1"
          variant="ghost"
          onClick={() => {
            logReceiptPrint({ data: { id } }).catch(() => undefined);
            window.print();
          }}
        >
          Print receipt
        </Button>
      </div>
      {sms.isSuccess ? (
        <p className="mt-2 text-sm text-good print:hidden">
          {sms.data.mocked ? "SMS logged (add SMS_API_KEY to send for real)." : "SMS sent to the parent phone."}
        </p>
      ) : null}
      {sms.isError ? <p className="mt-2 text-sm text-bad print:hidden">{(sms.error as Error).message}</p> : null}
      <section className="mt-6 print:hidden">
        <h2 className="text-sm font-medium">Audit trail</h2>
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {(ev.data ?? []).map((e) => (
            <li key={e.id}>
              {e.created_at.slice(0, 19).replace("T", " ")} · {e.action}
              {e.reason ? ` — ${e.reason}` : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
