import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu } from "lucide-react";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getMe } from "@/lib/school";
import { ROLE_LABEL, type StaffRole } from "@/lib/ghana";
import { IdleLogout } from "@/lib/auth/idle-logout";
import { UniformBackdrop } from "@/components/ui";

export const Route = createFileRoute("/app")({ component: AppGate });

function AppGate() {
  const { user, isPending } = useCurrentUserState();
  const [client] = useState(() => new QueryClient());
  if (isPending) {
    return <div className="min-h-screen bg-bg" />;
  }
  if (!user) return <RedirectToSignIn to="/login" />;
  return (
    <QueryClientProvider client={client}>
      <AppShell />
    </QueryClientProvider>
  );
}

const NAV: {
  href:
    | "/app"
    | "/app/staff"
    | "/app/students"
    | "/app/academic"
    | "/app/promote"
    | "/app/timetable"
    | "/app/homework"
    | "/app/report-cards"
    | "/app/cumulative"
    | "/app/tasks"
    | "/app/billing"
    | "/app/payments"
    | "/app/income"
    | "/app/expenses"
    | "/app/salaries"
    | "/app/services"
    | "/app/ledger"
    | "/app/cash"
    | "/app/reports"
    | "/app/audit"
    | "/app/attendance"
    | "/app/marks"
    | "/app/account";
  label: string;
  group: string;
  roles: StaffRole[];
}[] = [
  { href: "/app", label: "Overview", group: "Desk", roles: ["SUPER_ADMIN", "SCHOOL_ADMIN", "ACCOUNTANT", "TEACHER", "SERVICE_OFFICER", "PARENT"] },
  { href: "/app/staff", label: "Staff", group: "Desk", roles: ["SUPER_ADMIN", "SCHOOL_ADMIN", "ACCOUNTANT", "TEACHER"] },
  { href: "/app/students", label: "Students & parents", group: "Desk", roles: ["SUPER_ADMIN", "SCHOOL_ADMIN", "ACCOUNTANT", "TEACHER", "PARENT"] },
  { href: "/app/account", label: "My profile", group: "Desk", roles: ["SUPER_ADMIN", "SCHOOL_ADMIN", "ACCOUNTANT", "TEACHER", "SERVICE_OFFICER", "PARENT"] },
  { href: "/app/academic", label: "Academic", group: "School", roles: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
  { href: "/app/promote", label: "Promote", group: "School", roles: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
  { href: "/app/timetable", label: "Timetable", group: "School", roles: ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "PARENT"] },
  { href: "/app/homework", label: "Homework", group: "School", roles: ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "PARENT"] },
  { href: "/app/report-cards", label: "Report cards", group: "School", roles: ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "PARENT"] },
  { href: "/app/cumulative", label: "GES cumulative", group: "School", roles: ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "PARENT", "ACCOUNTANT"] },
  { href: "/app/tasks", label: "Assign tasks", group: "School", roles: ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "ACCOUNTANT", "SERVICE_OFFICER"] },
  { href: "/app/attendance", label: "Attendance", group: "School", roles: ["SUPER_ADMIN", "TEACHER", "SCHOOL_ADMIN"] },
  { href: "/app/marks", label: "Marks", group: "School", roles: ["SUPER_ADMIN", "TEACHER", "SCHOOL_ADMIN"] },
  { href: "/app/billing", label: "Billing", group: "Accounts", roles: ["SUPER_ADMIN", "ACCOUNTANT"] },
  { href: "/app/payments", label: "Payments", group: "Accounts", roles: ["SUPER_ADMIN", "ACCOUNTANT"] },
  { href: "/app/income", label: "Other income", group: "Accounts", roles: ["SUPER_ADMIN", "ACCOUNTANT"] },
  { href: "/app/expenses", label: "Expenses", group: "Accounts", roles: ["SUPER_ADMIN", "ACCOUNTANT"] },
  { href: "/app/salaries", label: "Salaries", group: "Accounts", roles: ["SUPER_ADMIN", "ACCOUNTANT"] },
  { href: "/app/ledger", label: "Ledger", group: "Accounts", roles: ["SUPER_ADMIN", "ACCOUNTANT"] },
  { href: "/app/cash", label: "Daily cash", group: "Accounts", roles: ["SUPER_ADMIN", "ACCOUNTANT"] },
  { href: "/app/reports", label: "Reports", group: "Accounts", roles: ["SUPER_ADMIN", "ACCOUNTANT"] },
  { href: "/app/audit", label: "Audit", group: "Accounts", roles: ["SUPER_ADMIN", "ACCOUNTANT"] },
  { href: "/app/services", label: "Bus & feeding", group: "Services", roles: ["SUPER_ADMIN", "ACCOUNTANT", "SERVICE_OFFICER"] },
];

