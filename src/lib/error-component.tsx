import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

function safeErrorText(error: { message?: string }) {
  const raw = String(error?.message || "");
  if (!raw) return "An unexpected error occurred. Try reloading the page.";
  if (/sql|postgres|relation |column |ECONN|stack|\/workspace|node_modules|at\s+\S+\s+\(/i.test(raw)) {
    return "Something went wrong. Try again, or ask Super Admin.";
  }
  return raw;
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main
      className={
        "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center " +
        "bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50"
      }
    >
      <span className="text-red-500" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm break-words text-zinc-500 dark:text-zinc-400">
        {safeErrorText(error)}
      </p>
    </main>
  );
}
