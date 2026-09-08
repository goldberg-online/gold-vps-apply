import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { ReceiptGallery } from "@/components/receipt-gallery";

export const Route = createFileRoute("/looks")({ component: Looks });

function Looks() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return null;
  if (!user) return <Navigate to="/" />;
  return <ReceiptGallery signedIn />;
}
