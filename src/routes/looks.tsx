import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/looks")({
  component: () => <Navigate to="/" />,
});
