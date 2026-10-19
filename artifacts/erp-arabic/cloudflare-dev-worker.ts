interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  ERP_API_ORIGIN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const incomingUrl = new URL(request.url);

    if (incomingUrl.pathname.startsWith("/api/")) {
      const apiOrigin = new URL(env.ERP_API_ORIGIN);
      apiOrigin.pathname = incomingUrl.pathname;
      apiOrigin.search = incomingUrl.search;

      return fetch(new Request(apiOrigin, request));
    }

    return env.ASSETS.fetch(request);
  },
};
