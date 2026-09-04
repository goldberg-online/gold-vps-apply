import { createFileRoute } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { ReceiptGallery } from "@/components/receipt-gallery";

export const Route = createFileRoute("/looks")({ component: Looks });

function Looks() {
  const { user } = useCurrentUserState();
  return <ReceiptGallery signedIn={!!user} />;
}
