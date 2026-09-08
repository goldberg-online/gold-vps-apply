export const GHANA_CLASS_LEVELS = [
  "Creche",
  "Nursery 1",
  "Nursery 2",
  "KG 1",
  "KG 2",
  "Primary 1",
  "Primary 2",
  "Primary 3",
  "Primary 4",
  "Primary 5",
  "Primary 6",
  "JHS 1",
  "JHS 2",
  "JHS 3",
] as const;

export const TERMS = ["1st Term", "2nd Term", "3rd Term"] as const;

export const TEST_TYPES = [
  "Class test",
  "Quiz",
  "Homework",
  "Mid-term exam",
  "End of term exam",
  "Project",
  "Oral",
  "Practical",
] as const;

export type SchoolTerm = (typeof TERMS)[number];

/** GES calendar: Sep–Dec 1st, Jan–Apr 2nd, May–Aug 3rd. */
export function termFromDate(iso: string): SchoolTerm {
  const stamp = String(iso || "").trim();
  const month = Number((stamp.match(/-(\d{2})/) ?? [])[1] || stamp.slice(5, 7));
  if (month >= 9 && month <= 12) return "1st Term";
  if (month >= 5 && month <= 8) return "3rd Term";
  return "2nd Term";
}

/** Academic year spanning September–August, e.g. 2025/2026. */
export function academicYearFromDate(iso: string): string {
  const stamp = String(iso || "").trim();
  const y = Number(stamp.slice(0, 4)) || new Date().getFullYear();
  const month = Number(stamp.slice(5, 7)) || 1;
  if (month >= 9) return `${y}/${y + 1}`;
  return `${y - 1}/${y}`;
}

export function sortAlpha(a: string, b: string) {
  return a.localeCompare(b, "en", { sensitivity: "base" });
}

export function academicYearRange(year: string): { from: string; to: string } {
  const start = Number(String(year).slice(0, 4)) || new Date().getFullYear();
  return { from: `${start}-09-01`, to: `${start + 1}-08-31` };
}

export const LEDGER_ACCOUNTS = [
  "CASH",
  "FEES_RECEIVABLE",
  "FEE_INCOME",
  "OTHER_INCOME",
  "BUS_INCOME",
  "FEEDING_INCOME",
  "EXPENSE",
  "SALARY",
] as const;

export type LedgerAccount = (typeof LEDGER_ACCOUNTS)[number];

export const LEDGER_LABEL: Record<LedgerAccount, string> = {
  CASH: "Cash / MoMo / bank",
  FEES_RECEIVABLE: "Fees receivable",
  FEE_INCOME: "School fee income",
  OTHER_INCOME: "Other income",
  BUS_INCOME: "Bus income",
  FEEDING_INCOME: "Feeding income",
  EXPENSE: "School expense",
  SALARY: "Salaries",
};

export const NURSERY_SUBJECTS = ["Writing 60", "English", "Numeracy", "Fun Coloring"] as const;
export const KG_SUBJECTS = [
  "Creative Arts",
  "Phonics",
  "Writing (3)",
  "Literacy",
  "Numeracy",
  "French",
] as const;

export const CLASS_DEFAULT_SUBJECTS: Record<string, readonly string[]> = {
  "Nursery 1": NURSERY_SUBJECTS,
  "Nursery 2": NURSERY_SUBJECTS,
  "KG 1": KG_SUBJECTS,
  "KG 2": KG_SUBJECTS,
};

export const GES_SUBJECTS: Record<"NURSERY" | "KG" | "EARLY" | "PRIMARY" | "JHS", string[]> = {
  NURSERY: [...NURSERY_SUBJECTS],
  KG: [...KG_SUBJECTS],
  EARLY: [
    "Language & Literacy",
    "Numeracy",
    "Our World Our People",
    "Creative Arts",
    "Physical Education",
    "Religious & Moral Education",
  ],
  PRIMARY: [
    "English Language",
    "Mathematics",
    "Science",
    "Our World Our People",
    "Religious & Moral Education",
    "History",
    "Creative Arts",
    "Computing",
    "Ghanaian Language",
    "French",
    "Physical Education",
  ],
  JHS: [
    "English Language",
    "Mathematics",
    "Integrated Science",
    "Social Studies",
    "Religious & Moral Education",
    "Ghanaian Language",
    "French",
    "Career Technology",
    "Computing",
    "Creative Arts & Design",
    "Physical Education",
  ],
};

export function bandForClass(name: string): keyof typeof GES_SUBJECTS {
  const n = name.toLowerCase();
  if (n.includes("jhs")) return "JHS";
  if (n.includes("primary")) return "PRIMARY";
  if (n.includes("kg") || n.includes("kindergarten")) return "KG";
  if (n.includes("nursery")) return "NURSERY";
  return "EARLY";
}

export function nextClass(name: string): { next: string; graduated: boolean } {
  const i = (GHANA_CLASS_LEVELS as readonly string[]).indexOf(name);
  if (i < 0) return { next: name, graduated: false };
  if (i >= GHANA_CLASS_LEVELS.length - 1) return { next: name, graduated: true };
  return { next: GHANA_CLASS_LEVELS[i + 1], graduated: false };
}

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Labels on the DIS feeding/bus paper sheet. */
export const WEEKDAY_SHORT = ["MON", "TUE", "WED", "THUR", "FRI"] as const;

export function mondayOf(iso?: string): string {
  const src = (iso || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const [y, m, d] = src.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0));
  const dow = dt.getUTCDay();
  const shift = dow === 0 ? -6 : 1 - dow;
  dt.setUTCDate(dt.getUTCDate() + shift);
  return dt.toISOString().slice(0, 10);
}