function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const meQ = useQuery({ queryKey: ["me"], queryFn: () => getMe() });
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const role = (meQ.data?.me.role ?? "PARENT") as StaffRole;
  const links = NAV.filter((n) => n.roles.includes(role));
  const groups = [...new Set(links.map((l) => l.group))];

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function itemLabel(href: (typeof NAV)[number]["href"], label: string) {
    if (role === "PARENT" && href === "/app/students") return "My children";
    if (role === "TEACHER" && href === "/app/staff") return "My class";
    if (role === "TEACHER" && href === "/app/students") return "My students";
    return label;
  }

  return (
    <div className="relative min-h-screen bg-bg text-fg">
      <UniformBackdrop wash="bg-navy/45" />
      <IdleLogout role={meQ.data?.me.role} />
      <header className="sticky top-0 z-30 border-b border-navy/20 bg-navy/92 text-ink backdrop-blur-sm print:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src="/school-crest.jpg"
              alt="Doorbell International School crest"
              className="h-11 w-11 rounded-full border-2 border-ink/40 object-cover"
            />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-foam">DIS ONLINE</p>
              <p className="truncate text-sm font-semibold uppercase tracking-wide text-ink">
                Doorbell International School
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <p className="hidden text-sm text-foam lg:block">
              {meQ.data
                ? `${meQ.data.me.first_name} ${meQ.data.me.last_name} · ${meQ.data.me.display_role || ROLE_LABEL[role]}`
                : "Christ is our light"}
            </p>
            <div ref={menuRef} className="relative">
              <button
                type="button"
                aria-expanded={open}
                aria-haspopup="menu"
                className="inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-ink/35 bg-navy-2 px-3 text-sm font-medium text-ink"
                onClick={() => setOpen((v) => !v)}
              >
                <Menu className="h-4 w-4" />
                Menu
                <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
              {open ? (
                <div
                  role="menu"
                  className="absolute right-0 z-40 mt-2 max-h-[70vh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-[12px] border border-line bg-surface p-3 text-fg shadow-[0_16px_40px_rgba(11,85,89,0.2)]"
                >
                  {groups.map((g) => (
                    <div key={g} className="mb-3 last:mb-0">
                      <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{g}</p>
                      <div className="grid gap-0.5">
                        {links
                          .filter((l) => l.group === g)
                          .map((l) => {
                            const active = l.href === "/app" ? pathname === "/app" : pathname.startsWith(l.href);
                            return (
                              <Link
                                key={l.href}
                                to={l.href}
                                role="menuitem"
                                onClick={() => setOpen(false)}
                                className={`min-h-10 rounded-[8px] px-3 py-2 text-sm ${
                                  active ? "bg-navy font-semibold text-ink" : "hover:bg-bg"
                                }`}
                              >
                                {itemLabel(l.href, l.label)}
                              </Link>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="hidden sm:block">
              <UserButton />
            </div>
          </div>
        </div>
      </header>
      <div className="relative z-10 flex items-center justify-between gap-3 border-b border-line bg-surface/92 px-4 py-3 backdrop-blur-sm print:hidden sm:hidden">
        <p className="text-sm">
          {meQ.data ? `${meQ.data.me.first_name} ${meQ.data.me.last_name}` : "…"}
          <span className="ml-2 text-xs text-muted">
            {meQ.data?.me.display_role || (meQ.data ? ROLE_LABEL[meQ.data.me.role] : "")}
          </span>
        </p>
        <UserButton />
      </div>
      <div className="relative z-10 px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </div>
    </div>
  );
}
