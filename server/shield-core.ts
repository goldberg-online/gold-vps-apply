/** DIS ONLINE perimeter — keep office pages off crawlers, scanners, and embedders. */

const PROBE =
  /(\.git|\.env|\.svn|\.htaccess|\.ds_store|\.aws|\.vscode|\.idea|wp-admin|wp-login|xmlrpc\.php|phpmyadmin|server-status|actuator|cgi-bin|vendor\/phpunit|phpinfo|debug\/default|__profiler|telescope|horizon|\.well-known\/acme-challenge\/x)/i;

const PROBE_EXT = /\.(map|sql|bak|old|orig|swp|swo|tar|gz|zip|7z|rar|tgz)$/i;

const SCANNER =
  /GPTBot|ChatGPT-User|Google-Extended|CCBot|anthropic-ai|ClaudeBot|Claude-Web|Bytespider|PerplexityBot|Amazonbot|Applebot-Extended|meta-externalagent|FacebookBot|Diffbot|ImagesiftBot|YouBot|DataForSeoBot|SemrushBot|AhrefsBot|MJ12bot|DotBot|PetalBot|Seekport|BLEXBot|sqlmap|nikto|nuclei|wpscan|dirbuster|masscan|zgrab|nmap\s|fuzz\b|python-requests|Go-http-client|libwww-perl|scrapy|wget\//i;

const loginHits = new Map<string, { n: number; reset: number }>();

export function clientIp(headers: { get(name: string): string | null }): string {
  const fwd = headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0]?.trim() || headers.get("x-real-ip") || "";
  return ip || "unknown";
}

export function isPreviewHost(host: string): boolean {
  const h = (host || "").toLowerCase();
  return (
    h.includes("grok-sandbox.com") ||
    h.startsWith("localhost") ||
    h.startsWith("127.0.0.1") ||
    h.startsWith("[::1]")
  );
}

export function isProbePath(pathname: string, preview = false): boolean {
  const p = pathname || "/";
  if (p === "/robots.txt" || p === "/favicon.svg" || p === "/favicon.ico") return false;
  if (preview) {
    if (p.startsWith("/src/") || p.startsWith("/@") || p.startsWith("/node_modules") || p.startsWith("/app")) return false;
  }
  if (PROBE.test(p)) return true;
  if (PROBE_EXT.test(p)) return true;
  if (!preview && (p.startsWith("/src/") || p.startsWith("/node_modules/") || p.startsWith("/server/"))) return true;
  return false;
}

export function isScannerUA(ua: string): boolean {
  if (!ua) return false;
  return SCANNER.test(ua);
}

export function robotsBody(): string {
  return `User-agent: *
Disallow: /

User-agent: GPTBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: anthropic-ai
Disallow: /

User-agent: Bytespider
Disallow: /

User-agent: PerplexityBot
Disallow: /

User-agent: Amazonbot
Disallow: /
`;
}

export function shieldHeaders(preview: boolean): Record<string, string> {
  const frame = preview
    ? "https://grok.com https://*.grok.com http://localhost:8080 http://127.0.0.1:8080"
    : "'none'";
  const connect = preview
    ? "'self' ws: wss: http://127.0.0.1:8080 http://localhost:8080 ws://127.0.0.1:8080 ws://localhost:8080 https://grok.com https://*.grok.com"
    : "'self'";
  const script = preview
    ? "'self' 'unsafe-inline' 'unsafe-eval' blob: http://127.0.0.1:8080 http://localhost:8080 https://grok.com https://*.grok.com"
    : "'self' 'unsafe-inline' 'unsafe-eval'";
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-ancestors " + frame,
    "script-src " + script,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src " + connect,
    "worker-src 'self' blob:",
  ].join("; ");
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet, noai, noimageai",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    "X-DNS-Prefetch-Control": "off",
    "X-Permitted-Cross-Domain-Policies": "none",
    "Content-Security-Policy": csp,
  };
  if (!preview) headers["X-Frame-Options"] = "DENY";
  return headers;
}

export function allowLoginAttempt(ip: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const max = 20;
  const row = loginHits.get(ip);
  if (!row || now > row.reset) {
    loginHits.set(ip, { n: 1, reset: now + windowMs });
    return { ok: true };
  }
  row.n += 1;
  if (row.n > max) return { ok: false, retryAfter: Math.ceil((row.reset - now) / 1000) };
  return { ok: true };
}

export function isLoginPost(pathname: string, method: string): boolean {
  if (method !== "POST") return false;
  return (
    pathname.startsWith("/api/auth/sign-in") ||
    pathname.startsWith("/api/auth/sign-up") ||
    pathname.startsWith("/api/auth/forget-password") ||
    pathname.startsWith("/api/auth/reset-password")
  );
}

export type ShieldDecision =
  | { kind: "next"; headers: Record<string, string> }
  | { kind: "respond"; status: number; headers: Record<string, string>; body: string };

export function decideShield(opts: {
  method: string;
  pathname: string;
  ua: string;
  host: string;
  ip: string;
}): ShieldDecision {
  const preview = isPreviewHost(opts.host);
  const headers = shieldHeaders(preview);
  const method = (opts.method || "GET").toUpperCase();
  const path = opts.pathname || "/";

  if (path === "/robots.txt") {
    return {
      kind: "respond",
      status: 200,
      headers: { ...headers, "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      body: robotsBody(),
    };
  }

  if (isProbePath(path, preview)) {
    return {
      kind: "respond",
      status: 404,
      headers: { ...headers, "content-type": "text/plain; charset=utf-8" },
      body: "Not found",
    };
  }

  if (isScannerUA(opts.ua) && !preview) {
    return {
      kind: "respond",
      status: 404,
      headers: { ...headers, "content-type": "text/plain; charset=utf-8" },
      body: "Not found",
    };
  }

  if (isLoginPost(path, method)) {
    const lim = allowLoginAttempt(opts.ip);
    if (!lim.ok) {
      return {
        kind: "respond",
        status: 429,
        headers: {
          ...headers,
          "content-type": "text/plain; charset=utf-8",
          "retry-after": String(lim.retryAfter),
        },
        body: "Too many sign-in tries. Wait and try again.",
      };
    }
  }

  return { kind: "next", headers };
}
