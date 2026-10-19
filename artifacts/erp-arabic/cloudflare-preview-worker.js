const ORIGIN = "https://jefer-mkgh.com";
const HEALTH_PATH = "/api/healthz";

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event));
});

async function handleRequest(event) {
  const request = event.request;
  const incoming = new URL(request.url);

  if (incoming.pathname.startsWith("/api/")) {
    if (
      incoming.pathname !== HEALTH_PATH ||
      (request.method !== "GET" && request.method !== "HEAD")
    ) {
      return new Response("This preview only exposes the read-only health check.", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }

    return fetch(new URL(HEALTH_PATH, ORIGIN), {
      method: request.method,
      headers: { Accept: "application/json" },
      redirect: "manual",
    });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Read-only preview.", {
      status: 405,
      headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" },
    });
  }

  const target = new URL(`${incoming.pathname}${incoming.search}`, ORIGIN);
  const isHashedAsset =
    incoming.pathname.startsWith("/assets/") &&
    /\.[a-f0-9_-]{6,}\./i.test(incoming.pathname);

  if (isHashedAsset && request.method === "GET") {
    const cache = caches.default;
    const cacheKey = new Request(target.toString(), { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set("X-ERP-Preview-Cache", "HIT");
      return new Response(cached.body, { status: cached.status, headers });
    }

    const upstream = await fetch(target, {
      headers: { Accept: request.headers.get("Accept") ?? "*/*" },
      cf: { cacheTtl: 31536000, cacheEverything: true },
    });
    if (upstream.ok && !upstream.headers.has("Set-Cookie")) {
      const headers = new Headers(upstream.headers);
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      headers.set("X-ERP-Preview-Cache", "MISS");
      const response = new Response(upstream.body, {
        status: upstream.status,
        headers,
      });
      event.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    }
    return upstream;
  }

  return fetch(target, {
    method: request.method,
    headers: { Accept: request.headers.get("Accept") ?? "*/*" },
    redirect: "manual",
  });
}
