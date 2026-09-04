import { createFileRoute } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { SystemProspectus } from "@/components/system-prospectus";

export const Route = createFileRoute("/online")({ component: Online });

function Online() {
  const { user } = useCurrentUserState();
  return <SystemProspectus signedIn={!!user} />;
}
