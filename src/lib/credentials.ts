/** Strip WhatsApp/phone paste junk so issued logins work on phones and desktops. */
export function cleanEmail(raw: string) {
  return unwrap(raw).toLowerCase();
}

export function cleanPassword(raw: string) {
  return unwrap(raw);
}

export function phoneSafePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let out = "DIS";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export function inAppBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/WhatsApp|FBAN|FBAV|Instagram|Line\/|Twitter|Snapchat|MicroMessenger/i.test(ua)) return true;
  if (/Android/i.test(ua) && /; wv\)/i.test(ua)) return true;
  return false;
}

export function loginErrorMessage(raw: string) {
  const m = (raw || "").toLowerCase();
  if (m.includes("origin") || m.includes("forbidden") || m.includes("csrf")) {
    return "This phone opened the site inside another app (often WhatsApp). Tap the menu and choose Open in Chrome or Safari, then sign in again.";
  }
  if (m.includes("too many") || m.includes("429") || m.includes("rate")) {
    return "Too many sign-in tries from this phone or computer. Wait 15 minutes, then try again.";
  }
  if (
    m.includes("invalid") ||
    m.includes("password") ||
    m.includes("credential") ||
    m.includes("unauthorized") ||
    m.includes("wrong")
  ) {
    return "That email or password does not match the login that was issued. If you pasted from WhatsApp, watch for an extra space at the end.";
  }
  return raw || "Could not sign in";
}

function unwrap(raw: string) {
  let s = String(raw ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[\r\n\t]+/g, "")
    .trim();
  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ["\u201c", "\u201d"],
    ["\u2018", "\u2019"],
    ["«", "»"],
    ["“", "”"],
  ];
  for (const [a, b] of pairs) {
    if (s.startsWith(a) && s.endsWith(b) && s.length > 2) {
      s = s.slice(a.length, s.length - b.length).trim();
      break;
    }
  }
  return s;
}