export function weekDayIsos(monday: string): string[] {
  const start = mondayOf(monday);
  const [y, m, d] = start.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const dt = new Date(Date.UTC(y, m - 1, d + i, 12, 0, 0));
    out.push(dt.toISOString().slice(0, 10));
  }
  return out;
}

export function shiftMonday(monday: string, weeks: number): string {
  const start = mondayOf(monday);
  const [y, m, d] = start.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + weeks * 7, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

/** Week number within the GES term (1st = Sep, 2nd = Jan, 3rd = May). */
export function termWeekNo(iso: string): number {
  const stamp = (iso || "").slice(0, 10);
  const term = termFromDate(stamp);
  const y = Number(stamp.slice(0, 4)) || new Date().getFullYear();
  const month = Number(stamp.slice(5, 7)) || 1;
  let start: string;
  if (term === "1st Term") start = `${month >= 9 ? y : y - 1}-09-01`;
  else if (term === "3rd Term") start = `${y}-05-01`;
  else start = `${y}-01-07`;
  const a = Date.parse(`${mondayOf(start)}T12:00:00Z`);
  const b = Date.parse(`${mondayOf(stamp)}T12:00:00Z`);
  return Math.max(1, Math.round((b - a) / 86400000 / 7) + 1);
}

export function formatDayShort(iso: string): string {
  const [y, m, d] = (iso || "").split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** School order (Creche → JHS 3), then A–Z for anything else. */
export function sortClass(a: string, b: string) {
  const ia = (GHANA_CLASS_LEVELS as readonly string[]).indexOf(a);
  const ib = (GHANA_CLASS_LEVELS as readonly string[]).indexOf(b);
  if (ia >= 0 && ib >= 0) return ia - ib;
  if (ia >= 0) return -1;
  if (ib >= 0) return 1;
  return sortAlpha(a, b);
}

export const PERIODS = [
  { n: 1, start: "08:00", end: "08:40" },
  { n: 2, start: "08:40", end: "09:20" },
  { n: 3, start: "09:20", end: "10:00" },
  { n: 4, start: "10:20", end: "11:00" },
  { n: 5, start: "11:00", end: "11:40" },
  { n: 6, start: "11:40", end: "12:20" },
  { n: 7, start: "13:00", end: "13:40" },
  { n: 8, start: "13:40", end: "14:20" },
] as const;

export const ROLES = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "ACCOUNTANT",
  "TEACHER",
  "SERVICE_OFFICER",
  "PARENT",
] as const;

export type StaffRole = (typeof ROLES)[number];

export const ROLE_LABEL: Record<StaffRole, string> = {
  SUPER_ADMIN: "Super Admin",
  SCHOOL_ADMIN: "School Admin",
  ACCOUNTANT: "Accountant",
  TEACHER: "Teacher",
  SERVICE_OFFICER: "Service Officer",
  PARENT: "Parent / guardian",
};

export const EXPENSE_CATEGORIES = [
  "Maintenance",
  "Staff allowance",
  "Utilities",
  "Power",
  "GRA tax",
  "SSNIT",
  "Other",
] as const;

export function formatGhs(n: number): string {
  return `GH₵ ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

/** GES class score (SBA) vs end-of-term exam. */
export const GES_SBA_KINDS = [
  "Class test",
  "Quiz",
  "Homework",
  "Project",
  "Oral",
  "Practical",
] as const;

export const GES_EXAM_KINDS = ["Mid-term exam", "End of term exam"] as const;

export function isGesExam(kind: string) {
  const k = (kind || "").toLowerCase();
  return k.includes("exam") || k.includes("end of term") || k.includes("mid-term");
}

/** Official GES mix: 30% class score + 70% end-of-term exam. */
export function gesTermTotal(sba: number | null, exam: number | null): number | null {
  if (sba == null && exam == null) return null;
  if (sba != null && exam != null) return Math.round((0.3 * sba + 0.7 * exam) * 10) / 10;
  return sba != null ? sba : exam;
}

/** BECE / JHS stanine 1 (highest) – 9 (fail). */
export function gesStanine(score: number): { grade: number; remark: string } {
  if (score >= 80) return { grade: 1, remark: "Highest" };
  if (score >= 75) return { grade: 2, remark: "Higher" };
  if (score >= 70) return { grade: 3, remark: "High" };
  if (score >= 65) return { grade: 4, remark: "High average" };
  if (score >= 60) return { grade: 5, remark: "Average" };
  if (score >= 55) return { grade: 6, remark: "Low average" };
  if (score >= 50) return { grade: 7, remark: "Low" };
  if (score >= 40) return { grade: 8, remark: "Lower" };
  return { grade: 9, remark: "Lowest (fail)" };
}

export function gesPrimaryRemark(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 70) return "Very Good";
  if (score >= 60) return "Good";
  if (score >= 50) return "Credit";
  if (score >= 40) return "Pass";
  return "Fail";
}

/** NaCCA KG / Nursery 4-point scale. */
export function gesKgLevel(score: number): string {
  if (score >= 80) return "Exceeding";
  if (score >= 60) return "Proficient";
  if (score >= 40) return "Developing";
  return "Beginning";
}

export function gesLabelForClass(className: string, score: number): { code: string; remark: string } {
  const band = bandForClass(className);
  if (band === "JHS") {
    const s = gesStanine(score);
    return { code: String(s.grade), remark: s.remark };
  }
  if (band === "NURSERY" || band === "KG" || band === "EARLY") {
    const level = gesKgLevel(score);
    return { code: level, remark: level };
  }
  return { code: gesPrimaryRemark(score), remark: gesPrimaryRemark(score) };
}

export const GES_CONDUCT = ["Excellent", "Very Good", "Good", "Fair", "Poor"] as const;
