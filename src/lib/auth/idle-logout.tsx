import { useEffect, useRef } from "react";
import { signOut } from "./client";
import type { StaffRole } from "@/lib/ghana";

const IDLE_MS: Partial<Record<StaffRole, number>> = {
  ACCOUNTANT: 10 * 60 * 1000,
};
const DEFAULT_IDLE_MS = 5 * 60 * 1000;
const EVENTS = ["pointerdown", "keydown", "mousemove", "scroll", "touchstart", "click"] as const;

/** Log out after idle time. Accountant: 10 minutes. Everyone else: 5 minutes. */
export function IdleLogout({ role }: { role?: StaffRole }) {
  const roleRef = useRef(role);
  roleRef.current = role;

  useEffect(() => {
    if (typeof window === "undefined") return;
    let timer: number | undefined;

    const arm = () => {
      if (timer) window.clearTimeout(timer);
      if (!roleRef.current) return;
      const ms = IDLE_MS[roleRef.current] ?? DEFAULT_IDLE_MS;
      timer = window.setTimeout(() => {
        void signOut("/");
      }, ms);
    };

    arm();
    EVENTS.forEach((ev) => window.addEventListener(ev, arm, { passive: true }));
    return () => {
      if (timer) window.clearTimeout(timer);
      EVENTS.forEach((ev) => window.removeEventListener(ev, arm));
    };
  }, [role]);

  return null;
}
