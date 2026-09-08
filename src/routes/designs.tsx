import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { UiGallery } from "@/components/ui-gallery";

export const Route = createFileRoute("/designs")({ component: Designs });

function Designs() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return null;
  if (!user) return <Navigate to="/" />;
  return <UiGallery signedIn />;
}
