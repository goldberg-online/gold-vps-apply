import { clientIp, decideShield } from "../shield-core";

interface ShieldEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

function apply(headers: Headers, extra: Record<string, string>) {
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  headers.delete("x-powered-by");
  headers.delete("server");
}

export default async function shieldMiddleware(
  event: ShieldEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const host =
    event.req.headers.get("x-forwarded-host") ?? event.req.headers.get("host") ?? event.url.host;
  const decision = decideShield({
    method: event.req.method ?? "GET",
    pathname: event.url.pathname,
    ua: event.req.headers.get("user-agent") || "",
    host,
    ip: clientIp(event.req.headers),
  });

  if (decision.kind === "respond") {
    return new Response(decision.body, { status: decision.status, headers: decision.headers });
  }

  const result = await next();
  if (result instanceof Response) {
    const headers = new Headers(result.headers);
    apply(headers, decision.headers);
    return new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
      headers,
    });
  }
  return result;
}
