export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function error(status: number, message: string): Response {
  return json({ error: message }, { status });
}

export type Params = Record<string, string>;
export type Handler = (request: Request, params: Params, url: URL) => Response | Promise<Response>;

interface Route {
  method: string;
  parts: string[];
  handler: Handler;
}

const routes: Route[] = [];

/** Register a handler. Pattern segments starting with ":" capture a path parameter. */
export function addRoute(method: string, pattern: string, handler: Handler): void {
  routes.push({ method, parts: pattern.split("/").filter(Boolean), handler });
}

function match(r: Route, method: string, segs: string[]): Params | null {
  if (r.method !== method || r.parts.length !== segs.length) return null;
  const params: Params = {};
  for (let i = 0; i < segs.length; i++) {
    const p = r.parts[i];
    if (p.startsWith(":")) {
      try {
        params[p.slice(1)] = decodeURIComponent(segs[i]);
      } catch {
        return null;
      }
    } else if (p !== segs[i]) return null;
  }
  return params;
}

export async function route(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const segs = url.pathname.split("/").filter(Boolean);
  for (const r of routes) {
    const params = match(r, request.method, segs);
    if (!params) continue;
    try {
      return await r.handler(request, params, url);
    } catch (e) {
      console.error("unhandled error in route handler:", e instanceof Error ? e.name : "unknown");
      return error(500, "internal error");
    }
  }
  return error(404, "not found");
}
